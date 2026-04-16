// Visual tokens. Tiffany blue (#81D8D0) + dark orange (#D4700A) accent
// language on a near-black surface. Functional colors (green/red/yellow)
// kept separate from accent colors for status clarity.

export const C = {
  bg: "#08090d",
  surface: "#0f1117",
  surfaceHi: "#151820",
  hover: "#1a1e28",
  border: "#1c2030",
  borderActive: "#28303e",
  // ── Accent pair ──
  tiffany: "#81D8D0",
  tiffanyDim: "#4DA8A2",
  orange: "#D4700A",
  orangeLight: "#E8921A",
  // ── Functional status ──
  green: "#00e676",
  red: "#ff3d5a",
  yellow: "#ffd740",
  purple: "#b388ff",
  magenta: "#ff4081",
  // ── Text ──
  text: "#e8eaf0",
  textMed: "#8892a4",
  textDim: "#4a5268",
  enabled: "#ff3d5a",
  disabled: "#00e676",
} as const;

export const FONT_MONO =
  "'IBM Plex Mono','SF Mono','Consolas',monospace";
export const FONT_SANS = "'DM Sans','Segoe UI',sans-serif";

export const RADIUS = {
  sm: 4,
  md: 6,
  lg: 10,
} as const;
