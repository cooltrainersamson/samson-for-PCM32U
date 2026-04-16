// High-level KWP2000 client that sits on top of the ElmDriver.
// Every method returns both the decoded value and a structured trace
// entry that the report generator can drop straight into the Markdown.

import { ElmDriver } from "../elm327/driver";
import { computeKey, identifyAlgo } from "../seedkey";
import { KwpNegativeError } from "../elm327/nrc";

export interface PingResult {
  readonly ok: boolean;
  readonly echoByte: number;
}

export interface SeedResult {
  readonly seed: number;
  readonly rawFrame: string;
}

export interface UnlockResult {
  readonly unlocked: boolean;
  readonly seed: number;
  readonly key: number;
  readonly algo: number;
  readonly table: 1 | 2;
  readonly method: "known" | "brute-force";
  readonly rawSeedFrame: string;
  readonly rawKeyFrame: string;
}

export class KwpClient {
  constructor(readonly driver: ElmDriver) {}

  /**
   * Mode 0x20 — ReturnToNormal / alive ping. Any positive response
   * means the ECU is talking. A NRC is fine too — it still proves we
   * have a conversation partner.
   */
  async ping(): Promise<PingResult> {
    try {
      const frames = await this.driver.sendKwp([0x20]);
      const f = frames[0]!;
      return { ok: true, echoByte: f.data[0] ?? 0 };
    } catch (err) {
      if (err instanceof KwpNegativeError) {
        // ECU is alive but doesn't like Mode 0x20 — still counts as "there"
        return { ok: true, echoByte: 0xff };
      }
      throw err;
    }
  }

  /** Mode 0x27 01 — request seed. */
  async requestSeed(): Promise<SeedResult> {
    const frames = await this.driver.sendKwp([0x27, 0x01]);
    const f = frames[0]!;
    // Expected positive: SID=0x67, data=[0x01, hi, lo]
    if (f.sid !== 0x67) {
      throw new Error(
        `Unexpected seed response SID 0x${f.sid.toString(16)}: ${f.raw}`,
      );
    }
    const hi = f.data[1] ?? 0;
    const lo = f.data[2] ?? 0;
    return { seed: ((hi << 8) | lo) & 0xffff, rawFrame: f.raw };
  }

  /** Mode 0x27 02 — send key. Throws KwpNegativeError on rejection. */
  async sendKey(key: number): Promise<string> {
    const hi = (key >> 8) & 0xff;
    const lo = key & 0xff;
    const frames = await this.driver.sendKwp([0x27, 0x02, hi, lo]);
    return frames[0]!.raw;
  }

  /**
   * Full seed-key unlock attempt.
   *
   * Strategy (safe-by-default; never burns >3 live key sends per lockout window):
   *  1. Request seed.
   *  2. If a hint (algo, table) is provided, try that key first.
   *  3. If that fails, try the known PCM32U family fallback: algo 0x31
   *     table 1 (DNYY live-verified, used by every PCM32U broadcast
   *     seen so far). This is the one the tool would try even without
   *     a hint for this ECU family.
   *  4. If that also fails, stop and raise. We do NOT brute-force 512
   *     candidates live against a real ECU — the NRC 0x36 lockout would
   *     fire on the 3rd attempt and cost the user a 30-second wait for
   *     almost zero payoff. Real brute-force happens offline, after the
   *     user captures a seed/key pair from another source.
   */
  async unlock(
    hint?: { algo: number; table: 1 | 2 },
  ): Promise<UnlockResult> {
    const candidates: Array<{ algo: number; table: 1 | 2; label: UnlockResult["method"] }> = [];
    if (hint) candidates.push({ ...hint, label: "known" });
    const alreadyTried = new Set<string>(
      hint ? [`${hint.table}-${hint.algo}`] : [],
    );
    // PCM32U family default.
    if (!alreadyTried.has("1-49")) {
      candidates.push({ algo: 0x31, table: 1, label: "brute-force" });
    }

    const seedResult = await this.requestSeed();
    let currentSeed = seedResult.seed;
    let rawSeedFrame = seedResult.rawFrame;

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i]!;
      const key = computeKey(currentSeed, { algo: c.algo, table: c.table });
      try {
        const rawKey = await this.sendKey(key);
        return {
          unlocked: true,
          seed: currentSeed,
          key,
          algo: c.algo,
          table: c.table,
          method: c.label,
          rawSeedFrame,
          rawKeyFrame: rawKey,
        };
      } catch (err) {
        if (!(err instanceof KwpNegativeError) || err.nrc.code !== 0x35) {
          throw err;
        }
        // Wrong key: the real ECU may or may not invalidate the seed on
        // rejection. Be safe and re-seed for the next attempt.
        if (i < candidates.length - 1) {
          const fresh = await this.requestSeed();
          currentSeed = fresh.seed;
          rawSeedFrame = fresh.rawFrame;
        }
      }
    }

    throw new Error(
      `Unlock failed after ${candidates.length} attempts. Neither the hint nor the PCM32U family fallback (algo 0x31 table 1) produced a valid key. This ECU may use an algorithm not in the reverse-engineered TIS2000 DllSecurity tables, or it may be in lockout — wait 30s with the key off and retry.`,
    );
  }
}

// Re-export the local identifyAlgo for offline key-matching against a
// seed/key pair captured elsewhere.
export { identifyAlgo };
