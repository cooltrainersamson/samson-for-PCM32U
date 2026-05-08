// User-facing summary derived from a diagnostic run. Sits above the raw
// markdown report on the Report tab and translates what the tool
// auto-detected into plain English.
//
// Auto-detection is the first principle of this tool. Everything in the
// summary comes from `ReportInput` — no user input, no manual ECU
// selection. The summary's job is to make the tool's findings legible
// to a vehicle owner who isn't a 68332 engineer.

import type { ReportInput } from "./markdown";

export type FindingKind = "ok" | "warn" | "new" | "fail";

export interface UserSummaryFinding {
  readonly kind: FindingKind;
  readonly headline: string;
  /** Optional plain-English elaboration. One short sentence. */
  readonly detail?: string;
}

export interface UserSummary {
  /** Single-sentence verdict for the very top of the panel. */
  readonly oneLine: string;
  /** Ordered findings, render in this order. */
  readonly findings: readonly UserSummaryFinding[];
  /**
   * Bullet points describing what the project owner learns from this
   * specific report. Empty unless `shouldShare` is true.
   */
  readonly contributions: readonly string[];
  /** Single-sentence next action for the user. */
  readonly nextStep: string;
  /**
   * True iff this run produced novel data the project owner would want
   * to see (unknown variant, unknown DTCs, NRC we haven't characterized,
   * etc.). Drives whether we ask the user to email it.
   */
  readonly shouldShare: boolean;
}

function hasError<T extends object>(
  v: unknown,
): v is { error: string; why?: string; fix?: string } {
  return typeof v === "object" && v !== null && "error" in v;
}

export function buildUserSummary(input: ReportInput): UserSummary {
  const findings: UserSummaryFinding[] = [];
  const contributions: string[] = [];

  // ── 1. Adapter / wire connectivity ────────────────────────────────
  if (hasError(input.init)) {
    findings.push({
      kind: "fail",
      headline: "Adapter didn't initialize",
      detail:
        "The ELM327 didn't accept the setup commands. The diagnostic couldn't even reach the ECU.",
    });
    return {
      oneLine: "The OBD-II adapter didn't initialize — nothing else ran.",
      findings,
      contributions,
      nextStep:
        "Check the adapter is powered, the right serial port is selected, and the ignition is in the RUN position. Then retry.",
      shouldShare: false,
    };
  }

  findings.push({
    kind: "ok",
    headline: "OBD-II adapter ready",
    detail: input.init.protocol
      ? `Talking ${input.init.protocol} on ${input.adapter.label}.`
      : `Connected on ${input.adapter.label}.`,
  });

  // ── 2. Ping ────────────────────────────────────────────────────────
  if (!input.ping) {
    // The run aborted before ping. Treat the init as the only finding.
  } else if ("error" in input.ping) {
    findings.push({
      kind: "fail",
      headline: "ECU didn't respond to a ping",
      detail:
        "The adapter is fine, but no module at the PCM address answered. Usually means key not in RUN, or you're talking to the wrong module.",
    });
    return {
      oneLine: "Adapter connected but the ECU didn't respond.",
      findings,
      contributions,
      nextStep:
        "Turn the key fully to RUN (engine off), confirm the cable is in the OBD-II port, and retry.",
      shouldShare: false,
    };
  } else {
    findings.push({
      kind: "ok",
      headline: "ECU is alive on the bus",
      detail: `Responded to a Mode 0x20 ping with echo byte 0x${input.ping.echoByte.toString(16).toUpperCase().padStart(2, "0")}.`,
    });
  }

  // ── 3. Seed-key unlock ─────────────────────────────────────────────
  if (input.unlock !== undefined) {
    if (hasError(input.unlock)) {
      findings.push({
        kind: "new",
        headline: "Seed-key unlock didn't succeed",
        detail:
          "Your ECU rejected the unlock or returned a key the tool didn't recognize. This usually means it's a PCM32U variant with an algorithm not yet in our table.",
      });
      contributions.push(
        "Confirms there's a PCM32U variant out there using a security algorithm slot the tool hasn't mapped yet.",
      );
    } else if (!input.unlock.unlocked) {
      findings.push({
        kind: "new",
        headline: "Seed-key unlock didn't succeed",
        detail:
          "Your ECU produced a seed but rejected the key the tool computed. This means the algorithm is mismatched — probably a new variant.",
      });
      contributions.push(
        "Captures a seed/key pair from a security algorithm that doesn't match any of the 512 known TIS2000 slots.",
      );
    } else {
      const u = input.unlock;
      const sameFamilyNote =
        u.method === "known"
          ? " — same family as the variants the tool already supports"
          : "";
      findings.push({
        kind: "ok",
        headline: "Seed-key unlock succeeded",
        detail: `Algorithm 0x${u.algo.toString(16).toUpperCase().padStart(2, "0")} (table ${u.table})${sameFamilyNote}.`,
      });
    }
  }

  // ── 4. Broadcast identification ────────────────────────────────────
  if (input.broadcast !== undefined) {
    if (hasError(input.broadcast)) {
      findings.push({
        kind: "new",
        headline: "Couldn't read your ECU's broadcast code",
        detail:
          "Your ECU rejected the memory-read service the tool uses to identify variants. This is a known sign that your ECU is a variant with a different Mode 0x23 dialect.",
      });
      contributions.push(
        "Tells the project owner which Mode 0x23 dialect your ECU uses, so the tool can auto-detect this variant in a future release.",
      );
    } else {
      const b = input.broadcast;
      if (b.matched && b.matchAddr !== null) {
        findings.push({
          kind: "ok",
          headline: `Identified your ECU as ${b.matched.code}`,
          detail: `${b.matched.year} ${b.matched.vehicle} — ${b.matched.engine} ${b.matched.trans}.`,
        });
      } else {
        findings.push({
          kind: "new",
          headline: "Found a broadcast code we don't recognize",
          detail:
            b.candidates.length > 0
              ? `Saw ${b.candidates.length} candidate 4-letter ASCII tag${b.candidates.length === 1 ? "" : "s"} in the config window — none are in the registry yet.`
              : "The window came back without any 4-letter ASCII candidates — your ECU might store the broadcast somewhere unusual.",
        });
        contributions.push(
          "Adds a new broadcast code to the registry so the next person with the same vehicle gets auto-detected.",
        );
      }
    }
  }

  // ── 4b. Identification fallback probes ─────────────────────────────
  // Only present when the orchestrator ran the Mode 0x12 / 0x1A ladder
  // because Mode 0x23 returned NRC 0x11. The findings/contributions
  // here are added on top of (or in place of) the broadcast section
  // above — both can fire when the broadcast probe failed and the
  // fallback found something useful.
  if (input.identification !== undefined && !hasError(input.identification)) {
    const ident = input.identification;
    const ok = ident.successfulProbes.length;
    const total = ident.attempts.length;
    if (ident.matchedBroadcast && ident.matchedSource) {
      findings.push({
        kind: "ok",
        headline: `Fallback probes identified your ECU as ${ident.matchedBroadcast.code}`,
        detail: `Mode 0x${ident.matchedSource.service.toString(16).toUpperCase().padStart(2, "0")} 0x${ident.matchedSource.identifier.toString(16).toUpperCase().padStart(2, "0")} returned the broadcast string. ${ident.matchedBroadcast.year} ${ident.matchedBroadcast.vehicle} — ${ident.matchedBroadcast.engine} ${ident.matchedBroadcast.trans}.`,
      });
    } else if (ident.broadcastCandidates.length > 0) {
      findings.push({
        kind: "new",
        headline: `Fallback probes found ${ident.broadcastCandidates.length} unknown 4-letter candidate${ident.broadcastCandidates.length === 1 ? "" : "s"}`,
        detail: `The tool tried alternate KWP services (Mode 0x12 / 0x1A) since Mode 0x23 wasn't supported. ${ok} of ${total} probes responded. None of the surfaced strings (${ident.broadcastCandidates.join(", ")}) match the registry yet.`,
      });
      contributions.push(
        "Pinpoints which Mode 0x12 / 0x1A identifier(s) your ECU answers, so the project owner can extend the auto-detection ladder for variants like yours.",
      );
    } else if (ok > 0) {
      findings.push({
        kind: "new",
        headline: "Fallback probes answered but didn't surface a broadcast string",
        detail: `${ok} of ${total} identification probes returned data, but none of the bytes contained a 4-letter ASCII run that looks like a broadcast code. The data is still useful — captured in the report.`,
      });
      contributions.push(
        "Captures what each KWP identifier returns on this ECU variant, even when the tool can't yet interpret it as a broadcast.",
      );
    } else {
      findings.push({
        kind: "fail",
        headline: "Neither Mode 0x23 nor the identification fallbacks worked",
        detail:
          "Every probe was rejected. The ECU might require a non-default KWP session (Mode 0x10) before responding, or it uses an entirely different identification mechanism.",
      });
      contributions.push(
        "Documents an ECU that refuses every probe in the current ladder, narrowing the search for alternative diagnostic strategies.",
      );
    }
  }

  // ── 5. DTC scan ────────────────────────────────────────────────────
  if (input.dtc !== undefined) {
    if (hasError(input.dtc)) {
      findings.push({
        kind: "warn",
        headline: "DTC table scan didn't complete",
        detail: "The DTC enable region wasn't readable on this run.",
      });
    } else {
      const d = input.dtc;
      if (d.unknownCandidates.length > 0) {
        findings.push({
          kind: "new",
          headline: `Found ${d.unknownCandidates.length} possible uncharacterized DTC${d.unknownCandidates.length === 1 ? "" : "s"}`,
          detail:
            "The scan found enable bytes that pattern-match real DTCs but aren't in our database yet — your ECU has DTCs we haven't catalogued.",
        });
        contributions.push(
          `Adds ${d.unknownCandidates.length} byte location${d.unknownCandidates.length === 1 ? "" : "s"} to the DTC catalogue so they can be named in future releases.`,
        );
      } else {
        const allDefault = d.known.every((k) => k.matchesDefault);
        findings.push({
          kind: "ok",
          headline: allDefault
            ? "DTC table matches the factory pattern"
            : "DTC table read OK with some non-default bytes",
          detail: allDefault
            ? `All ${d.known.length} known DTC enable bytes match the project owner's reference values.`
            : `Read ${d.known.length} known DTC enable bytes — some have been modified from default. Likely a previously-tuned ECU.`,
        });
      }
    }
  }

  // ── 6. Warnings carried up from the run ────────────────────────────
  for (const w of input.warnings) {
    findings.push({ kind: "warn", headline: w });
  }
  for (const e of input.errors) {
    findings.push({ kind: "fail", headline: e });
  }

  // ── Derive the one-liner and decide whether to ask for sharing ────
  const hasNew = findings.some((f) => f.kind === "new");
  const hasFail = findings.some((f) => f.kind === "fail");
  const shouldShare = hasNew || hasFail;

  let oneLine: string;
  if (hasFail && hasNew) {
    oneLine =
      "Some steps failed and the tool found data it doesn't recognize. The report is genuinely useful to share.";
  } else if (hasNew) {
    oneLine = "Your ECU has data the tool hasn't seen before. Worth sharing.";
  } else if (hasFail) {
    oneLine = "Some steps failed; the report still captures what we have.";
  } else {
    oneLine =
      "Your ECU is fully recognized — no novel data on this run. No need to share unless you want a record.";
  }

  const nextStep = shouldShare
    ? "Save the report and email it to cooltrainersamson@gmail.com — include vehicle year/make/model in the email."
    : "Save the report for your records, or copy it to clipboard if you want to keep it elsewhere.";

  return {
    oneLine,
    findings,
    contributions,
    nextStep,
    shouldShare,
  };
}
