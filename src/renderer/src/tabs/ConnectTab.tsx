import { useCallback, useEffect, useState, type JSX } from "react";
import { C, FONT_MONO, FONT_SANS } from "../tokens";
import type { PortInfo } from "@shared/ipc/events";

const BAUD_RATES = [115200, 38400, 9600, 57600, 230400, 500000];

export function ConnectTab({
  selectedPort,
  onSelectPort,
  baudRate,
  onChangeBaud,
  onContinue,
}: {
  selectedPort: PortInfo | null;
  onSelectPort: (p: PortInfo | null) => void;
  baudRate: number;
  onChangeBaud: (n: number) => void;
  onContinue: () => void;
}): JSX.Element {
  const [ports, setPorts] = useState<PortInfo[] | null>(null);
  const [error, setError] = useState<{ message: string; why?: string; fix?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await window.samson.listPorts();
      setPorts(list);
    } catch (err) {
      const e = err as { message: string; why?: string; fix?: string };
      setError({
        message: e.message ?? String(err),
        why: e.why,
        fix: e.fix,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        padding: "24px 32px",
        fontFamily: FONT_SANS,
      }}
    >
      <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700 }}>
        Connect an OBD-II adapter
      </h2>
      <p style={{ color: C.textMed, fontSize: 13, maxWidth: 680 }}>
        This tool works with any ELM327-compatible USB serial adapter that
        supports the J1850 VPW protocol — OBDLink SX, Vgate iCar, Veepeak, or
        generic ELM327 v1.5+ clones on FTDI, CH340, or CP210x silicon.
      </p>
      <p style={{ color: C.textMed, fontSize: 13, maxWidth: 680 }}>
        Plug the adapter in, turn the vehicle key to <strong>RUN (do not start the
        engine)</strong>, and pick the port below.
      </p>

      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 12, color: C.text }}>
            SERIAL PORT
          </span>
          <button
            onClick={() => void refresh()}
            style={btnSecondary}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {error && (
          <div style={errorBox}>
            <strong style={{ color: C.red }}>⚠ {error.message}</strong>
            {error.why && (
              <p style={{ margin: "6px 0 0" }}>
                <em style={{ color: C.textMed }}>Why:</em> {error.why}
              </p>
            )}
            {error.fix && (
              <p style={{ margin: "4px 0 0" }}>
                <em style={{ color: C.tiffany }}>Fix:</em> {error.fix}
              </p>
            )}
          </div>
        )}

        {ports && ports.length === 0 && !error && (
          <div style={emptyBox}>
            <p style={{ margin: 0, color: C.yellow }}>
              No serial ports found.
            </p>
            <p style={{ margin: "6px 0 0", color: C.textMed, fontSize: 12 }}>
              Plug the adapter into a USB port, wait 2 seconds, and click
              Refresh. On Linux, make sure your user is in the{" "}
              <code>dialout</code> group. On Windows with a CH340 clone, you
              may need to install the CH341SER driver.
            </p>
          </div>
        )}

        {ports && ports.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {ports.map((p) => {
              const active = selectedPort?.path === p.path;
              return (
                <button
                  key={p.path}
                  onClick={() => onSelectPort(p)}
                  style={{
                    ...portCard,
                    borderColor: active ? C.tiffany : C.border,
                    background: active ? C.surfaceHi : C.surface,
                  }}
                >
                  <div style={{ fontWeight: 600, color: C.text, fontFamily: FONT_MONO }}>
                    {p.path}
                  </div>
                  <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
                    {p.manufacturer ?? p.friendlyName ?? "(unknown device)"}
                    {p.vendorId
                      ? ` · VID:${p.vendorId} PID:${p.productId ?? "?"}`
                      : ""}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <span
          style={{
            display: "block",
            fontWeight: 600,
            fontSize: 12,
            color: C.text,
            marginBottom: 8,
          }}
        >
          BAUD RATE
        </span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {BAUD_RATES.map((b) => (
            <button
              key={b}
              onClick={() => onChangeBaud(b)}
              style={{
                ...baudChip,
                borderColor: b === baudRate ? C.tiffany : C.border,
                color: b === baudRate ? C.tiffany : C.textMed,
              }}
            >
              {b}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: C.textDim, marginTop: 8, maxWidth: 680 }}>
          OBDLink SX defaults to 115200. Cheap ELM327 clones often default to
          38400 or 9600. If the first init attempt fails with an "ATZ timed
          out" error, try a different baud rate here and click Continue again.
        </p>
      </div>

      <div style={{ marginTop: 28, display: "flex", gap: 12 }}>
        <button
          onClick={onContinue}
          disabled={!selectedPort}
          style={{
            ...btnPrimary,
            opacity: selectedPort ? 1 : 0.4,
            cursor: selectedPort ? "pointer" : "not-allowed",
          }}
        >
          Continue to Identify →
        </button>
      </div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  background: C.tiffany,
  color: "#081210",
  border: "none",
  padding: "12px 20px",
  borderRadius: 6,
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  background: "transparent",
  color: C.text,
  border: `1px solid ${C.border}`,
  padding: "6px 14px",
  borderRadius: 4,
  fontSize: 12,
  cursor: "pointer",
};

const errorBox: React.CSSProperties = {
  marginTop: 10,
  padding: 14,
  borderRadius: 6,
  background: "#2a1018",
  color: C.text,
  border: `1px solid ${C.red}`,
  fontSize: 12,
  lineHeight: 1.5,
};

const emptyBox: React.CSSProperties = {
  marginTop: 10,
  padding: 14,
  borderRadius: 6,
  background: C.surface,
  border: `1px dashed ${C.border}`,
};

const portCard: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: C.surface,
  border: "1px solid",
  borderRadius: 6,
  padding: "12px 14px",
  marginBottom: 8,
  cursor: "pointer",
  transition: "all 120ms",
};

const baudChip: React.CSSProperties = {
  background: C.surface,
  border: "1px solid",
  borderRadius: 4,
  padding: "6px 12px",
  fontFamily: FONT_MONO,
  fontSize: 12,
  cursor: "pointer",
};
