import type { JSX } from "react";
import { C, FONT_MONO } from "../tokens";
import type { PhaseStatus } from "../useRun";

const COLORS: Record<PhaseStatus, { bg: string; fg: string; dot: string }> = {
  idle: { bg: "#1a1e28", fg: C.textDim, dot: C.textDim },
  running: { bg: "#102231", fg: C.cyan, dot: C.cyan },
  ok: { bg: "#0f2720", fg: C.green, dot: C.green },
  warn: { bg: "#2a2210", fg: C.yellow, dot: C.yellow },
  error: { bg: "#2a1018", fg: C.red, dot: C.red },
  skipped: { bg: "#1a1e28", fg: C.textMed, dot: C.textDim },
};

const LABEL: Record<PhaseStatus, string> = {
  idle: "pending",
  running: "running",
  ok: "done",
  warn: "warn",
  error: "error",
  skipped: "skipped",
};

export function StatusPill({ status }: { status: PhaseStatus }): JSX.Element {
  const c = COLORS[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 8px",
        borderRadius: 4,
        background: c.bg,
        color: c.fg,
        fontSize: 10,
        fontFamily: FONT_MONO,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: c.dot,
          ...(status === "running"
            ? { animation: "pulse 1s ease-in-out infinite" }
            : {}),
        }}
      />
      {LABEL[status]}
    </span>
  );
}
