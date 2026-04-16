import { describe, expect, it } from "vitest";
import { ElmDriver } from "./driver";
import { attachMockEcu } from "../mock-ecu/pcm32u-mock";
import {
  DESTRUCTIVE_SIDS,
  DestructiveSidBlockedError,
  assertSidSafe,
} from "./safety";

describe("destructive-SID safety guard", () => {
  it("blocklist enumerates every known destructive SID with a risk note", () => {
    const expected = [0x2e, 0x31, 0x34, 0x36, 0x37, 0x3b, 0x3d];
    for (const sid of expected) {
      expect(DESTRUCTIVE_SIDS[sid]).toBeDefined();
      expect(DESTRUCTIVE_SIDS[sid]!.risk.length).toBeGreaterThan(20);
    }
  });

  it("assertSidSafe allows all read-only SIDs the tool actually uses", () => {
    expect(() => assertSidSafe([0x20])).not.toThrow();
    expect(() => assertSidSafe([0x27, 0x01])).not.toThrow();
    expect(() => assertSidSafe([0x27, 0x02, 0x00, 0x00])).not.toThrow();
    expect(() => assertSidSafe([0x23, 0x01, 0x82, 0x7c, 0x04])).not.toThrow();
    expect(() => assertSidSafe([0x1a, 0x90])).not.toThrow();
  });

  it("assertSidSafe throws DestructiveSidBlockedError for every blocked SID", () => {
    for (const sid of [0x2e, 0x31, 0x34, 0x36, 0x37, 0x3b, 0x3d]) {
      expect(() => assertSidSafe([sid, 0x00])).toThrow(
        DestructiveSidBlockedError,
      );
    }
  });

  it("sendKwp() refuses to transmit Mode 0x34 RequestDownload even if called directly", async () => {
    const { driverTransport } = await attachMockEcu();
    const driver = new ElmDriver(driverTransport);
    await driver.attach();
    // Do NOT run init — the guard must fire before any wire traffic.
    await expect(driver.sendKwp([0x34, 0x00, 0x00, 0x00])).rejects.toBeInstanceOf(
      DestructiveSidBlockedError,
    );
  });

  it("sendKwp() refuses Mode 0x36 TransferData (the kernel-upload SID)", async () => {
    const { driverTransport } = await attachMockEcu();
    const driver = new ElmDriver(driverTransport);
    await driver.attach();
    await expect(
      driver.sendKwp([0x36, 0x80, 0xff, 0xff, 0xff, 0xff]),
    ).rejects.toBeInstanceOf(DestructiveSidBlockedError);
  });

  it("the error message explicitly flags this as a bug and recommends stopping the run", () => {
    try {
      assertSidSafe([0x36, 0x80]);
      throw new Error("should have thrown");
    } catch (err) {
      if (err instanceof DestructiveSidBlockedError) {
        expect(err.message).toMatch(/SAFETY BLOCK/);
        expect(err.message).toMatch(/read-only/);
        expect(err.message).toMatch(/bug/i);
        expect(err.info.name).toBe("TransferData");
      } else {
        throw err;
      }
    }
  });
});
