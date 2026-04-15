import { describe, expect, it } from "vitest";
import { computeKey } from "./index";

describe("seed-key transform", () => {
  // Live-verified on DNYY 2026-04-09: seed 0x32E0 under algo 0x31 / table 1
  // produced key 0x7C73 and unlocked the real ECU. This is the canonical
  // correctness anchor — if this fails, the tables were misparsed.
  it("DNYY live vector: seed 0x32E0, algo 0x31, table 1 -> key 0x7C73", () => {
    expect(computeKey(0x32e0, { algo: 0x31, table: 1 })).toBe(0x7c73);
  });

  it("algo 0 returns bitwise NOT of seed (seed 0x0000 -> 0xFFFF)", () => {
    expect(computeKey(0x0000, { algo: 0x00, table: 1 })).toBe(0xffff);
  });

  it("algo 0 returns bitwise NOT of seed (seed 0xFFFF -> 0x0000)", () => {
    expect(computeKey(0xffff, { algo: 0x00, table: 1 })).toBe(0x0000);
  });

  it("brute-force: exactly one algo in 0x00-0xFF matches the DNYY vector", () => {
    let matches = 0;
    let matchedAlgo = -1;
    for (let a = 0; a <= 0xff; a++) {
      try {
        if (computeKey(0x32e0, { algo: a, table: 1 }) === 0x7c73) {
          matches++;
          matchedAlgo = a;
        }
      } catch {
        // stub throws — acceptable for commit 1
      }
    }
    expect(matches).toBe(1);
    expect(matchedAlgo).toBe(0x31);
  });
});
