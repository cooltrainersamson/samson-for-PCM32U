import { describe, expect, it } from "vitest";
import { ElmDriver } from "../elm327/driver";
import { KwpClient } from "../kwp/client";
import { attachMockEcu } from "../mock-ecu/pcm32u-mock";
import { createDnyyFixture } from "../pcm32u/fixture";
import { scanBroadcast, analyzeBroadcastWindow } from "./broadcast";
import { scanDtcTables } from "./dtc";
import { readMemory, getRmbaFlavor } from "../kwp/rmba";

async function makeUnlockedDriver(fixtureOpts: Parameters<typeof createDnyyFixture>[0] = {}) {
  const flash = createDnyyFixture(fixtureOpts);
  const { driverTransport } = await attachMockEcu({
    flash,
    requireUnlockForRmba: true,
  });
  const driver = new ElmDriver(driverTransport);
  await driver.attach();
  await driver.init();
  const client = new KwpClient(driver);
  await client.unlock({ algo: 0x31, table: 1 });
  return { driver, client };
}

describe("RMBA + scanners against a DNYY fixture", () => {
  it("readMemory chunks a window and reassembles bytes correctly", async () => {
    const { driver } = await makeUnlockedDriver();
    const res = await readMemory(driver, 0x01827c, 8);
    expect(res.bytes.length).toBe(8);
    // First 4 bytes are 'DNYY' per the fixture
    expect(String.fromCharCode(...res.bytes.slice(0, 4))).toBe("DNYY");
    expect(res.chunksRead).toBeGreaterThanOrEqual(2);
  });

  it("scanBroadcast identifies DNYY from a real-shaped window", async () => {
    const { driver } = await makeUnlockedDriver();
    const result = await scanBroadcast(driver);
    expect(result.matched?.code).toBe("DNYY");
    expect(result.matchAddr).toBe(0x01827c);
    expect(result.asciiRuns.map((r) => r.text)).toContain("DNYY");
  });

  it("analyzeBroadcastWindow surfaces unknown candidates when no known match exists", () => {
    const bytes = new Uint8Array(64);
    bytes.fill(0xff);
    // Plant an unknown 4-letter ASCII run
    const str = "ZZZZ";
    for (let i = 0; i < 4; i++) bytes[20 + i] = str.charCodeAt(i);
    const result = analyzeBroadcastWindow(bytes, 0x018270);
    expect(result.matched).toBeNull();
    expect(result.candidates.map((c) => c.text)).toContain("ZZZZ");
  });

  it("scanDtcTables reports all known DTCs at their default bytes and finds zero unknowns on a clean fixture", async () => {
    const { driver } = await makeUnlockedDriver();
    const result = await scanDtcTables(driver);
    // Every DTC_DB entry should be present (the fixture seeds the entire
    // table from DTC_DB defaults), and each should match its default.
    const { DTC_DB } = await import("../pcm32u/dtcs");
    expect(result.known).toHaveLength(DTC_DB.length);
    for (const k of result.known) {
      expect(k.matchesDefault).toBe(true);
    }
    // Some entries have defaultByte = 0x60 (deliberately suppressed in
    // the calibration); those decode as not-enabled. Everything that *is*
    // enabled should sit in the bit-7-set range.
    const enabledCount = result.known.filter((k) => k.enabled).length;
    const expectedEnabled = DTC_DB.filter((e) => (e.defaultByte & 0x80) !== 0).length;
    expect(enabledCount).toBe(expectedEnabled);
    // Fixture seeds only DTC_DB addresses with non-zero bytes, so any
    // unknown candidate found is by construction not in the DB.
    expect(result.unknownCandidates).toEqual([]);
  }, 30000);

  it("scanDtcTables detects an injected unknown DTC candidate", async () => {
    // 0x00fcdc is a slot the live DRDX dump shows with a non-standard
    // enable byte (0x28) but isn't in DTC_DB — useful as an "unknown"
    // injection point that won't get auto-classified as known.
    const injectAt = 0x00fcdc;
    const { driver } = await makeUnlockedDriver({
      extraUnknownDtcAddr: injectAt,
    });
    const result = await scanDtcTables(driver);
    expect(result.unknownCandidates.length).toBeGreaterThan(0);
    expect(result.unknownCandidates.some((u) => u.addr === injectAt)).toBe(true);
  }, 30000);

  it("auto-detects axiom-flavor RMBA: size>1 NRC 0x12 → switch to size=1, parse 2-byte addr echo", async () => {
    const flash = createDnyyFixture();
    const { driverTransport } = await attachMockEcu({
      flash,
      rmbaFlavor: "axiom",
    });
    const driver = new ElmDriver(driverTransport);
    await driver.attach();
    await driver.init();
    // No prior detection — first read should probe DNYY, get NRC 0x12,
    // fall back to axiom, succeed, and cache "axiom" for later reads.
    expect(getRmbaFlavor(driver)).toBeNull();
    const res = await readMemory(driver, 0x01827c, 4);
    expect(getRmbaFlavor(driver)).toBe("axiom");
    expect(String.fromCharCode(...res.bytes)).toBe("DNYY");
  });

  it("scanBroadcast works against an axiom-flavor mock (full window read)", async () => {
    const flash = createDnyyFixture();
    const { driverTransport } = await attachMockEcu({
      flash,
      rmbaFlavor: "axiom",
    });
    const driver = new ElmDriver(driverTransport);
    await driver.attach();
    await driver.init();
    const result = await scanBroadcast(driver);
    expect(result.matched?.code).toBe("DNYY");
    expect(getRmbaFlavor(driver)).toBe("axiom");
  });

  it("Mode 0x23 rejection (NRC 0x11) surfaces cleanly from readMemory", async () => {
    const flash = createDnyyFixture();
    const { driverTransport } = await attachMockEcu({
      flash,
      rejectMode23: true,
    });
    const driver = new ElmDriver(driverTransport);
    await driver.attach();
    await driver.init();
    await expect(readMemory(driver, 0x01827c, 4)).rejects.toMatchObject({
      name: "KwpNegativeError",
      nrc: expect.objectContaining({ code: 0x11 }),
    });
  });
});
