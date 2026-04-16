// Hard safety rail. The tool is read-only by design, but this file is
// defense-in-depth: if any future code path — a refactor, a bug, a typo,
// a copy-paste from some other reference implementation — ever constructs
// a KWP2000 request with a destructive service ID, sendKwp throws
// DestructiveSidBlockedError BEFORE the bytes leave the tool, so the
// request never reaches the adapter, let alone the ECU.
//
// This list is intentionally conservative: every SID that can *cause*
// flash writes, flash erases, kernel uploads, or routine invocation
// with flash side-effects is on it. Any addition to this list must be
// reviewed against the PCM32U service map.
//
// SIDs that remain allowed (as of 2026-04):
//   0x20  ReturnToNormal / alive ping         (read-only)
//   0x23  ReadMemoryByAddress                 (read-only)
//   0x27  SecurityAccess (seed/key)           (ephemeral RAM flag only)
//   0x1A  ReadECUIdentification               (read-only; unused but safe)
//
// If you find yourself wanting to remove something from this blocklist,
// stop and re-read ECU_TOOL_HANDOFF.md §13.

export interface BlockedSidInfo {
  readonly sid: number;
  readonly name: string;
  readonly risk: string;
}

export const DESTRUCTIVE_SIDS: Readonly<Record<number, BlockedSidInfo>> = {
  0x2e: {
    sid: 0x2e,
    name: "WriteDataByIdentifier",
    risk: "Writes values to ECU data identifiers. Some of these map to calibration values stored in flash.",
  },
  0x31: {
    sid: 0x31,
    name: "StartRoutineByLocalIdentifier",
    risk: "Invokes ECU-internal routines by ID. On PCM32U some routines trigger flash erase or relocation.",
  },
  0x34: {
    sid: 0x34,
    name: "RequestDownload",
    risk: "Opens a memory-write session. Required precursor to every flash write and kernel upload. Never needed for a read-only diagnostic tool.",
  },
  0x36: {
    sid: 0x36,
    name: "TransferData",
    risk: "Ships payload bytes into the ECU. With transfer type 0x80 this is how the project owner's kernels are uploaded and executed — the mechanism that bricked his bench ECU during Phase 14. Explicitly forbidden in §13 of the handoff.",
  },
  0x37: {
    sid: 0x37,
    name: "RequestTransferExit",
    risk: "Finalizes a RequestDownload session. Only reached after a real write has occurred; its presence in outbound traffic means something destructive already happened.",
  },
  0x3b: {
    sid: 0x3b,
    name: "WriteDataByCommonIdentifier",
    risk: "Writes values to common data identifiers. Flash-backed on most GM ECUs of this era.",
  },
  0x3d: {
    sid: 0x3d,
    name: "WriteMemoryByAddress",
    risk: "Direct inverse of Mode 0x23 ReadMemoryByAddress. Writes arbitrary bytes to arbitrary ECU memory. Strictly forbidden.",
  },
};

export class DestructiveSidBlockedError extends Error {
  readonly info: BlockedSidInfo;
  readonly attemptedBytes: readonly number[];
  constructor(sid: number, attemptedBytes: readonly number[]) {
    const info = DESTRUCTIVE_SIDS[sid]!;
    super(
      `SAFETY BLOCK: sendKwp refused to transmit SID 0x${sid
        .toString(16)
        .toUpperCase()
        .padStart(2, "0")} (${info.name}). This tool is read-only and must never send potentially destructive services. If you are seeing this error, a bug or an unintended refactor has introduced a call path that constructs a write/erase/kernel request. Stop the run and report it before proceeding.`,
    );
    this.name = "DestructiveSidBlockedError";
    this.info = info;
    this.attemptedBytes = attemptedBytes;
  }
}

/**
 * Throws DestructiveSidBlockedError if the first byte of `requestBytes` is
 * a known-destructive service. Called by ElmDriver.sendKwp BEFORE anything
 * is written to the transport.
 */
export function assertSidSafe(requestBytes: readonly number[]): void {
  if (requestBytes.length === 0) return;
  const sid = requestBytes[0]!;
  if (DESTRUCTIVE_SIDS[sid]) {
    throw new DestructiveSidBlockedError(sid, requestBytes);
  }
}
