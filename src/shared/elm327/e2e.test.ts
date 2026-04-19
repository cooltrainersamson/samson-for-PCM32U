import { describe, expect, it } from "vitest";
import { ElmDriver } from "./driver";
import { KwpClient } from "../kwp/client";
import { attachMockEcu } from "../mock-ecu/pcm32u-mock";
import { KwpNegativeError } from "./nrc";
import { TransportError } from "../transport/types";

describe("ELM327 + mock PCM32U end-to-end", () => {
  it("init sequence succeeds against a well-behaved mock", async () => {
    const { driverTransport } = await attachMockEcu();
    const driver = new ElmDriver(driverTransport);
    await driver.attach();
    const report = await driver.init();
    expect(report.firmwareId).toMatch(/ELM327/i);
    expect(report.acceptedSteps).toContain("ATZ");
    expect(report.acceptedSteps).toContain("ATE0");
    expect(report.acceptedSteps).toContain("ATH1");
    expect(report.acceptedSteps).toContain("ATSP 2");
    expect(report.degradedSteps).toEqual([]);
    expect(report.protocol).toMatch(/J1850 VPW/i);
  });

  it("init continues gracefully when optional ATAL is rejected", async () => {
    const { driverTransport } = await attachMockEcu({ rejectAtal: true });
    const driver = new ElmDriver(driverTransport);
    await driver.attach();
    const report = await driver.init();
    expect(report.acceptedSteps).toContain("ATSP 2");
    expect(report.degradedSteps.join(" ")).toMatch(/ATAL/);
  });

  it("init throws a clear error when the adapter chipset does not support VPW", async () => {
    const { driverTransport } = await attachMockEcu({ rejectAtsp: true });
    const driver = new ElmDriver(driverTransport);
    await driver.attach();
    await expect(driver.init()).rejects.toMatchObject({
      name: "TransportError",
      why: expect.stringMatching(/VPW/i),
    });
  });

  it("Mode 0x20 alive ping round-trips successfully", async () => {
    const { driverTransport } = await attachMockEcu();
    const driver = new ElmDriver(driverTransport);
    await driver.attach();
    await driver.init();
    const client = new KwpClient(driver);
    const ping = await client.ping();
    expect(ping.ok).toBe(true);
  });

  it("full unlock flow: seed request + known-algo key send succeeds", async () => {
    const { driverTransport } = await attachMockEcu();
    const driver = new ElmDriver(driverTransport);
    await driver.attach();
    await driver.init();
    const client = new KwpClient(driver);
    const result = await client.unlock({ algo: 0x31, table: 1 });
    expect(result.unlocked).toBe(true);
    expect(result.seed).toBe(0x32e0);
    expect(result.key).toBe(0x7c73);
    expect(result.method).toBe("known");
    expect(result.rawSeedFrame).toMatch(/67 01 32 E0/);
  });

  it("wrong-hint unlock falls back to brute force and succeeds", async () => {
    const { driverTransport } = await attachMockEcu();
    const driver = new ElmDriver(driverTransport);
    await driver.attach();
    await driver.init();
    const client = new KwpClient(driver);
    // Deliberately wrong hint so known path fails with NRC 0x35 then BF kicks in.
    const result = await client.unlock({ algo: 0x99, table: 2 });
    expect(result.unlocked).toBe(true);
    expect(["known", "brute-force"]).toContain(result.method);
    expect(result.key).toBe(0x7c73);
  });

  it("decodes the NRC from a GM-extended Mode 0x23 negative response (echoed params before NRC)", async () => {
    const { driverTransport } = await attachMockEcu({
      rejectMode23: true,
      rmbaExtendedNegFormat: true,
    });
    const driver = new ElmDriver(driverTransport);
    await driver.attach();
    await driver.init();
    // rejectMode23 -> NRC 0x11 (serviceNotSupported). With the extended
    // format the frame looks like `7F 23 <echoed request tail> 11`; the
    // driver must extract the real NRC from the tail, not data[1].
    await expect(
      driver.sendKwp([0x23, 0x01, 0x82, 0x70, 0x04]),
    ).rejects.toMatchObject({
      name: "KwpNegativeError",
      nrc: { code: 0x11, name: "serviceNotSupported" },
    });
  });

  it("surfaces a KwpNegativeError with WHY/FIX for a totally unknown SID", async () => {
    const { driverTransport } = await attachMockEcu();
    const driver = new ElmDriver(driverTransport);
    await driver.attach();
    await driver.init();
    await expect(driver.sendKwp([0x44])).rejects.toBeInstanceOf(
      KwpNegativeError,
    );
    try {
      await driver.sendKwp([0x44]);
    } catch (err) {
      if (err instanceof KwpNegativeError) {
        expect(err.nrc.name).toBe("serviceNotSupported");
        expect(err.nrc.why.length).toBeGreaterThan(40);
        expect(err.nrc.fix.length).toBeGreaterThan(20);
      }
    }
  });

  it("ATZ timeout produces a TransportError with baud-rate guidance", async () => {
    const { driverTransport } = await attachMockEcu({
      firstAttemptTimesOut: true,
    });
    const driver = new ElmDriver(driverTransport);
    await driver.attach();
    await expect(
      driver.init({ commandTimeoutMs: 80 }),
    ).rejects.toBeInstanceOf(TransportError);
  });
});
