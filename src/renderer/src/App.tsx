import { useEffect, useState, type JSX } from "react";
import { C, FONT_SANS } from "./tokens";
import { ConnectTab } from "./tabs/ConnectTab";
import { IdentifyTab } from "./tabs/IdentifyTab";
import { ReportTab } from "./tabs/ReportTab";
import { ComingSoonTab } from "./tabs/ComingSoonTab";
import { useRun } from "./useRun";
import type { PortInfo } from "@shared/ipc/events";

type TabId = "connect" | "identify" | "report" | "coming-soon";

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: "connect", label: "Connect", hint: "Pick an adapter" },
  { id: "identify", label: "Identify", hint: "Run the diagnostic" },
  { id: "report", label: "Report", hint: "Review & save" },
  { id: "coming-soon", label: "Coming Soon", hint: "Write features (disabled)" },
];

export function App(): JSX.Element {
  const [tab, setTab] = useState<TabId>("connect");
  const [selectedPort, setSelectedPort] = useState<PortInfo | null>(null);
  const [baudRate, setBaudRate] = useState(115200);
  const [version, setVersion] = useState<string>("");
  const run = useRun();

  useEffect(() => {
    void window.samson.getVersion().then(setVersion);
  }, []);

  // Auto-advance to Identify when connect completes.
  useEffect(() => {
    if (run.state.phases.connect.status === "ok" && tab === "connect") {
      setTab("identify");
    }
  }, [run.state.phases.connect.status, tab]);

  // Auto-advance to Report when a run completes.
  useEffect(() => {
    if (run.state.succeeded !== null) {
      setTab("report");
    }
  }, [run.state.succeeded]);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: C.bg,
        color: C.text,
        fontFamily: FONT_SANS,
      }}
    >
      <TitleBar version={version} run={run.state} />
      <TabStrip tabs={TABS} current={tab} onChange={setTab} />
      <div style={{ flex: 1, overflow: "hidden" }}>
        {tab === "connect" && (
          <ConnectTab
            selectedPort={selectedPort}
            onSelectPort={setSelectedPort}
            baudRate={baudRate}
            onChangeBaud={setBaudRate}
            onContinue={() => setTab("identify")}
          />
        )}
        {tab === "identify" && (
          <IdentifyTab
            selectedPort={selectedPort}
            baudRate={baudRate}
            run={run}
          />
        )}
        {tab === "report" && <ReportTab run={run} />}
        {tab === "coming-soon" && <ComingSoonTab />}
      </div>
      <StatusBar run={run.state} currentPhase={run.currentPhase} />
    </div>
  );
}

function TitleBar({
  version,
  run,
}: {
  version: string;
  run: ReturnType<typeof useRun>["state"];
}): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "14px 24px 14px 80px",
        borderBottom: `1px solid ${C.border}`,
        background: C.surface,
        WebkitAppRegion: "drag",
      } as React.CSSProperties}
    >
      <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>
        <span style={{ color: C.tiffany }}>⬡</span>{" "}
        Samson for PCM32U
      </span>
      <span style={{ color: C.textDim, marginLeft: 10, fontSize: 12 }}>
        v{version || "0.0.1"} · read-only diagnostic tool
      </span>
      <span style={{ flex: 1 }} />
      {run.active && (
        <span style={{ color: C.tiffany, fontSize: 12 }}>● run in progress…</span>
      )}
      {run.succeeded === true && (
        <span style={{ color: C.green, fontSize: 12 }}>● run complete</span>
      )}
      {run.succeeded === false && (
        <span style={{ color: C.red, fontSize: 12 }}>● run failed</span>
      )}
    </div>
  );
}

function TabStrip({
  tabs,
  current,
  onChange,
}: {
  tabs: { id: TabId; label: string; hint: string }[];
  current: TabId;
  onChange: (id: TabId) => void;
}): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        borderBottom: `1px solid ${C.border}`,
        background: C.surface,
      }}
    >
      {tabs.map((t) => {
        const active = t.id === current;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              background: active ? C.surfaceHi : "transparent",
              border: "none",
              borderBottom: active
                ? `2px solid ${C.tiffany}`
                : "2px solid transparent",
              color: active ? C.text : C.textMed,
              padding: "14px 20px",
              cursor: "pointer",
              fontFamily: FONT_SANS,
              fontSize: 14,
              fontWeight: 600,
              transition: "all 120ms",
            }}
          >
            {t.label}
            <span
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 400,
                color: C.textDim,
                marginTop: 2,
              }}
            >
              {t.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StatusBar({
  run,
  currentPhase,
}: {
  run: ReturnType<typeof useRun>["state"];
  currentPhase: string | null;
}): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 24px",
        borderTop: `1px solid ${C.border}`,
        background: C.surface,
        fontSize: 11,
        color: C.textDim,
      }}
    >
      <span>
        {run.active
          ? `Running: ${currentPhase ?? "…"}`
          : run.succeeded === true
            ? "Idle · last run succeeded"
            : run.succeeded === false
              ? "Idle · last run failed (report still available)"
              : "Idle"}
      </span>
      <span style={{ flex: 1 }} />
      <span>
        {run.wire.length} wire events · {run.warnings.length} warnings ·{" "}
        {run.errors.length} errors
      </span>
    </div>
  );
}
