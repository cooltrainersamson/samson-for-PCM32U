import {
  DTC_DB,
  DTC_SCAN_RANGE,
  DESCRIPTOR_TABLE_ADDR,
  DESCRIPTOR_TABLE_LENGTH,
  isDtcEnabled,
  type DtcEntry,
} from "../pcm32u/dtcs";
import { findEnableByteCandidates, regionOf } from "./heuristics";
import { readMemory } from "../kwp/rmba";
import type { ElmDriver } from "../elm327/driver";

export interface KnownDtcState {
  readonly entry: DtcEntry;
  readonly actualByte: number;
  readonly enabled: boolean;
  readonly matchesDefault: boolean;
}

export interface UnknownDtcCandidate {
  readonly addr: number;
  readonly byte: number;
  readonly clusterCount: number;
}

export interface DtcScanResult {
  readonly enableRegion: {
    readonly startAddr: number;
    readonly bytes: Uint8Array;
  };
  readonly descriptorTable: {
    readonly startAddr: number;
    readonly bytes: Uint8Array;
  } | null;
  readonly known: readonly KnownDtcState[];
  readonly unknownCandidates: readonly UnknownDtcCandidate[];
}

export async function scanDtcTables(
  driver: ElmDriver,
  opts: {
    readonly includeDescriptorTable?: boolean;
    readonly onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<DtcScanResult> {
  const start = DTC_SCAN_RANGE.start;
  const end = DTC_SCAN_RANGE.end;
  const length = end - start;
  const mem = await readMemory(driver, start, length, {
    onProgress: opts.onProgress,
  });
  let descriptor: DtcScanResult["descriptorTable"] = null;
  if (opts.includeDescriptorTable) {
    try {
      const d = await readMemory(
        driver,
        DESCRIPTOR_TABLE_ADDR,
        DESCRIPTOR_TABLE_LENGTH,
      );
      descriptor = { startAddr: DESCRIPTOR_TABLE_ADDR, bytes: d.bytes };
    } catch {
      // Descriptor table read failed — not fatal; proceed without it.
      descriptor = null;
    }
  }
  return analyzeDtcWindow(mem.bytes, start, descriptor);
}

export function analyzeDtcWindow(
  bytes: Uint8Array,
  baseAddr: number,
  descriptor: DtcScanResult["descriptorTable"],
): DtcScanResult {
  const region = regionOf(bytes, baseAddr);

  const known: KnownDtcState[] = [];
  for (const entry of DTC_DB) {
    const offset = entry.addr - baseAddr;
    if (offset < 0 || offset >= bytes.length) continue;
    const actual = bytes[offset]!;
    known.push({
      entry,
      actualByte: actual,
      enabled: isDtcEnabled(actual),
      matchesDefault: actual === entry.defaultByte,
    });
  }

  // Unknown candidates: bit-7-set bytes that cluster together but aren't
  // in the known DTC DB. The project owner uses these to extend DTC_DB.
  const knownAddrs = new Set(DTC_DB.map((e) => e.addr));
  const clusters = findEnableByteCandidates(region, 64, 3);
  const unknownCandidates: UnknownDtcCandidate[] = clusters
    .filter((c) => !knownAddrs.has(c.addr))
    .map((c) => ({
      addr: c.addr,
      byte: c.byte,
      clusterCount: c.nearbyCount,
    }));

  return {
    enableRegion: { startAddr: baseAddr, bytes },
    descriptorTable: descriptor,
    known,
    unknownCandidates,
  };
}
