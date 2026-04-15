// Seed-key transform for the PCM32U ECU.
//
// Full implementation lands in commit 2. This stub exists so the unit tests
// fail loudly until the port from pcm32u_tuner_v3.jsx is in place.

export interface SeedKeyOptions {
  algo: number;
  table: 1 | 2;
}

export function computeKey(_seed: number, _opts: SeedKeyOptions): number {
  throw new Error("computeKey not yet implemented (commit 2)");
}
