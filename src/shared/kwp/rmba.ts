// Mode 0x23 ReadMemoryByAddress client. Two PCM32U dialects observed:
//
//   * "dnyy" — request `23 AH AM AL SIZE` with SIZE up to 4. Response
//     `63 AH AM AL d0 d1 d2 d3` (header echoes full 3-byte address).
//     Reference: rodeoecu/pcm32u_dump_svc23.py, live-verified on DNYY.
//
//   * "axiom" — observed on Isuzu Axiom 3.5L AT (broadcast DRDX). The
//     ECU rejects any SIZE > 1 with NRC 0x12 (subFunctionNotSupported),
//     and its negative responses use the GM extended format that echoes
//     the request params before the NRC. Positive response shape is
//     `63 AM AL d0 d1 d2 d3` — a 2-byte address echo, and 4 sequential
//     bytes of memory regardless of the (size=1) byte we sent. So on
//     this dialect we always pull 4 bytes per round-trip too.
//
// Either way we get 4 bytes per round-trip on the wire. The dialect is
// auto-detected on the first read against a given driver and cached.

import { ElmDriver } from "../elm327/driver";
import { KwpNegativeError } from "../elm327/nrc";
import { TransportError } from "../transport/types";

export type RmbaFlavor = "dnyy" | "axiom";

const flavorCache = new WeakMap<ElmDriver, RmbaFlavor>();

/** Test-only: clear the per-driver flavor cache so a fresh probe re-detects. */
export function _resetRmbaFlavorCache(driver: ElmDriver): void {
  flavorCache.delete(driver);
}

/** Inspect the cached dialect for a driver, or `null` if not yet detected. */
export function getRmbaFlavor(driver: ElmDriver): RmbaFlavor | null {
  return flavorCache.get(driver) ?? null;
}

export interface ReadMemoryOptions {
  readonly chunkSize?: number;
  readonly onProgress?: (done: number, total: number) => void;
  readonly retryPerChunk?: number;
}

export interface ReadMemoryResult {
  readonly startAddr: number;
  readonly bytes: Uint8Array;
  readonly chunksRead: number;
  readonly retriesUsed: number;
  readonly durationMs: number;
}

const DEFAULT_CHUNK = 4;

export async function readMemory(
  driver: ElmDriver,
  startAddr: number,
  length: number,
  opts: ReadMemoryOptions = {},
): Promise<ReadMemoryResult> {
  const chunk = opts.chunkSize ?? DEFAULT_CHUNK;
  const maxRetry = opts.retryPerChunk ?? 1;
  if (chunk <= 0 || chunk > 4) {
    throw new Error(
      `readMemory: chunkSize must be in 1..4 (the J1850 VPW frame limit enforces 4 bytes max). Got ${chunk}.`,
    );
  }
  const out = new Uint8Array(length);
  const t0 = Date.now();
  let retries = 0;
  let chunksRead = 0;
  let offset = 0;
  while (offset < length) {
    const want = Math.min(chunk, length - offset);
    const addr = startAddr + offset;
    let lastErr: unknown = null;
    let gotBytes: number[] | null = null;
    for (let attempt = 0; attempt <= maxRetry; attempt++) {
      try {
        gotBytes = await readChunk(driver, addr, want);
        break;
      } catch (err) {
        lastErr = err;
        if (err instanceof KwpNegativeError && err.nrc.code === 0x11) {
          // serviceNotSupported — retry will not help
          throw err;
        }
        if (err instanceof KwpNegativeError && err.nrc.code === 0x31) {
          // address out of range — retry won't help
          throw new RangeReadError(addr, want, err);
        }
        if (attempt < maxRetry) {
          retries++;
          continue;
        }
      }
    }
    if (!gotBytes) {
      throw lastErr instanceof Error
        ? lastErr
        : new TransportError(
            `readMemory failed at 0x${addr.toString(16)}`,
            "Memory read failed after all retries were exhausted. This is typically a transient adapter/ECU timing issue.",
            "Retry the scan; if the same address fails twice, it may be an unmapped region.",
          );
    }
    for (let i = 0; i < gotBytes.length; i++) {
      out[offset + i] = gotBytes[i]!;
    }
    offset += gotBytes.length;
    chunksRead++;
    opts.onProgress?.(offset, length);
  }
  return {
    startAddr,
    bytes: out,
    chunksRead,
    retriesUsed: retries,
    durationMs: Date.now() - t0,
  };
}

async function readChunk(
  driver: ElmDriver,
  addr: number,
  size: number,
): Promise<number[]> {
  const cached = flavorCache.get(driver);
  if (cached) {
    return readChunkAs(driver, addr, size, cached);
  }
  // First read against this driver — try the legacy DNYY dialect first.
  // If the ECU rejects size>1 with NRC 0x12, switch to the Axiom dialect
  // and retry. Cache whichever wins so future chunks skip the probe.
  try {
    const out = await readChunkAs(driver, addr, size, "dnyy");
    flavorCache.set(driver, "dnyy");
    return out;
  } catch (err) {
    if (err instanceof KwpNegativeError && err.nrc.code === 0x12) {
      const out = await readChunkAs(driver, addr, size, "axiom");
      flavorCache.set(driver, "axiom");
      return out;
    }
    throw err;
  }
}

async function readChunkAs(
  driver: ElmDriver,
  addr: number,
  size: number,
  flavor: RmbaFlavor,
): Promise<number[]> {
  const ah = (addr >>> 16) & 0xff;
  const am = (addr >>> 8) & 0xff;
  const al = addr & 0xff;
  // Wire size: dnyy honours the requested size up to 4; axiom rejects any
  // size != 1 but always returns 4 sequential bytes anyway.
  const wireSize = flavor === "axiom" ? 1 : size;
  const frames = await driver.sendKwp([0x23, ah, am, al, wireSize]);
  const f = frames[0]!;
  if (f.sid !== 0x63) {
    throw new TransportError(
      `Unexpected RMBA response SID 0x${f.sid.toString(16)} for address 0x${addr.toString(16)}`,
      "The ECU answered with something other than the expected positive Mode 0x23 response (SID 0x63). This usually means the ECU is mid-session-swap or the frame was corrupted.",
      "Retry the read. If it keeps happening, verify the unlock is still valid.",
    );
  }
  // dnyy:  data = [AH, AM, AL, d0, d1, d2, d3] — 3-byte address echo
  // axiom: data = [AM, AL, d0, d1, d2, d3]     — 2-byte address echo
  const dataStart = flavor === "axiom" ? 2 : 3;
  return [...f.data.slice(dataStart, dataStart + size)];
}

export class RangeReadError extends Error {
  constructor(
    readonly addr: number,
    readonly size: number,
    readonly cause: KwpNegativeError,
  ) {
    super(
      `ECU rejected RMBA at 0x${addr.toString(16).padStart(6, "0")}+${size} with NRC 0x31 (requestOutOfRange). This address is not mapped in the ECU's accessible memory.`,
    );
    this.name = "RangeReadError";
  }
}
