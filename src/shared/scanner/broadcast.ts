import { KNOWN_BROADCASTS, BROADCAST_SCAN_RANGE, type BroadcastProfile } from "../pcm32u/broadcasts";
import { findAsciiRuns, regionOf } from "./heuristics";
import { readMemory } from "../kwp/rmba";
import type { ElmDriver } from "../elm327/driver";

export interface BroadcastScanResult {
  readonly scannedAddr: number;
  readonly scannedLength: number;
  readonly rawBytes: Uint8Array;
  readonly asciiRuns: { addr: number; length: number; text: string }[];
  readonly matched: BroadcastProfile | null;
  readonly matchAddr: number | null;
  /** All 4-char substrings in the window that could plausibly be new broadcasts */
  readonly candidates: { addr: number; text: string }[];
}

/**
 * Read the broadcast scan window via Mode 0x23 and run pattern detection
 * to locate the 4-letter ASCII tag. Returns both the matched known
 * broadcast (if any) and all unknown 4-char candidates, so the project
 * owner can extend KNOWN_BROADCASTS from end-user reports.
 */
export async function scanBroadcast(
  driver: ElmDriver,
): Promise<BroadcastScanResult> {
  const start = BROADCAST_SCAN_RANGE.start;
  const end = BROADCAST_SCAN_RANGE.end;
  const length = end - start;
  const mem = await readMemory(driver, start, length);
  return analyzeBroadcastWindow(mem.bytes, start);
}

export function analyzeBroadcastWindow(
  bytes: Uint8Array,
  baseAddr: number,
): BroadcastScanResult {
  const region = regionOf(bytes, baseAddr);
  const runs = findAsciiRuns(region, 4);

  // Known-broadcast match: any 4-char substring (not just a standalone run)
  // in the window that matches a known code. ASCII may be surrounded by
  // filler, so check every aligned window.
  let matched: BroadcastProfile | null = null;
  let matchAddr: number | null = null;
  for (let i = 0; i + 4 <= bytes.length; i++) {
    const text = String.fromCharCode(bytes[i]!, bytes[i + 1]!, bytes[i + 2]!, bytes[i + 3]!);
    if (KNOWN_BROADCASTS[text]) {
      matched = KNOWN_BROADCASTS[text]!;
      matchAddr = baseAddr + i;
      break;
    }
  }

  // Candidate list: every 4-letter substring that is all-upper-alpha and
  // not matched. The project owner uses these to extend KNOWN_BROADCASTS.
  const candidates: { addr: number; text: string }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i + 4 <= bytes.length; i++) {
    let ok = true;
    for (let k = 0; k < 4; k++) {
      const c = bytes[i + k]!;
      if (c < 0x41 || c > 0x5a) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const text = String.fromCharCode(bytes[i]!, bytes[i + 1]!, bytes[i + 2]!, bytes[i + 3]!);
    if (KNOWN_BROADCASTS[text]) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    candidates.push({ addr: baseAddr + i, text });
  }

  return {
    scannedAddr: baseAddr,
    scannedLength: bytes.length,
    rawBytes: bytes,
    asciiRuns: runs,
    matched,
    matchAddr,
    candidates,
  };
}
