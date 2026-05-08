// Fallback ECU identification probes for ECUs that refuse Mode 0x23.
//
// Background: Mode 0x23 (ReadMemoryByAddress) is the tool's primary
// way of reading the broadcast code from a fixed flash window. Most
// PCM32U variants speak it. Some don't — they answer NRC 0x11
// (serviceNotSupported) for any Mode 0x23 request, regardless of
// security state or session. That doesn't mean we can't identify the
// ECU; it just means we have to ask via different KWP services that
// expose ECU identification through "data identifiers" instead of raw
// memory addresses.
//
// This module probes two such services automatically:
//
//   * **Mode 0x1A** — readEcuIdentification. Manufacturers typically
//     expose a small set of identifier bytes in the 0x80–0x9F range
//     (calibration ID, hardware ID, software version, VIN, etc.). The
//     calibration-ID identifier in particular often contains the
//     PCM32U broadcast code as a 4-character ASCII run.
//
//   * **Mode 0x12** — readDataByLocalIdentifier. A KWP2000 generic
//     read service indexed by single-byte LIDs. Some variants put
//     the broadcast string here instead of (or in addition to) Mode
//     0x1A. Common LIDs: 0x90 VIN, 0x9A ECU identification block,
//     0xA0–0xAF application-specific.
//
// For every probe attempt, we record:
//   - which service + identifier we asked for
//   - whether the ECU answered positively, refused with a specific
//     NRC, or threw a transport error
//   - if positive, the raw bytes + ASCII interpretation + any 4-letter
//     all-uppercase substrings that look like broadcast codes
//
// The orchestrator runs this when Mode 0x23 returns NRC 0x11. Whatever
// the result, the structured `IdentificationResult` is included in the
// report so the project owner can see *exactly* what worked, what
// didn't, and what the ECU returned for each identifier.

import type { ElmDriver } from "../elm327/driver";
import { KwpNegativeError, explainNrc } from "../elm327/nrc";
import { TransportError } from "../transport/types";
import { KNOWN_BROADCASTS, type BroadcastProfile } from "../pcm32u/broadcasts";

/** Service IDs we probe. */
export const FALLBACK_SERVICES = {
  READ_ECU_IDENTIFICATION: 0x1a,
  READ_DATA_BY_LID: 0x12,
} as const;

/** A single (service, identifier) probe to attempt. */
export interface ProbeSpec {
  readonly service: number;
  readonly identifier: number;
  /** Human-readable label, e.g. "calibration identification (0x1A 0x87)". */
  readonly label: string;
}

/** Outcome of a single probe. */
export type ProbeOutcome =
  | {
      readonly kind: "success";
      /** Bytes after the SID + identifier echo. */
      readonly bytes: Uint8Array;
      /** Printable-ASCII rendering of the bytes (non-printable → '.'). */
      readonly ascii: string;
      /** 4-letter all-uppercase A–Z substrings found anywhere in the bytes. */
      readonly broadcastCandidates: readonly string[];
      /** Raw response frame for the report. */
      readonly rawFrame: string;
    }
  | {
      readonly kind: "rejected";
      readonly nrc: number;
      readonly nrcName: string;
    }
  | {
      readonly kind: "error";
      readonly message: string;
    };

/** Result of a single probe attempt: spec + outcome. */
export interface ProbeAttempt {
  readonly spec: ProbeSpec;
  readonly outcome: ProbeOutcome;
}

/** Final structured identification result. */
export interface IdentificationResult {
  /** Every probe we tried, in order, with its outcome. */
  readonly attempts: readonly ProbeAttempt[];
  /** Subset of attempts where the ECU answered positively. */
  readonly successfulProbes: readonly ProbeAttempt[];
  /**
   * Union of all 4-letter broadcast candidates seen across all
   * successful probes, deduplicated. Sorted alphabetically.
   */
  readonly broadcastCandidates: readonly string[];
  /** First candidate that matches `KNOWN_BROADCASTS`, if any. */
  readonly matchedBroadcast: BroadcastProfile | null;
  /** Service+identifier where the matched broadcast was found, if any. */
  readonly matchedSource: { service: number; identifier: number } | null;
}

/**
 * Default probe ladder. Order matters: cheaper / more-likely probes
 * first. We stop as soon as we get a known-broadcast match — but every
 * attempted probe is recorded either way.
 */
export const DEFAULT_PROBE_LADDER: readonly ProbeSpec[] = [
  // Mode 0x1A — readEcuIdentification, the canonical KWP service for this.
  { service: 0x1a, identifier: 0x87, label: "calibration identification (1A 87)" },
  { service: 0x1a, identifier: 0x88, label: "calibration verification number (1A 88)" },
  { service: 0x1a, identifier: 0x9a, label: "ECU identification block (1A 9A)" },
  { service: 0x1a, identifier: 0x90, label: "VIN (1A 90)" },
  { service: 0x1a, identifier: 0x80, label: "ECU information (1A 80)" },
  { service: 0x1a, identifier: 0x81, label: "vehicle manufacturer ECU SW number (1A 81)" },
  // Mode 0x12 — readDataByLocalIdentifier, alternative LID-keyed read.
  { service: 0x12, identifier: 0x90, label: "VIN via LID (12 90)" },
  { service: 0x12, identifier: 0x9a, label: "ECU identification block via LID (12 9A)" },
  { service: 0x12, identifier: 0xa0, label: "application data block 0 (12 A0)" },
  { service: 0x12, identifier: 0xa1, label: "application data block 1 (12 A1)" },
  { service: 0x12, identifier: 0xa2, label: "application data block 2 (12 A2)" },
];

/** Find every 4-letter all-uppercase A–Z substring in a byte buffer. */
export function findBroadcastCandidates(bytes: Uint8Array): string[] {
  const out = new Set<string>();
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
    out.add(
      String.fromCharCode(bytes[i]!, bytes[i + 1]!, bytes[i + 2]!, bytes[i + 3]!),
    );
  }
  return [...out].sort();
}

function bytesToAscii(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) {
    s += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ".";
  }
  return s;
}

/**
 * Run the identification probe ladder against the (already-unlocked)
 * ECU and return a structured account of what each service answered.
 *
 * Stops early as soon as a probe surfaces a match in `KNOWN_BROADCASTS`,
 * but every probe attempted before the match is recorded. Probes that
 * fail with a transport error don't abort the ladder — we keep going so
 * we get maximum data per session.
 */
export async function probeIdentificationServices(
  driver: ElmDriver,
  ladder: readonly ProbeSpec[] = DEFAULT_PROBE_LADDER,
): Promise<IdentificationResult> {
  const attempts: ProbeAttempt[] = [];
  for (const spec of ladder) {
    const outcome = await attempt(driver, spec);
    attempts.push({ spec, outcome });
    // Early exit on the first known-broadcast match.
    if (outcome.kind === "success") {
      for (const c of outcome.broadcastCandidates) {
        if (KNOWN_BROADCASTS[c]) return collate(attempts);
      }
    }
  }
  return collate(attempts);
}

async function attempt(
  driver: ElmDriver,
  spec: ProbeSpec,
): Promise<ProbeOutcome> {
  try {
    const frames = await driver.sendKwp([spec.service, spec.identifier]);
    const f = frames[0]!;
    // Positive response SID = request SID + 0x40. The first byte of
    // f.data echoes the identifier; the rest is the payload.
    const identifierEchoed = f.data[0] === spec.identifier ? 1 : 0;
    const payloadBytes = Uint8Array.from(f.data.slice(identifierEchoed));
    return {
      kind: "success",
      bytes: payloadBytes,
      ascii: bytesToAscii(payloadBytes),
      broadcastCandidates: findBroadcastCandidates(payloadBytes),
      rawFrame: f.raw,
    };
  } catch (err) {
    if (err instanceof KwpNegativeError) {
      return {
        kind: "rejected",
        nrc: err.nrc.code,
        nrcName: err.nrc.name,
      };
    }
    if (err instanceof TransportError) {
      return { kind: "error", message: err.message };
    }
    return {
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function collate(attempts: ProbeAttempt[]): IdentificationResult {
  const successful = attempts.filter(
    (a): a is ProbeAttempt & { outcome: { kind: "success" } } =>
      a.outcome.kind === "success",
  );
  const candidates = new Set<string>();
  let matched: BroadcastProfile | null = null;
  let matchedSource: { service: number; identifier: number } | null = null;
  for (const a of successful) {
    for (const c of a.outcome.broadcastCandidates) {
      candidates.add(c);
      if (!matched && KNOWN_BROADCASTS[c]) {
        matched = KNOWN_BROADCASTS[c]!;
        matchedSource = { service: a.spec.service, identifier: a.spec.identifier };
      }
    }
  }
  return {
    attempts,
    successfulProbes: successful,
    broadcastCandidates: [...candidates].sort(),
    matchedBroadcast: matched,
    matchedSource,
  };
}

// Re-export for convenience of report module which formats NRCs.
export { explainNrc };
