// Event protocol streamed from the main-process orchestrator to the
// renderer. The goal is that the UI can render a live, step-by-step
// narration of exactly what the tool is doing on the wire — every AT
// command, every KWP request, every parsed frame, every decision.
//
// Designed for UX, not for machines: messages include human-readable
// copy that goes directly into the step log. `why` and `fix` fields
// mirror the TransportError / KwpNegativeError shape so failures
// always carry the explanatory context.

export type PhaseId =
  | "connect"
  | "init"
  | "ping"
  | "unlock"
  | "broadcast"
  | "dtc"
  | "dump"
  | "report";

export const PHASE_LABELS: Record<PhaseId, string> = {
  connect: "Connecting to adapter",
  init: "Initializing ELM327",
  ping: "Pinging ECU",
  unlock: "Unlocking ECU (seed-key)",
  broadcast: "Reading broadcast code",
  dtc: "Scanning DTC & calibration tables",
  dump: "Full flash dump",
  report: "Generating report",
};

export type RunEvent =
  /** A phase started, progressed, or resolved. */
  | {
      type: "phase";
      phase: PhaseId;
      status: "running" | "ok" | "warn" | "error" | "skipped";
      message: string;
      detail?: string;
      ts: number;
    }
  /** Byte-accurate progress inside a phase (for scan/dump progress bars). */
  | {
      type: "progress";
      phase: PhaseId;
      done: number;
      total: number;
      label?: string;
      ts: number;
    }
  /** Free-form narration — one-line user-facing commentary on what's happening. */
  | {
      type: "narrate";
      phase: PhaseId;
      message: string;
      ts: number;
    }
  /** Low-level wire log entry (TX, RX, or adapter info line). */
  | {
      type: "wire";
      direction: "tx" | "rx" | "info";
      payload: string;
      ts: number;
    }
  /** A warning surfaced anywhere in the flow. */
  | {
      type: "warning";
      phase: PhaseId | null;
      message: string;
      ts: number;
    }
  /** A fatal error with full WHY/FIX context. */
  | {
      type: "error";
      phase: PhaseId | null;
      message: string;
      why?: string;
      fix?: string;
      ts: number;
    }
  /** A structured datum produced by a phase — the orchestrator's outputs. */
  | {
      type: "result";
      phase: PhaseId;
      key: string;
      value: unknown;
      ts: number;
    }
  /** Terminal event: the run has ended (success or not). */
  | {
      type: "done";
      success: boolean;
      reportMarkdown: string;
      suggestedFilename: string;
      ts: number;
    };

export interface RunOptions {
  readonly portPath: string;
  readonly baudRate: number;
  readonly targetHeader?: string;
  /** If true, run Mode 0x23 broadcast scan after unlock. */
  readonly scanBroadcast?: boolean;
  /** If true, run Mode 0x23 DTC table scan after unlock. */
  readonly scanDtc?: boolean;
  /** If true, read the DTC descriptor table at 0x67358 as part of the scan. */
  readonly includeDescriptorTable?: boolean;
  /** If true, dump the full flash window. VERY slow. UI must confirm. */
  readonly fullFlashDump?: boolean;
  readonly flashDumpStart?: number;
  readonly flashDumpEnd?: number;
}

export interface PortInfo {
  readonly path: string;
  readonly manufacturer?: string;
  readonly friendlyName?: string;
  readonly vendorId?: string;
  readonly productId?: string;
  readonly serialNumber?: string;
}

export interface PlatformInfo {
  readonly os: string;
  readonly osVersion: string;
  readonly arch: string;
  readonly toolVersion: string;
}
