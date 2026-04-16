import type { JSX } from "react";
import { C, FONT_MONO } from "../tokens";
import type { PhaseState } from "../useRun";
import { StatusPill } from "./StatusPill";

export function PhaseCard({
  label,
  phase,
  emphasis = false,
}: {
  label: string;
  phase: PhaseState;
  emphasis?: boolean;
}): JSX.Element {
  const pct =
    phase.progress && phase.progress.total > 0
      ? Math.min(100, (phase.progress.done / phase.progress.total) * 100)
      : null;
  return (
    <div
      style={{
        background: emphasis ? C.surfaceHi : C.surface,
        border: `1px solid ${phase.status === "running" ? C.cyan : C.border}`,
        borderRadius: 8,
        padding: "14px 16px",
        marginBottom: 12,
        transition: "border-color 200ms",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: phase.message || phase.narration.length > 0 ? 8 : 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13, color: C.text }}>
          {label}
        </span>
        <span style={{ flex: 1 }} />
        <StatusPill status={phase.status} />
      </div>
      {phase.message && (
        <div style={{ color: C.textMed, fontSize: 12, marginBottom: 4 }}>
          {phase.message}
        </div>
      )}
      {pct !== null && (
        <div
          style={{
            height: 6,
            background: C.border,
            borderRadius: 3,
            overflow: "hidden",
            margin: "8px 0",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: C.cyan,
              transition: "width 100ms linear",
            }}
          />
        </div>
      )}
      {phase.progress?.label && (
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            color: C.textDim,
            marginBottom: 4,
          }}
        >
          {phase.progress.label}
        </div>
      )}
      {phase.narration.length > 0 && (
        <div
          style={{
            borderTop: `1px solid ${C.border}`,
            marginTop: 8,
            paddingTop: 8,
            fontFamily: FONT_MONO,
            fontSize: 11,
            color: C.textMed,
            maxHeight: 140,
            overflowY: "auto",
          }}
        >
          {phase.narration.map((n, i) => (
            <div key={i} style={{ marginBottom: 2 }}>
              <span style={{ color: C.textDim }}>›</span> {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
