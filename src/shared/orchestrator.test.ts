import { describe, expect, it } from "vitest";
import { Orchestrator } from "./orchestrator";
import { attachMockEcu } from "./mock-ecu/pcm32u-mock";
import { createDnyyFixture } from "./pcm32u/fixture";
import type { RunEvent } from "./ipc/events";

async function runOnce(opts: {
  fixture?: Parameters<typeof createDnyyFixture>[0];
  rejectMode23?: boolean;
  rejectAtsp?: boolean;
  requireUnlockForRmba?: boolean;
} = {}): Promise<RunEvent[]> {
  const flash = createDnyyFixture(opts.fixture);
  const { driverTransport } = await attachMockEcu({
    flash,
    requireUnlockForRmba: opts.requireUnlockForRmba ?? true,
    rejectMode23: opts.rejectMode23,
    rejectAtsp: opts.rejectAtsp,
  });
  const events: RunEvent[] = [];
  const orch = new Orchestrator(
    {
      transport: driverTransport,
      adapterLabel: "mock://pcm32u",
      adapterBaudRate: 115200,
      platform: {
        os: "test",
        osVersion: "1.0",
        arch: "x64",
        toolVersion: "0.0.1",
      },
      emit: (ev) => events.push(ev),
    },
    {
      portPath: "mock://pcm32u",
      baudRate: 115200,
      scanBroadcast: true,
      scanDtc: true,
    },
  );
  await orch.run();
  return events;
}

describe("Orchestrator", () => {
  it("happy path: emits phases in order and ends with type=done success=true", async () => {
    const events = await runOnce();
    const phaseEvents = events.filter((e) => e.type === "phase");
    const order = phaseEvents.map((e) => (e.type === "phase" ? e.phase : ""));
    expect(order.slice(0, 4)).toEqual([
      "connect",
      "connect",
      "init",
      "init",
    ]);
    const done = events.find((e) => e.type === "done");
    expect(done).toBeDefined();
    if (done && done.type === "done") {
      expect(done.success).toBe(true);
      expect(done.reportMarkdown).toContain("# PCM32U Diagnostic Report");
      expect(done.reportMarkdown).toContain("DNYY");
      expect(done.suggestedFilename).toMatch(/\d{4}-\d{2}-\d{2}-DNYY\.md/);
    }
  }, 30000);

  it("emits narrate events that walk the user through each step", async () => {
    const events = await runOnce();
    const narrateMessages = events
      .filter((e) => e.type === "narrate")
      .map((e) => (e.type === "narrate" ? e.message : ""));
    // Core narration beats we promise to show the user:
    expect(narrateMessages.some((m) => m.includes("ATZ"))).toBe(true);
    expect(narrateMessages.some((m) => m.includes("Mode 0x20"))).toBe(true);
    expect(narrateMessages.some((m) => m.includes("Seed:"))).toBe(true);
    expect(narrateMessages.some((m) => m.includes("Key:"))).toBe(true);
    expect(narrateMessages.some((m) => m.includes("Matched: DNYY"))).toBe(true);
  }, 30000);

  it("emits wire events with both TX and RX directions", async () => {
    const events = await runOnce();
    const wire = events.filter((e) => e.type === "wire");
    expect(wire.length).toBeGreaterThan(0);
    const directions = new Set(
      wire.map((e) => (e.type === "wire" ? e.direction : "")),
    );
    expect(directions.has("tx")).toBe(true);
    expect(directions.has("rx")).toBe(true);
  }, 30000);

  it("emits DTC progress events with monotonic done counts", async () => {
    const events = await runOnce();
    const progress = events.filter(
      (e) => e.type === "progress" && e.phase === "dtc",
    );
    expect(progress.length).toBeGreaterThan(1);
    let last = -1;
    for (const p of progress) {
      if (p.type === "progress") {
        expect(p.done).toBeGreaterThanOrEqual(last);
        expect(p.total).toBeGreaterThan(0);
        last = p.done;
      }
    }
  }, 30000);

  it("surfaces unknown DTC candidates via a warn phase status", async () => {
    const events = await runOnce({
      fixture: { extraUnknownDtcAddr: 0x00fcb0 },
    });
    const dtcPhases = events
      .filter((e) => e.type === "phase" && e.phase === "dtc")
      .map((e) => e.type === "phase" ? e.status : "");
    // At least one should be "warn" (unknown candidates detected)
    expect(dtcPhases).toContain("warn");
  }, 30000);

  it("init failure still produces a done event with success=false and a report", async () => {
    const events = await runOnce({ rejectAtsp: true });
    const done = events.find((e) => e.type === "done");
    expect(done).toBeDefined();
    if (done && done.type === "done") {
      expect(done.success).toBe(false);
      expect(done.reportMarkdown).toContain("VPW");
    }
    // The error should have why and fix populated from TransportError
    const errors = events.filter((e) => e.type === "error");
    expect(errors.length).toBeGreaterThan(0);
    const first = errors[0];
    if (first && first.type === "error") {
      expect(first.why?.length ?? 0).toBeGreaterThan(20);
      expect(first.fix?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("Mode 0x23 rejection does not abort the run — broadcast/dtc fail but report still builds", async () => {
    const events = await runOnce({
      rejectMode23: true,
      requireUnlockForRmba: false,
    });
    const done = events.find((e) => e.type === "done");
    // Run completes (unlock still worked), broadcast/dtc phases errored
    expect(done).toBeDefined();
    const bcastPhases = events
      .filter((e) => e.type === "phase" && e.phase === "broadcast")
      .map((e) => (e.type === "phase" ? e.status : ""));
    expect(bcastPhases).toContain("error");
    // Report still generated
    if (done && done.type === "done") {
      expect(done.reportMarkdown).toContain("# PCM32U Diagnostic Report");
    }
  }, 30000);
});
