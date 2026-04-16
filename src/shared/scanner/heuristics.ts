// Structural pattern detection for PCM32U flash windows.
//
// These are intentionally *generic* — they don't know anything about the
// ECU. They just surface "this region has structure" candidates so the
// higher-level finders (broadcast.ts, dtc.ts, report.ts) can filter and
// interpret them. The job is to make the project owner's table-hunting
// work easier, not to pre-interpret everything.
//
// All inputs take a byte window and an absolute `baseAddr` so candidate
// offsets come out as real ECU addresses, not relative offsets.

export interface ScannedRegion {
  readonly startAddr: number;
  readonly endAddr: number;
  readonly bytes: Uint8Array;
  readonly baseAddr: number;
  readonly length: number;
}

export function regionOf(bytes: Uint8Array, baseAddr: number): ScannedRegion {
  return {
    startAddr: baseAddr,
    endAddr: baseAddr + bytes.length,
    bytes,
    baseAddr,
    length: bytes.length,
  };
}

// ── ASCII runs ────────────────────────────────────────────────────────

export interface AsciiRun {
  readonly addr: number;
  readonly length: number;
  readonly text: string;
}

const PRINTABLE_MIN = 0x20;
const PRINTABLE_MAX = 0x7e;

function isPrintable(b: number): boolean {
  return b >= PRINTABLE_MIN && b <= PRINTABLE_MAX;
}

/**
 * Find runs of printable ASCII at least `minLength` bytes long. Useful
 * for locating broadcast codes (4 chars), cal IDs, and stray strings
 * the project owner hasn't catalogued yet.
 */
export function findAsciiRuns(
  region: ScannedRegion,
  minLength = 4,
): AsciiRun[] {
  const out: AsciiRun[] = [];
  const { bytes, baseAddr } = region;
  let runStart = -1;
  for (let i = 0; i <= bytes.length; i++) {
    const b = i < bytes.length ? bytes[i]! : -1;
    if (b >= 0 && isPrintable(b)) {
      if (runStart < 0) runStart = i;
    } else {
      if (runStart >= 0) {
        const len = i - runStart;
        if (len >= minLength) {
          const text = Array.from(bytes.slice(runStart, i))
            .map((x) => String.fromCharCode(x))
            .join("");
          out.push({
            addr: baseAddr + runStart,
            length: len,
            text,
          });
        }
        runStart = -1;
      }
    }
  }
  return out;
}

// ── DTC-enable-byte clusters ──────────────────────────────────────────

export interface EnableByteCandidate {
  readonly addr: number;
  readonly byte: number;
  /** true if bit 7 set AND the low 5 bits look like a plausible "index" field */
  readonly looksLikeEnable: boolean;
  readonly nearbyCount: number;
}

/**
 * Locate bytes with bit 7 set (the DTC "enable" flag) that cluster with
 * other bit-7-set bytes in a small window. PCM32U DTC tables tend to
 * have 10+ enable bytes in a ~200 byte range; lone bit-7 bytes are
 * usually coincidence.
 */
export function findEnableByteCandidates(
  region: ScannedRegion,
  clusterWindow = 64,
  minCluster = 3,
): EnableByteCandidate[] {
  const { bytes, baseAddr } = region;
  const marks: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    // Heuristic: top two bits set (0xC0, 0xE0, 0xA0, 0x80..0xBF). These
    // are the empirically-observed DTC enable byte shapes on DNYY.
    if ((b & 0x80) !== 0 && (b & 0x1f) === 0) {
      marks.push(i);
    }
  }
  const out: EnableByteCandidate[] = [];
  for (const idx of marks) {
    let nearby = 0;
    for (const other of marks) {
      if (Math.abs(other - idx) <= clusterWindow) nearby++;
    }
    if (nearby >= minCluster) {
      out.push({
        addr: baseAddr + idx,
        byte: bytes[idx]!,
        looksLikeEnable: true,
        nearbyCount: nearby,
      });
    }
  }
  return out;
}

// ── Stride detection (lookup tables) ──────────────────────────────────

export interface StrideCandidate {
  readonly addr: number;
  readonly length: number;
  readonly stride: number;
  readonly score: number;
}

/**
 * Detect regions whose byte-to-byte differences are *small and bounded*
 * over a sliding window — the signature of a calibration lookup table
 * (monotonic-ish curves) or an evenly-spaced descriptor table. Reports
 * the best stride/length/score triples.
 *
 * Score = 1.0 means "every delta within ±maxDelta"; lower means noisier.
 */
export function findStrideCandidates(
  region: ScannedRegion,
  windowSize = 32,
  maxDelta = 16,
): StrideCandidate[] {
  const { bytes, baseAddr } = region;
  if (bytes.length < windowSize + 2) return [];
  const out: StrideCandidate[] = [];
  let i = 0;
  while (i < bytes.length - windowSize) {
    let good = 0;
    for (let j = 1; j < windowSize; j++) {
      const d = Math.abs(bytes[i + j]! - bytes[i + j - 1]!);
      if (d <= maxDelta) good++;
    }
    const score = good / (windowSize - 1);
    if (score >= 0.85) {
      // extend as long as the delta condition holds
      let end = i + windowSize;
      while (end < bytes.length) {
        const d = Math.abs(bytes[end]! - bytes[end - 1]!);
        if (d > maxDelta) break;
        end++;
      }
      out.push({
        addr: baseAddr + i,
        length: end - i,
        stride: 1,
        score,
      });
      i = end;
    } else {
      i++;
    }
  }
  return out;
}

// ── 32-bit-aligned pointer clusters ───────────────────────────────────

export interface PointerCluster {
  readonly addr: number;
  readonly length: number;
  /** Range of the dereferenced addresses. Small range = likely a pointer table. */
  readonly target_lo: number;
  readonly target_hi: number;
}

/**
 * Scan for 4-aligned sequences of big-endian 32-bit values that all
 * fall into the same 64 KB page — the signature of a PCM32U pointer
 * table (e.g. the DTC descriptor table at 0x67358 holds pointers into
 * the same flash region).
 */
export function findPointerClusters(
  region: ScannedRegion,
  minLength = 8,
): PointerCluster[] {
  const { bytes, baseAddr } = region;
  if (bytes.length < minLength * 4) return [];
  const out: PointerCluster[] = [];
  let i = 0;
  while (i + 4 < bytes.length) {
    // Only start on 4-aligned absolute addresses
    if (((baseAddr + i) & 3) !== 0) {
      i++;
      continue;
    }
    const values: number[] = [];
    let j = i;
    while (j + 3 < bytes.length) {
      const v =
        (bytes[j]! << 24) |
        (bytes[j + 1]! << 16) |
        (bytes[j + 2]! << 8) |
        bytes[j + 3]!;
      values.push(v >>> 0);
      j += 4;
    }
    // Sliding window: keep extending while all values share a common
    // top 16 bits (same 64 KB page).
    if (values.length < minLength) break;
    const firstPage = values[0]! >>> 16;
    // Reject the 0x0000 page — that's either all-zero filler or the
    // 68332 trap vector table, not pointers the ECU exposes via RMBA.
    if (firstPage === 0) {
      i += 4;
      continue;
    }
    let k = 1;
    while (k < values.length && (values[k]! >>> 16) === firstPage) k++;
    if (k >= minLength) {
      const window = values.slice(0, k);
      out.push({
        addr: baseAddr + i,
        length: k * 4,
        target_lo: Math.min(...window),
        target_hi: Math.max(...window),
      });
      i += k * 4;
    } else {
      i += 4;
    }
  }
  return out;
}

// ── Null / 0xFF fill detection ───────────────────────────────────────

export interface FillSpan {
  readonly addr: number;
  readonly length: number;
  readonly fillByte: number;
}

/**
 * Find large spans of a single repeating byte. Useful for ruling out
 * erased flash (0xFF) and unused padding (0x00) so those ranges don't
 * get reported as "interesting candidates".
 */
export function findFillSpans(
  region: ScannedRegion,
  minLength = 16,
): FillSpan[] {
  const { bytes, baseAddr } = region;
  const out: FillSpan[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i]!;
    let j = i + 1;
    while (j < bytes.length && bytes[j] === b) j++;
    const len = j - i;
    if (len >= minLength) {
      out.push({
        addr: baseAddr + i,
        length: len,
        fillByte: b,
      });
    }
    i = j;
  }
  return out;
}
