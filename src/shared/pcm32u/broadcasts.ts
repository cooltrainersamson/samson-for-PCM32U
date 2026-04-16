// Known PCM32U broadcast codes. Ported verbatim from pcm32u_tuner_v3.jsx
// (the user's working reference). A broadcast is a 4-ASCII-character tag
// stored in flash that uniquely identifies a vehicle/variant combination.
// The project owner is still extending this list — the tool's job is to
// surface *unknown* 4-letter ASCII runs in the config window so he can
// extend it.

export interface BroadcastProfile {
  readonly code: string;
  readonly year: string;
  readonly market: string;
  readonly trans: "AT" | "MT" | "—";
  readonly wb: string;
  readonly configBase: number;
  readonly dtcBase: number;
  readonly engine: string;
  readonly vehicle: string;
}

export const KNOWN_BROADCASTS: Readonly<Record<string, BroadcastProfile>> = {
  DNYY: {
    code: "DNYY",
    year: "02",
    market: "UESUS",
    trans: "AT",
    wb: "SWB",
    configBase: 0x018280,
    dtcBase: 0x00f948,
    engine: "6VD1 3.2L",
    vehicle: "Rodeo Sport",
  },
  DLYW: {
    code: "DLYW",
    year: "02",
    market: "UESUS",
    trans: "AT",
    wb: "—",
    configBase: 0x018280,
    dtcBase: 0x00f948,
    engine: "6VE1 3.5L",
    vehicle: "Trooper",
  },
  DNBN: {
    code: "DNBN",
    year: "02",
    market: "UESUS",
    trans: "AT",
    wb: "—",
    configBase: 0x018280,
    dtcBase: 0x00fb88,
    engine: "6VE1 3.5L",
    vehicle: "Trooper (alt)",
  },
  DSPX: {
    code: "DSPX",
    year: "03",
    market: "UESUS",
    trans: "MT",
    wb: "LWB",
    configBase: 0x0182b8,
    dtcBase: 0x00f950,
    engine: "6VE1 3.5L",
    vehicle: "Frontera",
  },
};

/** Address window to scan for the broadcast tag. Covers every known configBase ±32. */
export const BROADCAST_SCAN_RANGE = {
  start: 0x018270,
  end: 0x0182e0,
} as const;
