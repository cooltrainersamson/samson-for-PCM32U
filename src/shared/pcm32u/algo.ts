// Broadcast → seed-key algo mapping. The ECU doesn't transmit which algo
// to use directly — the tool reads the broadcast code from flash and
// looks it up here. This is how TIS2000 works: the vehicle selection
// screen gives TIS2000 the broadcast, and it looks up the algo from
// DllSecurity.dll's internal tables.
//
// Session mode determines which table:
//   mode != 3 → Table 1 (primary)
//   mode == 3 → Table 2 (secondary)
// PCM32U family uses Table 1 exclusively (default diagnostic session).

export interface AlgoMapping {
  readonly table: 1 | 2;
  readonly algo: number;
  readonly note: string;
}

export const BROADCAST_ALGO: Readonly<Record<string, AlgoMapping>> = {
  DNYY: { table: 1, algo: 0x31, note: "confirmed live 2026-04-09" },
  DLYW: { table: 1, algo: 0x31, note: "presumed — same PCM32U family" },
  DNBN: { table: 1, algo: 0x31, note: "presumed — same PCM32U family" },
  DSPX: { table: 1, algo: 0x31, note: "presumed — same PCM32U family" },
  DRDX: { table: 1, algo: 0x31, note: "confirmed live 2026-04-18 (Axiom 3.5L AT)" },
};

// Fallback algos to try when the broadcast is unknown or not in the table.
// Ordered by likelihood based on the PCM32U family characterization.
export const FAMILY_FALLBACK_ALGOS: readonly AlgoMapping[] = [
  { table: 1, algo: 0x31, note: "PCM32U family default" },
  { table: 2, algo: 0x31, note: "PCM32U family default, alternate table" },
];

/**
 * Given a broadcast code, return the algo mapping. Returns null if the
 * broadcast is unknown — caller should use FAMILY_FALLBACK_ALGOS.
 */
export function algoForBroadcast(broadcast: string): AlgoMapping | null {
  return BROADCAST_ALGO[broadcast] ?? null;
}
