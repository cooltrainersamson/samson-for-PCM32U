import type { JSX } from "react";
import { C, FONT_SANS } from "../tokens";

export function ComingSoonTab(): JSX.Element {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        fontFamily: FONT_SANS,
      }}
    >
      <div
        style={{
          maxWidth: 640,
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: "32px 36px",
        }}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: 22, color: C.orange }}>
          Tuning features are not available in this build.
        </h2>
        <p style={{ color: C.text, fontSize: 14, lineHeight: 1.6 }}>
          Samson for PCM32U is currently a <strong>read-only diagnostic
          tool</strong>. Flash writing, tuning table editors, DTC toggling,
          and kernel-based features are intentionally not implemented.
        </p>
        <p style={{ color: C.textMed, fontSize: 13, lineHeight: 1.6 }}>
          Writing to a PCM32U ECU requires reverse-engineering work that is
          still in progress. Shipping unverified write capability in this
          build would risk bricking users' ECUs. When the write path has been
          validated on a bench rig, these features will unlock in a signed
          release — not before.
        </p>
        <p style={{ color: C.textMed, fontSize: 13, lineHeight: 1.6 }}>
          The most useful thing you can do to speed this up is{" "}
          <strong>run the Identify flow and email the report</strong> to the
          project owner. Every unknown broadcast and every unknown DTC
          candidate in a real-world ECU dump makes the characterization more
          complete.
        </p>
        <div
          style={{
            marginTop: 20,
            padding: 14,
            background: "#05070a",
            borderRadius: 6,
            border: `1px solid ${C.border}`,
            color: C.textDim,
            fontSize: 12,
          }}
        >
          Sections explicitly <em>not</em> in this build:
          <ul style={{ margin: "8px 0 0 20px", padding: 0 }}>
            <li>VE tables / ignition tables / scalar editors</li>
            <li>DTC enable/disable toggles</li>
            <li>Flash write or flash erase</li>
            <li>Mode 0x34 RequestDownload / Mode 0x36 TransferData</li>
            <li>Kernel upload and execution</li>
            <li>Any service that modifies ECU persistent state</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
