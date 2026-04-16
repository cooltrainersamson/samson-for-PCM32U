// KWP2000 Negative Response Codes. Every NRC that comes back from the ECU
// gets mapped to a user-friendly explanation *and* the "why" — what it
// actually means in protocol terms — and a "fix" — what the user should
// try next. The report always shows all three.

export interface NrcInfo {
  readonly code: number;
  readonly name: string;
  readonly why: string;
  readonly fix: string;
}

export const NRC_TABLE: Readonly<Record<number, NrcInfo>> = {
  0x10: {
    code: 0x10,
    name: "generalReject",
    why: "The ECU rejected the request without giving a specific reason. This is usually a protocol-level problem, not an application-level one — the ECU parsed the frame but didn't like something about it.",
    fix: "Try the request again. If it repeats, the adapter may be sending malformed frames — check ATH1 is set and the ATSH header matches 6C 10 F1.",
  },
  0x11: {
    code: 0x11,
    name: "serviceNotSupported",
    why: "The ECU does not implement this KWP2000 service at all. Different ECU families expose different service sets; not every 68332 Delphi ECU answers Mode 0x23, for example.",
    fix: "Nothing to do — the tool will skip this step and note it in the report. If you expected this service to work, your ECU is a different variant than the project owner has characterized; please send the report so he can update the compatibility list.",
  },
  0x12: {
    code: 0x12,
    name: "subFunctionNotSupported",
    why: "The ECU accepts this service but not with the subfunction byte you sent. For Mode 0x27, this usually means the ECU wants a different session first (Mode 0x10 programming mode) before it will produce a seed.",
    fix: "The tool will attempt to open a programming session and retry. If that also fails, the ECU may use a non-standard security level numbering.",
  },
  0x22: {
    code: 0x22,
    name: "conditionsNotCorrect",
    why: "The ECU refuses to do this operation in its current state. For security access, this usually means the engine is running — the ECU only unlocks with key in ON position and engine OFF. Could also mean RPM too high, vehicle speed non-zero, or the ECU is in a diagnostic routine already.",
    fix: "Put the key in the RUN position but DO NOT start the engine. Make sure the vehicle is stationary and no accessories are hammering the bus. Then retry.",
  },
  0x31: {
    code: 0x31,
    name: "requestOutOfRange",
    why: "A parameter byte in your request is outside the range the ECU accepts. For Mode 0x23, this usually means you asked to read an address that isn't mapped in the ECU's memory map.",
    fix: "The tool will note the rejected address in the report. If you were trying to read a specific region, the ECU probably has flash protection on that area.",
  },
  0x33: {
    code: 0x33,
    name: "securityAccessDenied",
    why: "The ECU requires a seed-key unlock before it will honour this service, and you haven't unlocked yet (or the unlock expired — some ECUs re-lock after a timeout).",
    fix: "Run the seed-key unlock step first. The tool does this automatically in the Identify flow.",
  },
  0x35: {
    code: 0x35,
    name: "invalidKey",
    why: "The ECU computed a different key from the seed than you did. This means the algorithm is mismatched — your ECU is a different family than the one the tool has characterized for this broadcast code.",
    fix: "The tool will run a brute-force search across all 512 (table × algo) combinations in the TIS2000 key tables. If none match, your ECU uses an algorithm that isn't in the DllSecurity.dll that was reverse-engineered.",
  },
  0x36: {
    code: 0x36,
    name: "exceededNumberOfAttempts",
    why: "You've failed the seed-key check too many times in a row (usually 3), and the ECU has locked you out to prevent brute-force attacks.",
    fix: "Turn the key fully OFF, wait 30 seconds, turn it back to the RUN position, and try again. The lockout clears on key-cycle.",
  },
  0x37: {
    code: 0x37,
    name: "requiredTimeDelayNotExpired",
    why: "You're still inside the 30-second lockout window from a previous failed attempt.",
    fix: "Wait another 30 seconds and retry. If you don't want to wait, cycle the ignition key.",
  },
  0x78: {
    code: 0x78,
    name: "responsePending",
    why: "The ECU is still working on your last request — this is a 'please wait' acknowledgment, not a failure. The driver should wait for the real response.",
    fix: "The tool handles this automatically by extending the timeout.",
  },
};

export function explainNrc(code: number): NrcInfo {
  return (
    NRC_TABLE[code] ?? {
      code,
      name: `unknown_0x${code.toString(16).toUpperCase().padStart(2, "0")}`,
      why: `The ECU returned NRC 0x${code.toString(16).toUpperCase().padStart(2, "0")}, which is not in the documented KWP2000 NRC table. This might be a manufacturer-specific code.`,
      fix: "Include the full report when you share this with the project owner — unknown NRCs are useful data.",
    }
  );
}

export class KwpNegativeError extends Error {
  readonly nrc: NrcInfo;
  constructor(
    readonly requestedSid: number,
    code: number,
  ) {
    const nrc = explainNrc(code);
    super(
      `ECU refused SID 0x${requestedSid.toString(16).toUpperCase().padStart(2, "0")}: ${nrc.name} (NRC 0x${nrc.code.toString(16).toUpperCase().padStart(2, "0")})`,
    );
    this.name = "KwpNegativeError";
    this.nrc = nrc;
  }
}
