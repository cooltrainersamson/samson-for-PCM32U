import { useState, type JSX } from "react";
import { C, FONT_MONO, FONT_SANS } from "../tokens";
import type { useRun } from "../useRun";
import type { FindingKind, UserSummary } from "@shared/report/summary";

export function ReportTab({
  run,
}: {
  run: ReturnType<typeof useRun>;
}): JSX.Element {
  const [saving, setSaving] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const md = run.state.reportMarkdown;
  const name = run.state.suggestedFilename;
  const summary = run.state.userSummary;

  if (!md || !name) {
    return (
      <div
        style={{
          padding: 32,
          color: C.textMed,
          fontFamily: FONT_SANS,
          fontSize: 13,
        }}
      >
        No report yet. Run a diagnostic in the Identify tab — the report will
        appear here when the run finishes, whether it succeeds or fails.
      </div>
    );
  }

  const onSave = async (): Promise<void> => {
    setSaving(true);
    try {
      const path = await window.samson.saveReport(md, name);
      if (path) setSavedPath(path);
    } finally {
      setSaving(false);
    }
  };

  const onCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(md);
  };

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: 24,
        fontFamily: FONT_SANS,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            Diagnostic report
          </h2>
          <div style={{ color: C.textMed, fontSize: 12, marginTop: 2 }}>
            {name}
            {run.state.succeeded === true && (
              <span style={{ color: C.green, marginLeft: 10 }}>
                ● run succeeded
              </span>
            )}
            {run.state.succeeded === false && (
              <span style={{ color: C.red, marginLeft: 10 }}>
                ● run failed (report still valid)
              </span>
            )}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <button type="button" style={btnSecondary} onClick={() => void onCopy()}>
          Copy to clipboard
        </button>
        <button
          type="button"
          style={{ ...btnPrimary, marginLeft: 8 }}
          onClick={() => void onSave()}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save as…"}
        </button>
      </div>

      {savedPath && (
        <div
          style={{
            background: "#0f2720",
            border: `1px solid ${C.green}`,
            color: C.green,
            padding: 10,
            borderRadius: 6,
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          ✓ Saved to {savedPath}
        </div>
      )}

      {summary && <SummaryPanel summary={summary} />}

      <div
        style={{
          fontSize: 11,
          color: C.textDim,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginTop: 18,
          marginBottom: 8,
          paddingTop: 12,
          borderTop: `1px solid ${C.border}`,
        }}
      >
        Full technical report
      </div>

      <pre
        style={{
          flex: 1,
          overflow: "auto",
          margin: 0,
          background: "#05070a",
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          padding: 14,
          fontFamily: FONT_MONO,
          fontSize: 11,
          color: C.text,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {md}
      </pre>
    </div>
  );
}

function SummaryPanel({ summary }: { summary: UserSummary }): JSX.Element {
  return (
    <div
      style={{
        background: "#0a0f14",
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: 18,
        marginBottom: 4,
        fontFamily: FONT_SANS,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: C.textDim,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 8,
        }}
      >
        Summary
      </div>

      <div
        style={{
          fontSize: 14,
          color: C.text,
          marginBottom: 14,
          fontWeight: 600,
          lineHeight: 1.4,
        }}
      >
        {summary.oneLine}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {summary.findings.map((f, i) => (
          <FindingRow key={i} kind={f.kind} headline={f.headline} detail={f.detail} />
        ))}
      </div>

      {summary.contributions.length > 0 && (
        <>
          <div
            style={{
              fontSize: 11,
              color: C.textDim,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginTop: 16,
              marginBottom: 6,
            }}
          >
            What you're helping with
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 12.5,
              color: C.textMed,
              lineHeight: 1.5,
            }}
          >
            {summary.contributions.map((c, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {c}
              </li>
            ))}
          </ul>
        </>
      )}

      <div
        style={{
          fontSize: 11,
          color: C.textDim,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginTop: 16,
          marginBottom: 6,
        }}
      >
        Next step
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: summary.shouldShare ? C.text : C.textMed,
          lineHeight: 1.5,
        }}
      >
        {summary.nextStep}
      </div>
    </div>
  );
}

function FindingRow({
  kind,
  headline,
  detail,
}: {
  kind: FindingKind;
  headline: string;
  detail?: string;
}): JSX.Element {
  const cfg = STYLE_FOR[kind];
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        fontSize: 12.5,
      }}
    >
      <div
        style={{
          flex: "0 0 auto",
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: cfg.bg,
          color: cfg.fg,
          fontSize: 11,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        }}
        aria-label={cfg.aria}
      >
        {cfg.glyph}
      </div>
      <div style={{ flex: 1, lineHeight: 1.45 }}>
        <div style={{ color: C.text, fontWeight: 600 }}>{headline}</div>
        {detail && (
          <div style={{ color: C.textMed, fontSize: 12, marginTop: 2 }}>
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}

const STYLE_FOR: Record<
  FindingKind,
  { bg: string; fg: string; glyph: string; aria: string }
> = {
  ok: { bg: "#0f3525", fg: C.green, glyph: "✓", aria: "ok" },
  warn: { bg: "#3a2c0a", fg: C.yellow, glyph: "!", aria: "warning" },
  new: { bg: "#0d2a3d", fg: C.tiffany, glyph: "★", aria: "new finding" },
  fail: { bg: "#3a0a14", fg: C.red, glyph: "✕", aria: "failure" },
};

const btnPrimary: React.CSSProperties = {
  background: C.tiffany,
  color: "#081210",
  border: "none",
  padding: "8px 16px",
  borderRadius: 6,
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  background: "transparent",
  color: C.text,
  border: `1px solid ${C.border}`,
  padding: "8px 14px",
  borderRadius: 6,
  fontSize: 12,
  cursor: "pointer",
};
