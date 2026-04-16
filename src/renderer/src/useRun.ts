// Central run-state hook. Owns the event stream from main, reduces it
// into a structured state tree the tabs can render from.

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { RunEvent, RunOptions, PhaseId } from "@shared/ipc/events";

export type PhaseStatus =
  | "idle"
  | "running"
  | "ok"
  | "warn"
  | "error"
  | "skipped";

export interface PhaseState {
  readonly status: PhaseStatus;
  readonly message: string;
  readonly detail?: string;
  readonly progress?: { done: number; total: number; label?: string };
  readonly narration: readonly string[];
}

export interface WireEntry {
  readonly direction: "tx" | "rx" | "info";
  readonly payload: string;
  readonly ts: number;
}

export interface RunState {
  readonly active: boolean;
  readonly succeeded: boolean | null;
  readonly phases: Record<PhaseId, PhaseState>;
  readonly wire: readonly WireEntry[];
  readonly warnings: readonly string[];
  readonly errors: readonly { message: string; why?: string; fix?: string }[];
  readonly results: Record<string, unknown>;
  readonly reportMarkdown: string | null;
  readonly suggestedFilename: string | null;
}

export const PHASE_ORDER: PhaseId[] = [
  "connect",
  "init",
  "ping",
  "unlock",
  "broadcast",
  "dtc",
  "dump",
  "report",
];
const PHASES = PHASE_ORDER;

function emptyPhase(): PhaseState {
  return { status: "idle", message: "", narration: [] };
}

function initialState(): RunState {
  const phases = Object.fromEntries(PHASES.map((p) => [p, emptyPhase()])) as Record<
    PhaseId,
    PhaseState
  >;
  return {
    active: false,
    succeeded: null,
    phases,
    wire: [],
    warnings: [],
    errors: [],
    results: {},
    reportMarkdown: null,
    suggestedFilename: null,
  };
}

type Action =
  | { kind: "start" }
  | { kind: "event"; ev: RunEvent }
  | { kind: "reset" };

function reducer(state: RunState, action: Action): RunState {
  switch (action.kind) {
    case "start":
      return { ...initialState(), active: true };
    case "reset":
      return initialState();
    case "event": {
      const ev = action.ev;
      switch (ev.type) {
        case "phase": {
          const prev = state.phases[ev.phase];
          return {
            ...state,
            phases: {
              ...state.phases,
              [ev.phase]: {
                ...prev,
                status: ev.status,
                message: ev.message,
                detail: ev.detail,
              },
            },
          };
        }
        case "progress": {
          const prev = state.phases[ev.phase];
          return {
            ...state,
            phases: {
              ...state.phases,
              [ev.phase]: {
                ...prev,
                progress: { done: ev.done, total: ev.total, label: ev.label },
              },
            },
          };
        }
        case "narrate": {
          const prev = state.phases[ev.phase];
          return {
            ...state,
            phases: {
              ...state.phases,
              [ev.phase]: {
                ...prev,
                narration: [...prev.narration, ev.message].slice(-40),
              },
            },
          };
        }
        case "wire":
          return {
            ...state,
            wire: [
              ...state.wire,
              { direction: ev.direction, payload: ev.payload, ts: ev.ts },
            ].slice(-500),
          };
        case "warning":
          return { ...state, warnings: [...state.warnings, ev.message] };
        case "error":
          return {
            ...state,
            errors: [
              ...state.errors,
              { message: ev.message, why: ev.why, fix: ev.fix },
            ],
          };
        case "result":
          return { ...state, results: { ...state.results, [ev.key]: ev.value } };
        case "done":
          return {
            ...state,
            active: false,
            succeeded: ev.success,
            reportMarkdown: ev.reportMarkdown,
            suggestedFilename: ev.suggestedFilename,
          };
      }
      return state;
    }
  }
}

export function useRun() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    unsubRef.current = window.samson.onEvent((ev) =>
      dispatch({ kind: "event", ev }),
    );
    return () => {
      unsubRef.current?.();
    };
  }, []);

  const start = useCallback(async (options: RunOptions) => {
    dispatch({ kind: "start" });
    try {
      await window.samson.startRun(options);
    } catch (err) {
      dispatch({
        kind: "event",
        ev: {
          type: "error",
          phase: null,
          message: err instanceof Error ? err.message : String(err),
          ts: Date.now(),
        },
      });
      dispatch({
        kind: "event",
        ev: {
          type: "done",
          success: false,
          reportMarkdown: "",
          suggestedFilename: "failed-run.md",
          ts: Date.now(),
        },
      });
    }
  }, []);

  const cancel = useCallback(async () => {
    await window.samson.cancelRun();
  }, []);

  const reset = useCallback(() => {
    dispatch({ kind: "reset" });
  }, []);

  const currentPhase = useMemo<PhaseId | null>(() => {
    for (const p of PHASES) {
      if (state.phases[p].status === "running") return p;
    }
    return null;
  }, [state]);

  return { state, start, cancel, reset, currentPhase };
}
