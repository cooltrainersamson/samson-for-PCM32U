// Mode 0x23 ReadMemoryByAddress client. PCM32U answers 4 data bytes per
// request (J1850 VPW frame limit: 12 bytes on wire = 3 header + SID + 3
// address + 4 data + CRC). Known-working live on DNYY — see
// rodeoecu/pcm32u_dump_svc23.py for the reference Python implementation.
//
// Chunks a larger window into requests of `chunkSize` bytes each, with
// progress callbacks so the UI can drive a progress bar during the full
// flash dump. Retries each chunk once on transient errors before surfacing.

import { ElmDriver } from "../elm327/driver";
import { KwpNegativeError } from "../elm327/nrc";
import { TransportError } from "../transport/types";

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
  const ah = (addr >>> 16) & 0xff;
  const am = (addr >>> 8) & 0xff;
  const al = addr & 0xff;
  const frames = await driver.sendKwp([0x23, ah, am, al, size]);
  const f = frames[0]!;
  if (f.sid !== 0x63) {
    throw new TransportError(
      `Unexpected RMBA response SID 0x${f.sid.toString(16)} for address 0x${addr.toString(16)}`,
      "The ECU answered with something other than the expected positive Mode 0x23 response (SID 0x63). This usually means the ECU is mid-session-swap or the frame was corrupted.",
      "Retry the read. If it keeps happening, verify the unlock is still valid.",
    );
  }
  // data layout: [0x63, AH, AM, AL, d0, d1, d2, d3]
  return f.data.slice(3, 3 + size);
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
