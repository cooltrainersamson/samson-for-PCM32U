// Synthetic DNYY-shaped flash fixture for tests. Populates a sparse map
// with: the DNYY broadcast tag, the full DTC enable region with correct
// default bytes, a calibration-ish pattern for the descriptor table, and
// some plausible filler so the scanners have real-looking input.

import { DTC_DB, DTC_SCAN_RANGE, DESCRIPTOR_TABLE_ADDR, DESCRIPTOR_TABLE_LENGTH } from "./dtcs";
import { KNOWN_BROADCASTS, BROADCAST_SCAN_RANGE } from "./broadcasts";

export interface FixtureOptions {
  readonly broadcast?: keyof typeof KNOWN_BROADCASTS;
  /** Add an extra bit-7-set byte at an unknown offset to test "unknown DTC candidate" detection. */
  readonly extraUnknownDtcAddr?: number;
}

export function createDnyyFixture(opts: FixtureOptions = {}): Map<number, number> {
  const flash = new Map<number, number>();
  const broadcast = opts.broadcast ?? "DNYY";
  const profile = KNOWN_BROADCASTS[broadcast]!;

  // 1) Broadcast tag at configBase - 4 (per handoff §7).
  const tagAddr = profile.configBase - 4;
  for (let i = 0; i < 4; i++) {
    flash.set(tagAddr + i, broadcast.charCodeAt(i));
  }
  // Fill the full broadcast scan range so RMBA reads never fall off the
  // mapped region during tests.
  for (let a = BROADCAST_SCAN_RANGE.start; a < BROADCAST_SCAN_RANGE.end; a++) {
    if (!flash.has(a)) flash.set(a, 0xff);
  }

  // 2) DTC enable region: fill the whole scan range with 0x00 first,
  //    then set known entries to their default bytes.
  for (let a = DTC_SCAN_RANGE.start; a < DTC_SCAN_RANGE.end; a++) {
    flash.set(a, 0x00);
  }
  for (const entry of DTC_DB) {
    flash.set(entry.addr, entry.defaultByte);
  }
  if (opts.extraUnknownDtcAddr !== undefined) {
    flash.set(opts.extraUnknownDtcAddr, 0xe0);
  }

  // 3) Descriptor table region — fill with an arithmetic pattern so the
  //    scanner can test its "this looks like structured data" detector.
  for (let i = 0; i < DESCRIPTOR_TABLE_LENGTH; i++) {
    flash.set(DESCRIPTOR_TABLE_ADDR + i, (i * 3 + 7) & 0xff);
  }

  return flash;
}
