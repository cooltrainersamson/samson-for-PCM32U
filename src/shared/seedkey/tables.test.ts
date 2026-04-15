import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { T1_HEX_RAW, T2_HEX_RAW, algoTableToBytes, ALGO_TABLES } from "./tables";

// Hash anchors from pcm32u_tuner_v3.jsx header comment and handoff §6.
// If these fail, the tables were mis-pasted when porting from the JSX.
const T1_SHA256 =
  "f1d263b202207acba47539178eecb9cb2015fb5fcded23c22d22ef3b34aa2986";
const T2_SHA256 =
  "43fcce5b068e0ae19c394212e4bf9e5db07b4bcab001c81d0e1a6ba0f8c1e8a2";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("seed-key table integrity", () => {
  it("T1 raw bytes match the DllSecurity.dll extraction hash", () => {
    expect(sha256(algoTableToBytes(T1_HEX_RAW))).toBe(T1_SHA256);
  });

  it("T2 raw bytes match the DllSecurity.dll extraction hash", () => {
    expect(sha256(algoTableToBytes(T2_HEX_RAW))).toBe(T2_SHA256);
  });

  it("both tables decode to exactly 256 algo entries with 4 rounds each", () => {
    for (const t of [1, 2] as const) {
      expect(ALGO_TABLES[t]).toHaveLength(256);
      for (const entry of ALGO_TABLES[t]) {
        expect(entry).toHaveLength(4);
        for (const round of entry) {
          expect(round).toHaveLength(3);
          for (const byte of round) {
            expect(byte).toBeGreaterThanOrEqual(0);
            expect(byte).toBeLessThanOrEqual(0xff);
          }
        }
      }
    }
  });
});
