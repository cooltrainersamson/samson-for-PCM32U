import { describe, expect, it } from "vitest";
import { ElmDriver } from "../elm327/driver";
import { KwpClient } from "../kwp/client";
import { attachMockEcu } from "../mock-ecu/pcm32u-mock";
import { createDnyyFixture } from "../pcm32u/fixture";
import { scanBroadcast, analyzeBroadcastWindow } from "./broadcast";
import { scanDtcTables } from "./dtc";
import { readMemory } from "../kwp/rmba";

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

  it("scanDtcTables reports all known DTCs at their default bytes and finds zero unknowns on a clean DNYY", async () => {
    const { driver } = await makeUnlockedDriver();
    const result = await scanDtcTables(driver);
    // All 18 known DTCs should be present with their defaults
    expect(result.known).toHaveLength(18);
    for (const k of result.known) {
      expect(k.enabled).toBe(true);
      expect(k.matchesDefault).toBe(true);
    }
    // Fixture has no injected unknowns — expect empty list
    expect(result.unknownCandidates).toEqual([]);
  }, 30000);

  it("scanDtcTables detects an injected unknown DTC candidate", async () => {
    const { driver } = await makeUnlockedDriver({
      extraUnknownDtcAddr: 0x00fcb0,
    });
    const result = await scanDtcTables(driver);
    expect(result.unknownCandidates.length).toBeGreaterThan(0);
    expect(result.unknownCandidates.some((u) => u.addr === 0x00fcb0)).toBe(true);
  }, 30000);

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
