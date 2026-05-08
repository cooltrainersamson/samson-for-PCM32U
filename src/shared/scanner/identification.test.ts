import { describe, expect, it } from "vitest";
import { ElmDriver } from "../elm327/driver";
import { attachMockEcu } from "../mock-ecu/pcm32u-mock";
import {
  DEFAULT_PROBE_LADDER,
  findBroadcastCandidates,
  probeIdentificationServices,
} from "./identification";

function asciiBytes(s: string): number[] {
  return Array.from(s, (c) => c.charCodeAt(0));
}

async function makeDriver(
  identificationData?: ReadonlyMap<string, readonly number[]>,
): Promise<ElmDriver> {
  const { driverTransport } = await attachMockEcu({
    rejectMode23: true,
    identificationData,
  });
  const driver = new ElmDriver(driverTransport);
  await driver.attach();
  await driver.init();
  return driver;
}

describe("findBroadcastCandidates", () => {
  it("extracts every 4-letter all-uppercase substring, deduped", () => {
    const bytes = new Uint8Array(asciiBytes("...DRDX...DRDX...XXYY..."));
    expect(findBroadcastCandidates(bytes)).toEqual(["DRDX", "XXYY"]);
  });

  it("returns nothing when no 4-uppercase run is present", () => {
    expect(findBroadcastCandidates(new Uint8Array([0x00, 0x41, 0x42, 0x43])))
      .toEqual([]);
    expect(findBroadcastCandidates(new Uint8Array(asciiBytes("abcdEFGH123"))))
      .toEqual(["EFGH"]);
  });
});

describe("probeIdentificationServices", () => {
  it("records every probe attempt even when the ECU rejects them all", async () => {
    const driver = await makeDriver(); // empty identificationData → all 0x11
    const result = await probeIdentificationServices(driver);
    expect(result.attempts).toHaveLength(DEFAULT_PROBE_LADDER.length);
    expect(result.successfulProbes).toHaveLength(0);
    expect(result.broadcastCandidates).toEqual([]);
    expect(result.matchedBroadcast).toBeNull();
    expect(result.matchedSource).toBeNull();
    for (const a of result.attempts) {
      expect(a.outcome.kind).toBe("rejected");
      if (a.outcome.kind === "rejected") {
        expect(a.outcome.nrc).toBe(0x11);
        expect(a.outcome.nrcName).toBe("serviceNotSupported");
      }
    }
  });

  it("identifies a known broadcast when a probe returns ASCII containing it", async () => {
    // Mode 0x1A 0x87 returns padding + DRDX + padding. DRDX is in the
    // KNOWN_BROADCASTS registry (added in the Axiom commit), so we
    // expect a hit on the very first probe.
    const data = new Map<string, readonly number[]>([
      [
        "1a:87",
        asciiBytes("\x00\x00DRDX 02 6VE1 AT     \x00\x00"),
      ],
    ]);
    const driver = await makeDriver(data);
    const result = await probeIdentificationServices(driver);

    expect(result.matchedBroadcast).not.toBeNull();
    expect(result.matchedBroadcast?.code).toBe("DRDX");
    expect(result.matchedSource).toEqual({ service: 0x1a, identifier: 0x87 });
    expect(result.broadcastCandidates).toContain("DRDX");
    // Early exit: should have run at most one probe (the first that hit).
    expect(result.successfulProbes).toHaveLength(1);
    expect(result.attempts.length).toBeLessThanOrEqual(DEFAULT_PROBE_LADDER.length);
  });

  it("surfaces unknown 4-letter candidates when no known match", async () => {
    const data = new Map<string, readonly number[]>([
      ["1a:87", asciiBytes("\x00\x00ABCD calibration v3.0\x00")],
    ]);
    const driver = await makeDriver(data);
    const result = await probeIdentificationServices(driver);

    expect(result.matchedBroadcast).toBeNull();
    expect(result.matchedSource).toBeNull();
    expect(result.broadcastCandidates).toEqual(expect.arrayContaining(["ABCD"]));
    expect(result.successfulProbes).toHaveLength(1);
    expect(result.successfulProbes[0]!.spec.identifier).toBe(0x87);
  });

  it("falls through to Mode 0x12 when Mode 0x1A identifiers all fail", async () => {
    // No 0x1A entries; Mode 0x12 0xA1 has the broadcast
    const data = new Map<string, readonly number[]>([
      ["12:a1", asciiBytes("DRDX        Axiom 3.5L\x00")],
    ]);
    const driver = await makeDriver(data);
    const result = await probeIdentificationServices(driver);

    expect(result.matchedBroadcast?.code).toBe("DRDX");
    expect(result.matchedSource).toEqual({ service: 0x12, identifier: 0xa1 });
    // Confirms we attempted every 0x1A probe before reaching Mode 0x12.
    const services = result.attempts.map((a) => a.spec.service);
    expect(services).toContain(0x1a);
    expect(services).toContain(0x12);
  });

  it("records non-ASCII success without a candidate", async () => {
    // Mode 0x1A 0x88 returns 4 binary bytes (CVN-style hash), no ASCII run
    const data = new Map<string, readonly number[]>([
      ["1a:88", [0xde, 0xad, 0xbe, 0xef]],
    ]);
    const driver = await makeDriver(data);
    const result = await probeIdentificationServices(driver);

    const cvn = result.attempts.find(
      (a) => a.spec.service === 0x1a && a.spec.identifier === 0x88,
    )!;
    expect(cvn.outcome.kind).toBe("success");
    if (cvn.outcome.kind === "success") {
      expect(Array.from(cvn.outcome.bytes)).toEqual([0xde, 0xad, 0xbe, 0xef]);
      expect(cvn.outcome.broadcastCandidates).toEqual([]);
    }
    expect(result.matchedBroadcast).toBeNull();
  });
});
