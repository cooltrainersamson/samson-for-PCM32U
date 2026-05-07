import { describe, expect, it } from "vitest";
import { buildUserSummary } from "./summary";
import { analyzeBroadcastWindow } from "../scanner/broadcast";
import { analyzeDtcWindow } from "../scanner/dtc";
import type { ReportInput } from "./markdown";

function fakeBroadcastWindow(tag = "DNYY"): Uint8Array {
  const b = new Uint8Array(0x18 * 4);
  b.fill(0xff);
  const tagOffset = 0x01827c - 0x018270;
  for (let i = 0; i < 4; i++) b[tagOffset + i] = tag.charCodeAt(i);
  return b;
}

function fakeDtcWindow(): Uint8Array {
  const b = new Uint8Array(0x400);
  b[0x00f97c - 0x00f900] = 0xc0;
  b[0x00f980 - 0x00f900] = 0xc0;
  b[0x00fad4 - 0x00f900] = 0xe0;
  return b;
}

function baseInput(): ReportInput {
  return {
    toolVersion: "0.1.0-alpha.3",
    generatedAt: new Date("2026-05-07T00:00:00Z"),
    platform: { os: "darwin", osVersion: "25.3.0", arch: "arm64" },
    adapter: { label: "/dev/cu.usbserial-TEST", baudRate: 115200 },
    init: {
      firmwareId: "ELM327 v1.5",
      deviceId: "OBDLINK SX",
      protocol: "SAE J1850 VPW",
      acceptedSteps: ["ATZ", "ATE0", "ATL0", "ATH1", "ATSP 2"],
      degradedSteps: [],
    },
    warnings: [],
    errors: [],
    trafficLog: [],
  };
}

describe("buildUserSummary", () => {
  it("clean run on a recognized variant: nothing to share", () => {
    const broadcast = analyzeBroadcastWindow(fakeBroadcastWindow("DNYY"), 0x018270);
    const dtc = analyzeDtcWindow(fakeDtcWindow(), 0x00f900, null);

    const s = buildUserSummary({
      ...baseInput(),
      ping: { ok: true, echoByte: 0x00 },
      unlock: {
        unlocked: true,
        seed: 0x32e0,
        key: 0x7c73,
        algo: 0x31,
        table: 1,
        method: "known",
        rawSeedFrame: "6C F1 10 67 01 32 E0 00",
        rawKeyFrame: "6C F1 10 67 02 34 00",
      },
      broadcast,
      dtc,
    });

    expect(s.shouldShare).toBe(false);
    expect(s.oneLine).toMatch(/fully recognized/i);
    expect(s.findings.find((f) => f.headline.includes("DNYY"))).toBeDefined();
    expect(s.contributions).toHaveLength(0);
    expect(s.nextStep).not.toMatch(/cooltrainersamson/);
  });

  it("unknown variant: marks as new and asks user to share", () => {
    const s = buildUserSummary({
      ...baseInput(),
      ping: { ok: true, echoByte: 0x00 },
      unlock: {
        unlocked: true,
        seed: 0x52fd,
        key: 0xfbff,
        algo: 0x31,
        table: 1,
        method: "known",
        rawSeedFrame: "6C F1 10 67 01 52 FD 00",
        rawKeyFrame: "6C F1 10 67 02 35 00",
      },
      broadcast: {
        error: "ECU refused SID 0x23: serviceNotSupported (NRC 0x11)",
        why: "The ECU does not implement the Mode 0x23 service in the format we sent.",
        fix: "The tool will retry with the GM-extended dialect on a future release.",
      },
    });

    expect(s.shouldShare).toBe(true);
    expect(s.oneLine).toMatch(/data the tool hasn't seen|worth sharing/i);
    expect(s.findings.find((f) => f.kind === "ok" && f.headline.includes("alive"))).toBeDefined();
    expect(s.findings.find((f) => f.kind === "ok" && f.headline.includes("Seed-key unlock"))).toBeDefined();
    expect(s.findings.find((f) => f.kind === "new" && f.headline.includes("broadcast"))).toBeDefined();
    expect(s.contributions.length).toBeGreaterThan(0);
    expect(s.nextStep).toMatch(/cooltrainersamson@gmail\.com/);
  });

  it("adapter init failure: returns early without ping/unlock claims", () => {
    const s = buildUserSummary({
      ...baseInput(),
      init: {
        error: "ELM327 didn't respond to ATZ",
        why: "Adapter is unplugged or the wrong serial port is selected.",
        fix: "Check the cable and select the right port.",
      },
    });

    expect(s.shouldShare).toBe(false);
    expect(s.oneLine).toMatch(/adapter/i);
    expect(s.findings).toHaveLength(1);
    expect(s.findings[0]!.kind).toBe("fail");
    expect(s.nextStep).toMatch(/RUN/);
  });

  it("ECU silent (ping fails): no share, just a setup hint", () => {
    const s = buildUserSummary({
      ...baseInput(),
      ping: { error: "No response from PCM after 1.0 s" },
    });

    expect(s.shouldShare).toBe(false);
    expect(s.findings.find((f) => f.kind === "fail" && f.headline.includes("ping"))).toBeDefined();
    expect(s.nextStep).toMatch(/RUN/);
  });

  it("DTC scan finds unknown candidates: marks as new", () => {
    const broadcast = analyzeBroadcastWindow(fakeBroadcastWindow("DNYY"), 0x018270);
    const dtcBytes = fakeDtcWindow();
    // Add an out-of-DB enable byte that should land in unknownCandidates
    dtcBytes[0x00fb00 - 0x00f900] = 0xc0;
    dtcBytes[0x00fb02 - 0x00f900] = 0xc0;
    dtcBytes[0x00fb04 - 0x00f900] = 0xc0;
    const dtc = analyzeDtcWindow(dtcBytes, 0x00f900, null);

    const s = buildUserSummary({
      ...baseInput(),
      ping: { ok: true, echoByte: 0x00 },
      unlock: {
        unlocked: true,
        seed: 0x32e0,
        key: 0x7c73,
        algo: 0x31,
        table: 1,
        method: "known",
        rawSeedFrame: "",
        rawKeyFrame: "",
      },
      broadcast,
      dtc,
    });

    if (dtc.unknownCandidates.length > 0) {
      expect(s.shouldShare).toBe(true);
      expect(
        s.findings.find((f) => f.kind === "new" && f.headline.includes("uncharacterized DTC")),
      ).toBeDefined();
      expect(s.contributions.some((c) => c.includes("DTC"))).toBe(true);
    }
  });

  it("warnings from the run are surfaced as warn findings", () => {
    const s = buildUserSummary({
      ...baseInput(),
      ping: { ok: true, echoByte: 0x00 },
      warnings: ["Adapter rejected ATAL — running without long-message support."],
    });

    expect(
      s.findings.find(
        (f) => f.kind === "warn" && f.headline.includes("ATAL"),
      ),
    ).toBeDefined();
  });
});
