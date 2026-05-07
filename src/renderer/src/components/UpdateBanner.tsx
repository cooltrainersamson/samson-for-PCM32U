// Auto-update banner. Renders nothing while idle/checking/current; only
// surfaces when the user has something actionable (update found,
// downloading, ready to install, or error).

import { type JSX } from "react";
import { C, FONT_SANS } from "../tokens";
import type { UpdateState } from "../useUpdates";

export function UpdateBanner({
  state,
  onInstall,
}: {
  state: UpdateState;
  onInstall: () => void;
}): JSX.Element | null {
  if (state.kind === "idle" || state.kind === "checking" || state.kind === "current") {
    return null;
  }

  const content = renderContent(state, onInstall);
  if (!content) return null;

  return (
    <div
      style={{
        background: content.bg,
        color: content.fg,
        borderBottom: `1px solid ${content.border}`,
        padding: "8px 16px",
        fontFamily: FONT_SANS,
        fontSize: 12.5,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          flex: "0 0 auto",
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: content.iconBg,
          color: content.iconFg,
          fontSize: 11,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {content.glyph}
      </div>
      <div style={{ flex: 1, lineHeight: 1.4 }}>
        <strong>{content.headline}</strong>
        {content.detail && (
          <span style={{ marginLeft: 8, color: content.detailFg }}>
            {content.detail}
          </span>
        )}
      </div>
      {content.cta && (
        <button
          type="button"
          onClick={content.cta.onClick}
          style={{
            background: content.cta.bg,
            color: content.cta.fg,
            border: "none",
            padding: "5px 12px",
            borderRadius: 5,
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {content.cta.label}
        </button>
      )}
    </div>
  );
}

interface BannerContent {
  readonly bg: string;
  readonly fg: string;
  readonly border: string;
  readonly iconBg: string;
  readonly iconFg: string;
  readonly glyph: string;
  readonly headline: string;
  readonly detail?: string;
  readonly detailFg?: string;
  readonly cta?: {
    readonly label: string;
    readonly onClick: () => void;
    readonly bg: string;
    readonly fg: string;
  };
}

function renderContent(
  state: UpdateState,
  onInstall: () => void,
): BannerContent | null {
  switch (state.kind) {
    case "available":
      return {
        bg: "#0d2a3d",
        fg: C.text,
        border: C.tiffany,
        iconBg: C.tiffany,
        iconFg: "#081210",
        glyph: "↑",
        headline: `Version ${state.version} is available.`,
        detail: state.canAutoInstall
          ? "Downloading in the background — you'll get a prompt when it's ready."
          : "macOS auto-install isn't available; click below to download from GitHub.",
        detailFg: C.textMed,
        cta: state.canAutoInstall
          ? undefined
          : {
              label: "Open download page",
              onClick: onInstall,
              bg: C.tiffany,
              fg: "#081210",
            },
      };
    case "downloading":
      return {
        bg: "#0a1820",
        fg: C.text,
        border: C.border,
        iconBg: C.tiffany + "30",
        iconFg: C.tiffany,
        glyph: "↓",
        headline: `Downloading update — ${Math.floor(state.percent)}%`,
      };
    case "ready":
      return {
        bg: "#0f3525",
        fg: C.text,
        border: C.green,
        iconBg: C.green,
        iconFg: "#081210",
        glyph: "✓",
        headline: `Version ${state.version} is ready to install.`,
        detail: "Click to relaunch with the new version.",
        detailFg: C.textMed,
        cta: {
          label: "Restart and install",
          onClick: onInstall,
          bg: C.green,
          fg: "#081210",
        },
      };
    case "error":
      return {
        bg: "#3a0a14",
        fg: C.text,
        border: C.red,
        iconBg: C.red,
        iconFg: "#081210",
        glyph: "!",
        headline: "Update check failed.",
        detail: state.message,
        detailFg: C.textMed,
      };
    default:
      return null;
  }
}
