// Frame-level helpers for ELM327 / J1850 VPW.
//
// The ELM327 returns one or more frames per response, each as a line of
// space-separated hex bytes followed by CR, terminated by a '>' prompt.
// With ATH1, each line is a full J1850 frame: <pri> <dest> <src> <SID> <data...> <CRC>.

export interface KwpFrame {
  readonly raw: string;
  readonly bytes: readonly number[];
  readonly priority: number;
  readonly dest: number;
  readonly source: number;
  readonly sid: number;
  readonly data: readonly number[];
  readonly crc: number;
}

export function parseHexLine(line: string): number[] | null {
  const cleaned = line.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (!/^[0-9A-Fa-f ]+$/.test(cleaned)) return null;
  const parts = cleaned.split(" ");
  const bytes: number[] = [];
  for (const p of parts) {
    if (p.length !== 2) return null;
    const v = parseInt(p, 16);
    if (Number.isNaN(v)) return null;
    bytes.push(v);
  }
  return bytes;
}

/**
 * Split the raw text coming back from the ELM between a write and the
 * next '>' prompt into individual lines. Drops the prompt, echoes, and
 * status strings that are not hex frames (e.g. "OK", "SEARCHING...").
 */
export function splitElmResponse(raw: string): {
  lines: string[];
  statuses: string[];
} {
  const trimmed = raw.replace(/\r/g, "\n").replace(/>\s*$/, "");
  const rawLines = trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const lines: string[] = [];
  const statuses: string[] = [];
  for (const l of rawLines) {
    if (/^[0-9A-Fa-f ]+$/.test(l) && l.includes(" ")) {
      lines.push(l);
    } else if (/^[0-9A-Fa-f]+$/.test(l) && l.length % 2 === 0) {
      // single-word hex (rare for J1850 with ATH1 on, but possible for ATI replies)
      lines.push(l);
    } else {
      statuses.push(l);
    }
  }
  return { lines, statuses };
}

export function parseJ1850Frame(line: string): KwpFrame | null {
  const bytes = parseHexLine(line);
  if (!bytes || bytes.length < 5) return null;
  // With ATH1: [pri, dest, src, SID, ...data, CRC]
  // We tolerate frames without CRC (some adapters strip it after validation).
  // Minimum: pri, dest, src, SID = 4 bytes.
  const priority = bytes[0]!;
  const dest = bytes[1]!;
  const source = bytes[2]!;
  const sid = bytes[3]!;
  // If the last byte looks like a plausible CRC (no way to verify without
  // the J1850 polynomial, so we just treat it as tail) and the frame has
  // >= 5 bytes, split data / crc. Otherwise data = rest, crc = 0.
  let data: number[];
  let crc: number;
  if (bytes.length >= 5) {
    data = bytes.slice(4, -1);
    crc = bytes[bytes.length - 1]!;
  } else {
    data = [];
    crc = 0;
  }
  return {
    raw: line,
    bytes,
    priority,
    dest,
    source,
    sid,
    data,
    crc,
  };
}

export function toHexString(bytes: Uint8Array | number[]): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
    .join(" ");
}

export function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.replace(/\s+/g, "");
  if (cleaned.length % 2 !== 0) {
    throw new Error(`odd-length hex string: ${JSON.stringify(hex)}`);
  }
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(cleaned.substr(i * 2, 2), 16);
  }
  return out;
}
