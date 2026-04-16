import { useState, type JSX } from "react";
import { C, FONT_MONO, FONT_SANS } from "../tokens";
import type { useRun } from "../useRun";

export function ReportTab({
  run,
}: {
  run: ReturnType<typeof useRun>;
}): JSX.Element {
  const [saving, setSaving] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const md = run.state.reportMarkdown;
  const name = run.state.suggestedFilename;

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
        <button style={btnSecondary} onClick={() => void onCopy()}>
          Copy to clipboard
        </button>
        <button
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

      <p
        style={{
          fontSize: 12,
          color: C.textMed,
          marginBottom: 12,
          maxWidth: 760,
        }}
      >
        If the <strong>Broadcast</strong> or <strong>DTC scan</strong> sections
        mention unknown candidates, please email the saved <code>.md</code>{" "}
        file to <strong>cooltrainersamson@gmail.com</strong> so the project
        owner can extend his reverse-engineered tables. The tool does not
        collect PII automatically, but always review the file before sending.
      </p>

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
