import { useState, type JSX } from "react";
import { C, FONT_MONO, FONT_SANS } from "../tokens";
import type { PortInfo } from "@shared/ipc/events";
import { PhaseCard } from "../components/PhaseCard";
import { WireLog } from "../components/WireLog";
import { useRun, PHASE_ORDER } from "../useRun";

const PHASE_LABELS: Record<string, string> = {
  connect: "1. Open serial port",
  init: "2. Initialize ELM327",
  ping: "3. Ping the ECU",
  unlock: "4. Unlock via seed-key",
  broadcast: "5. Read broadcast code",
  dtc: "6. Scan DTC + cal tables",
  dump: "7. Full flash dump (optional)",
  report: "8. Build report",
};

export function IdentifyTab({
  selectedPort,
  baudRate,
  run,
}: {
  selectedPort: PortInfo | null;
  baudRate: number;
  run: ReturnType<typeof useRun>;
}): JSX.Element {
  const [includeDescriptor, setIncludeDescriptor] = useState(true);
  const [fullDump, setFullDump] = useState(false);
  const [showFullDumpWarning, setShowFullDumpWarning] = useState(false);

  if (!selectedPort) {
    return (
      <div style={{ padding: 32, color: C.textMed, fontFamily: FONT_SANS }}>
        Pick a serial port in the Connect tab first.
      </div>
    );
  }

  const start = async (): Promise<void> => {
    if (fullDump && !showFullDumpWarning) {
      setShowFullDumpWarning(true);
      return;
    }
    await run.start({
      portPath: selectedPort.path,
      baudRate,
      scanBroadcast: true,
      scanDtc: true,
      includeDescriptorTable: includeDescriptor,
      fullFlashDump: fullDump,
    });
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(420px, 1fr) minmax(320px, 420px)",
        gap: 18,
        height: "100%",
        padding: 18,
        overflow: "hidden",
        fontFamily: FONT_SANS,
      }}
    >
      {/* Left column: phase cards with live narration */}
      <div style={{ overflowY: "auto", paddingRight: 6 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: 14,
            gap: 10,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              Diagnostic run
            </h2>
            <div style={{ color: C.textMed, fontSize: 12, marginTop: 2 }}>
              {selectedPort.path} @ {baudRate} baud
            </div>
          </div>
          <span style={{ flex: 1 }} />
          {!run.state.active ? (
            <button style={btnPrimary} onClick={() => void start()}>
              {run.state.succeeded === null ? "Start run" : "Run again"}
            </button>
          ) : (
            <button style={btnDanger} onClick={() => void run.cancel()}>
              Cancel
            </button>
          )}
        </div>

        {/* Options */}
        {!run.state.active && run.state.succeeded === null && (
          <div
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: 14,
              marginBottom: 14,
            }}
          >
            <label style={checkboxRow}>
              <input
                type="checkbox"
                checked={includeDescriptor}
                onChange={(e) => setIncludeDescriptor(e.target.checked)}
              />
              <span>
                Include DTC descriptor table at{" "}
                <code style={{ fontFamily: FONT_MONO }}>0x67358</code> (adds ~1
                min at 4 B/req)
              </span>
            </label>
            <label style={checkboxRow}>
              <input
                type="checkbox"
                checked={fullDump}
                onChange={(e) => {
                  setFullDump(e.target.checked);
                  if (!e.target.checked) setShowFullDumpWarning(false);
                }}
              />
              <span>
                <strong style={{ color: C.orange }}>
                  Full flash dump (very slow, ~1–3 hours)
                </strong>
              </span>
            </label>
          </div>
        )}

        {showFullDumpWarning && (
          <FullDumpWarning
            onCancel={() => {
              setShowFullDumpWarning(false);
              setFullDump(false);
            }}
            onConfirm={() => {
              setShowFullDumpWarning(false);
              void run.start({
                portPath: selectedPort.path,
                baudRate,
                scanBroadcast: true,
                scanDtc: true,
                includeDescriptorTable: includeDescriptor,
                fullFlashDump: true,
              });
            }}
          />
        )}

        {PHASE_ORDER.map((id) => (
          <PhaseCard
            key={id}
            label={PHASE_LABELS[id] ?? id}
            phase={run.state.phases[id]}
            emphasis={
              run.state.phases[id].status === "running" ||
              run.state.phases[id].status === "ok"
            }
          />
        ))}

        {run.state.errors.length > 0 && (
          <div
            style={{
              background: "#2a1018",
              border: `1px solid ${C.red}`,
              borderRadius: 8,
              padding: 14,
              marginTop: 6,
            }}
          >
            <h3 style={{ margin: "0 0 6px", color: C.red, fontSize: 13 }}>
              Errors
            </h3>
            {run.state.errors.map((e, i) => (
              <div key={i} style={{ marginBottom: 10, fontSize: 12 }}>
                <strong>{e.message}</strong>
                {e.why && (
                  <div style={{ color: C.textMed, marginTop: 2 }}>
                    <em>Why:</em> {e.why}
                  </div>
                )}
                {e.fix && (
                  <div style={{ color: C.cyan, marginTop: 2 }}>
                    <em>Fix:</em> {e.fix}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right column: wire log + warnings */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflow: "hidden",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: C.textMed,
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Live wire traffic
          </div>
          <WireLog entries={run.state.wire} maxHeight={360} />
        </div>

        {run.state.warnings.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: C.yellow,
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Warnings ({run.state.warnings.length})
            </div>
            <div
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                padding: 10,
                fontSize: 11,
                color: C.textMed,
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {run.state.warnings.map((w, i) => (
                <div key={i} style={{ marginBottom: 4 }}>
                  ⚠ {w}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FullDumpWarning({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  return (
    <div
      style={{
        background: "#2a2210",
        border: `1px solid ${C.orange}`,
        borderRadius: 8,
        padding: 16,
        marginBottom: 14,
      }}
    >
      <h3 style={{ margin: "0 0 8px", color: C.orange, fontSize: 14 }}>
        ⚠ Before you start a full flash dump, read this.
      </h3>
      <ul
        style={{
          margin: 0,
          paddingLeft: 20,
          fontSize: 12,
          color: C.text,
          lineHeight: 1.6,
        }}
      >
        <li>
          The dump reads flash <strong>4 bytes at a time</strong> over J1850
          VPW at ~10.4 kbit/s. A full 128 KB dump is roughly{" "}
          <strong>1–3 hours</strong>. Larger regions take proportionally longer.
        </li>
        <li>
          <strong>Put the vehicle battery on a tender.</strong> The ECU draws
          steady current during the whole dump. If the battery drops below
          ~11 V mid-session the ECU will stop responding and the dump will fail.
        </li>
        <li>
          <strong>
            Do not let your computer sleep, lock, or disconnect from USB
            during the run.
          </strong>{" "}
          Disable screen lock, sleep timers, and USB power-saving. Keep the
          lid open on a laptop.
        </li>
        <li>
          <strong>Keep the key in RUN, engine OFF, vehicle stationary.</strong>{" "}
          Do not unplug the adapter mid-dump.
        </li>
        <li>
          This is a <strong>read-only</strong> operation — nothing is written
          to the ECU. The worst case is a failed dump you can retry, never a
          brick.
        </li>
      </ul>
      <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
        <button style={btnDanger} onClick={onConfirm}>
          I understand — start the full dump
        </button>
        <button style={btnSecondary} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  background: C.cyan,
  color: "#001014",
  border: "none",
  padding: "10px 18px",
  borderRadius: 6,
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  background: "transparent",
  color: C.text,
  border: `1px solid ${C.border}`,
  padding: "10px 16px",
  borderRadius: 6,
  fontSize: 13,
  cursor: "pointer",
};

const btnDanger: React.CSSProperties = {
  background: C.orange,
  color: "#1a0e00",
  border: "none",
  padding: "10px 16px",
  borderRadius: 6,
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const checkboxRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  fontSize: 12,
  color: C.text,
  marginBottom: 8,
  cursor: "pointer",
};
