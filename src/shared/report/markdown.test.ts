import { describe, expect, it } from "vitest";
import { buildReport, reportFilename } from "./markdown";
import { analyzeBroadcastWindow } from "../scanner/broadcast";
import { analyzeDtcWindow } from "../scanner/dtc";

function fakeBroadcastWindow(): Uint8Array {
  const b = new Uint8Array(0x18 * 4);
  b.fill(0xff);
  const s = "DNYY";
  const tagOffset = 0x01827c - 0x018270;
  for (let i = 0; i < 4; i++) b[tagOffset + i] = s.charCodeAt(i);
  return b;
}

describe("report generator", () => {
  it("produces a Markdown report covering every section", () => {
    const bcastBytes = fakeBroadcastWindow();
    const broadcast = analyzeBroadcastWindow(bcastBytes, 0x018270);

    const dtcBytes = new Uint8Array(0x400);
    dtcBytes[0x00f97c - 0x00f900] = 0xc0;
    dtcBytes[0x00f980 - 0x00f900] = 0xc0;
    dtcBytes[0x00fad4 - 0x00f900] = 0xe0;
    const dtc = analyzeDtcWindow(dtcBytes, 0x00f900, null);

    const md = buildReport({
      toolVersion: "0.0.1",
      generatedAt: new Date("2026-04-15T12:34:56Z"),
      platform: { os: "darwin", osVersion: "25.3.0", arch: "arm64" },
      adapter: { label: "/dev/cu.usbserial-TEST", baudRate: 115200 },
      init: {
        firmwareId: "ELM327 v1.5",
        deviceId: "OBDLINK SX",
        protocol: "SAE J1850 VPW",
        acceptedSteps: ["ATZ", "ATE0", "ATL0", "ATH1", "ATSP 2"],
        degradedSteps: [],
      },
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
      warnings: ["This is a test run against a mock ECU."],
      errors: [],
      trafficLog: [
        { ts: Date.now(), direction: "tx", payload: "ATZ" },
        { ts: Date.now(), direction: "rx", payload: "ELM327 v1.5" },
      ],
    });

    expect(md).toContain("# PCM32U Diagnostic Report");
    expect(md).toContain("Matched broadcast:");
    expect(md).toContain("DNYY");
    expect(md).toContain("Rodeo Sport");
    expect(md).toContain("## 5. DTC table scan");
    expect(md).toContain("P0724");
    expect(md).toContain("cooltrainersamson@gmail.com");
    // Seed-key facts
    expect(md).toContain("0x32E0");
    expect(md).toContain("0x7C73");
  });

  it("reportFilename uses date + broadcast convention", () => {
    expect(reportFilename(new Date("2026-04-15T12:00:00Z"), "DNYY")).toBe(
      "2026-04-15-DNYY.md",
    );
    expect(reportFilename(new Date("2026-04-15T12:00:00Z"), null)).toBe(
      "2026-04-15-UNKNOWN.md",
    );
  });

  it("renders the failure path with why/fix lines when a stage errored", () => {
    const md = buildReport({
      toolVersion: "0.0.1",
      generatedAt: new Date(),
      platform: { os: "linux" },
      adapter: { label: "/dev/ttyUSB0" },
      init: {
        error: "ELM327 adapter did not respond to ATZ",
        why: "Adapter silent — baud mismatch or dead device.",
        fix: "Try a different baud rate or replace the USB cable.",
      },
      warnings: [],
      errors: ["init failed"],
      trafficLog: [],
    });
    expect(md).toContain("❌ FAILED");
    expect(md).toContain("Why:");
    expect(md).toContain("Fix:");
    expect(md).toContain("_not run_");
  });
});
