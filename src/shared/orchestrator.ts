// Orchestrator: runs the full diagnostic flow and emits a stream of
// RunEvents so the UI can render live, step-by-step narration.
//
// This file is deliberately transport-agnostic — it takes a Transport
// and a RunOptions, wires up the driver and client, and runs the flow.
// That lets the unit test run it against MockTransport while the real
// app wires it to SerialTransport in the main process.

import { ElmDriver } from "./elm327/driver";
import type { Transport } from "./transport/types";
import { TransportError } from "./transport/types";
import { KwpClient } from "./kwp/client";
import { KwpNegativeError } from "./elm327/nrc";
import { scanBroadcast } from "./scanner/broadcast";
import { scanDtcTables } from "./scanner/dtc";
import { readMemory } from "./kwp/rmba";
import { buildReport, reportFilename } from "./report/markdown";
import type {
  RunEvent,
  RunOptions,
  PhaseId,
  PlatformInfo,
} from "./ipc/events";
import { PHASE_LABELS } from "./ipc/events";
import type {
  BroadcastScanResult,
} from "./scanner/broadcast";
import type { DtcScanResult } from "./scanner/dtc";
import type { UnlockResult } from "./kwp/client";
import { algoForBroadcast, FAMILY_FALLBACK_ALGOS } from "./pcm32u/algo";

export interface OrchestratorDeps {
  readonly transport: Transport;
  readonly adapterLabel: string;
  readonly adapterBaudRate?: number;
  readonly platform: PlatformInfo;
  readonly emit: (event: RunEvent) => void;
}

export class Orchestrator {
  private cancelled = false;

  constructor(
    private readonly deps: OrchestratorDeps,
    private readonly options: RunOptions,
  ) {}

  cancel(): void {
    this.cancelled = true;
  }

  private now(): number {
    return Date.now();
  }

  private emit(ev: RunEvent): void {
    this.deps.emit(ev);
  }

  private phase(
    phase: PhaseId,
    status: "running" | "ok" | "warn" | "error" | "skipped",
    message: string,
    detail?: string,
  ): void {
    this.emit({ type: "phase", phase, status, message, detail, ts: this.now() });
  }

  private narrate(phase: PhaseId, message: string): void {
    this.emit({ type: "narrate", phase, message, ts: this.now() });
  }

  private warn(phase: PhaseId | null, message: string): void {
    this.emit({ type: "warning", phase, message, ts: this.now() });
  }

  private fail(
    phase: PhaseId | null,
    message: string,
    why?: string,
    fix?: string,
  ): void {
    this.emit({
      type: "error",
      phase,
      message,
      why,
      fix,
      ts: this.now(),
    });
  }

  private result(phase: PhaseId, key: string, value: unknown): void {
    this.emit({ type: "result", phase, key, value, ts: this.now() });
  }

  private throwIfCancelled(): void {
    if (this.cancelled) {
      throw new Error("Run cancelled by user");
    }
  }

  async run(): Promise<void> {
    const warnings: string[] = [];
    const errors: string[] = [];
    let initReport: Awaited<ReturnType<ElmDriver["init"]>> | { error: string; why?: string; fix?: string } | undefined;
    let pingResult: { ok: boolean; echoByte: number } | { error: string } | undefined;
    let unlockResult: UnlockResult | { error: string; why?: string; fix?: string } | undefined;
    let broadcastResult: BroadcastScanResult | { error: string; why?: string; fix?: string } | undefined;
    let dtcResult: DtcScanResult | { error: string; why?: string; fix?: string } | undefined;
    let fullDumpPath: string | undefined;
    let matchedBroadcastCode: string | null = null;

    const driver = new ElmDriver(this.deps.transport);
    try {
      // ── PHASE: connect ─────────────────────────────────────────────
      this.phase("connect", "running", PHASE_LABELS.connect);
      this.narrate(
        "connect",
        `Opening ${this.deps.adapterLabel}${this.deps.adapterBaudRate ? " at " + this.deps.adapterBaudRate + " baud" : ""}…`,
      );
      await driver.attach();
      this.phase("connect", "ok", `Connected to ${this.deps.adapterLabel}`);

      // Hook trace so every TX/RX shows up in the UI wire log.
      const wireUnsub = this.attachWireLogger(driver);

      try {
        // ── PHASE: init ────────────────────────────────────────────
        this.throwIfCancelled();
        this.phase("init", "running", PHASE_LABELS.init);
        this.narrate("init", "Sending ATZ (reset)…");
        try {
          const report = await driver.init({
            targetHeader: this.options.targetHeader,
          });
          initReport = report;
          this.narrate(
            "init",
            `Adapter identified: ${report.firmwareId ?? "(unknown banner)"}`,
          );
          if (report.deviceId) {
            this.narrate("init", `Device ID: ${report.deviceId}`);
          }
          this.narrate(
            "init",
            `Accepted init steps: ${report.acceptedSteps.join(", ")}`,
          );
          if (report.degradedSteps.length > 0) {
            for (const s of report.degradedSteps) {
              this.warn("init", `Optional init step degraded: ${s}`);
              warnings.push(s);
            }
            this.phase(
              "init",
              "warn",
              `Init complete with ${report.degradedSteps.length} degraded step(s)`,
            );
          } else {
            this.phase(
              "init",
              "ok",
              `Init complete. Protocol: ${report.protocol ?? "J1850 VPW"}`,
            );
          }
        } catch (err) {
          initReport = this.errAsStage(err);
          throw err;
        }

        // ── PHASE: ping ────────────────────────────────────────────
        this.throwIfCancelled();
        const client = new KwpClient(driver);
        this.phase("ping", "running", PHASE_LABELS.ping);
        this.narrate("ping", "Sending Mode 0x20 (ReturnToNormal / alive ping)…");
        try {
          const ping = await client.ping();
          pingResult = ping;
          this.phase(
            "ping",
            "ok",
            `ECU responded (echo byte 0x${ping.echoByte.toString(16).toUpperCase().padStart(2, "0")})`,
          );
        } catch (err) {
          pingResult = this.errAsStage(err);
          throw err;
        }

        // ── PHASE: broadcast (probe before unlock) ─────────────────
        // The correct flow: read the broadcast code FIRST so we can
        // look up the correct seed-key algo, rather than guessing.
        // Some ECUs allow Mode 0x23 without security; others gate it.
        // We probe, and if we get NRC 0x33, unlock first then retry.
        let broadcastBeforeUnlock = false;
        if (this.options.scanBroadcast !== false) {
          this.throwIfCancelled();
          this.phase("broadcast", "running", "Probing broadcast (before unlock)…");
          this.narrate(
            "broadcast",
            "Attempting Mode 0x23 read of the broadcast window WITHOUT unlock — some ECUs allow this.",
          );
          try {
            const b = await scanBroadcast(driver);
            broadcastResult = b;
            broadcastBeforeUnlock = true;
            if (b.matched) {
              matchedBroadcastCode = b.matched.code;
              this.narrate(
                "broadcast",
                `Matched: ${b.matched.code} — ${b.matched.vehicle} (${b.matched.year} ${b.matched.market}, ${b.matched.trans}, ${b.matched.engine})`,
              );
              this.phase(
                "broadcast",
                "ok",
                `Broadcast identified: ${b.matched.code}`,
              );
            } else {
              this.narrate(
                "broadcast",
                `No known broadcast in window. ${b.candidates.length} unknown 4-letter candidate(s) surfaced.`,
              );
              this.phase(
                "broadcast",
                "warn",
                `Unknown broadcast (${b.candidates.length} candidate(s) for review)`,
              );
              warnings.push(
                "Broadcast code was not in KNOWN_BROADCASTS — please send this report so the project owner can extend his table.",
              );
            }
            this.result("broadcast", "broadcast", b);
          } catch (err) {
            const isSecurityDenied =
              err instanceof KwpNegativeError && err.nrc.code === 0x33;
            if (isSecurityDenied) {
              this.narrate(
                "broadcast",
                "ECU requires security unlock before Mode 0x23 reads. Will read broadcast after unlocking.",
              );
              this.phase(
                "broadcast",
                "running",
                "Deferred — ECU requires unlock first",
              );
            } else {
              broadcastResult = this.errAsStage(err);
              this.warn(
                "broadcast",
                `Broadcast probe failed: ${(err as Error).message}`,
              );
              this.phase("broadcast", "error", "Broadcast probe failed");
            }
          }
        } else {
          this.phase("broadcast", "skipped", "Skipped by user");
        }

        // ── PHASE: unlock ──────────────────────────────────────────
        // Select algo: if we read the broadcast, look it up. Otherwise
        // try the known PCM32U family fallbacks.
        this.throwIfCancelled();
        this.phase("unlock", "running", PHASE_LABELS.unlock);
        const algoFromBroadcast =
          matchedBroadcastCode
            ? algoForBroadcast(matchedBroadcastCode)
            : null;
        const algoHint = algoFromBroadcast
          ? { algo: algoFromBroadcast.algo, table: algoFromBroadcast.table }
          : FAMILY_FALLBACK_ALGOS[0]
            ? { algo: FAMILY_FALLBACK_ALGOS[0].algo, table: FAMILY_FALLBACK_ALGOS[0].table }
            : { algo: 0x31, table: 1 as const };
        if (algoFromBroadcast) {
          this.narrate(
            "unlock",
            `Broadcast ${matchedBroadcastCode} maps to algo 0x${algoFromBroadcast.algo.toString(16).toUpperCase().padStart(2, "0")} table ${algoFromBroadcast.table} (${algoFromBroadcast.note})`,
          );
        } else {
          this.narrate(
            "unlock",
            `Broadcast unknown or not yet read — trying PCM32U family default: algo 0x${algoHint.algo.toString(16).toUpperCase().padStart(2, "0")} table ${algoHint.table}`,
          );
        }
        this.narrate("unlock", "Requesting seed (Mode 0x27 01)…");
        try {
          const unlock = await client.unlock(algoHint);
          unlockResult = unlock;
          this.narrate(
            "unlock",
            `Seed: 0x${unlock.seed.toString(16).toUpperCase().padStart(4, "0")}. Computed key with algo 0x${unlock.algo.toString(16).toUpperCase().padStart(2, "0")} (table ${unlock.table}).`,
          );
          this.narrate(
            "unlock",
            `Key: 0x${unlock.key.toString(16).toUpperCase().padStart(4, "0")}. Mode 0x27 02 accepted.`,
          );
          this.phase(
            "unlock",
            "ok",
            `Unlocked via ${algoFromBroadcast ? "broadcast-derived algo" : unlock.method === "known" ? "hinted algo" : "PCM32U family fallback"}`,
          );
          this.result("unlock", "unlock", unlock);
        } catch (err) {
          unlockResult = this.errAsStage(err);
          throw err;
        }

        // ── PHASE: broadcast (retry after unlock if deferred) ─────
        if (
          this.options.scanBroadcast !== false &&
          !broadcastBeforeUnlock &&
          !broadcastResult
        ) {
          this.throwIfCancelled();
          this.phase("broadcast", "running", "Reading broadcast (post-unlock)…");
          this.narrate(
            "broadcast",
            "Now unlocked — reading 112-byte config window via Mode 0x23 RMBA…",
          );
          try {
            const b = await scanBroadcast(driver);
            broadcastResult = b;
            if (b.matched) {
              matchedBroadcastCode = b.matched.code;
              this.narrate(
                "broadcast",
                `Matched: ${b.matched.code} — ${b.matched.vehicle} (${b.matched.year} ${b.matched.market}, ${b.matched.trans}, ${b.matched.engine})`,
              );
              this.phase(
                "broadcast",
                "ok",
                `Broadcast identified: ${b.matched.code}`,
              );
            } else {
              this.narrate(
                "broadcast",
                `No known broadcast in window. ${b.candidates.length} unknown 4-letter candidate(s) surfaced.`,
              );
              this.phase(
                "broadcast",
                "warn",
                `Unknown broadcast (${b.candidates.length} candidate(s) for review)`,
              );
              warnings.push(
                "Broadcast code was not in KNOWN_BROADCASTS — please send this report so the project owner can extend his table.",
              );
            }
            this.result("broadcast", "broadcast", b);
          } catch (err) {
            broadcastResult = this.errAsStage(err);
            this.warn(
              "broadcast",
              `Broadcast scan failed: ${(err as Error).message}`,
            );
            this.phase(
              "broadcast",
              "error",
              "Broadcast scan failed — continuing",
            );
          }
        }

        // ── PHASE: dtc ────────────────────────────────────────────
        if (this.options.scanDtc !== false) {
          this.throwIfCancelled();
          this.phase("dtc", "running", PHASE_LABELS.dtc);
          this.narrate(
            "dtc",
            "Reading DTC enable region (0x00F900..0x00FD00, 1024 bytes, ~256 chunked reads)…",
          );
          try {
            const d = await scanDtcTables(driver, {
              includeDescriptorTable: this.options.includeDescriptorTable,
              onProgress: (done, total) => {
                this.emit({
                  type: "progress",
                  phase: "dtc",
                  done,
                  total,
                  label: `DTC window ${done}/${total} bytes`,
                  ts: this.now(),
                });
              },
            });
            dtcResult = d;
            const knownCount = d.known.length;
            const unknownCount = d.unknownCandidates.length;
            this.narrate(
              "dtc",
              `Found ${knownCount} known DTC byte(s) and ${unknownCount} unknown bit-7 cluster candidate(s).`,
            );
            if (d.descriptorTable) {
              this.narrate(
                "dtc",
                "Descriptor table at 0x67358 (256 bytes) captured for cross-reference.",
              );
            }
            this.phase(
              "dtc",
              unknownCount > 0 ? "warn" : "ok",
              `DTC scan complete: ${knownCount} known, ${unknownCount} unknown candidate(s)`,
            );
            this.result("dtc", "dtc", d);
          } catch (err) {
            dtcResult = this.errAsStage(err);
            this.warn("dtc", `DTC scan failed: ${(err as Error).message}`);
            this.phase("dtc", "error", "DTC scan failed — continuing");
          }
        } else {
          this.phase("dtc", "skipped", "Skipped by user");
        }

        // ── PHASE: full dump (optional, slow) ────────────────────
        if (this.options.fullFlashDump) {
          this.throwIfCancelled();
          this.phase("dump", "running", PHASE_LABELS.dump);
          const start = this.options.flashDumpStart ?? 0x000000;
          const end = this.options.flashDumpEnd ?? 0x020000;
          const length = end - start;
          this.warn(
            "dump",
            `Full flash dump: ${length} bytes at ~4 bytes/request over J1850 VPW. This will take a long time. Keep the battery on a tender and do not disturb the computer.`,
          );
          this.narrate(
            "dump",
            `Dumping ${length} bytes from 0x${start.toString(16).padStart(6, "0")} to 0x${end.toString(16).padStart(6, "0")}…`,
          );
          try {
            const mem = await readMemory(driver, start, length, {
              onProgress: (done, total) => {
                this.emit({
                  type: "progress",
                  phase: "dump",
                  done,
                  total,
                  label: `Dump ${done}/${total} bytes`,
                  ts: this.now(),
                });
              },
            });
            this.result("dump", "dumpBytes", Array.from(mem.bytes));
            this.result("dump", "dumpStart", start);
            fullDumpPath = "(saved separately by main process)";
            this.phase(
              "dump",
              "ok",
              `Full flash dump complete (${mem.chunksRead} chunks, ${mem.retriesUsed} retries, ${(mem.durationMs / 1000).toFixed(1)}s)`,
            );
          } catch (err) {
            this.warn("dump", `Full dump failed: ${(err as Error).message}`);
            this.phase("dump", "error", "Full flash dump failed");
          }
        } else {
          this.phase("dump", "skipped", "Full flash dump not requested");
        }

        // ── PHASE: report ──────────────────────────────────────────
        this.phase("report", "running", PHASE_LABELS.report);
        const reportMd = buildReport({
          toolVersion: this.deps.platform.toolVersion,
          generatedAt: new Date(),
          platform: {
            os: this.deps.platform.os,
            osVersion: this.deps.platform.osVersion,
            arch: this.deps.platform.arch,
          },
          adapter: {
            label: this.deps.adapterLabel,
            baudRate: this.deps.adapterBaudRate,
          },
          init: initReport!,
          ping: pingResult,
          unlock: unlockResult,
          broadcast: broadcastResult,
          dtc: dtcResult,
          fullDumpPath,
          warnings,
          errors,
          trafficLog: driver.trace,
        });
        const filename = reportFilename(new Date(), matchedBroadcastCode);
        this.phase("report", "ok", `Report built: ${filename}`);

        wireUnsub();
        this.emit({
          type: "done",
          success: true,
          reportMarkdown: reportMd,
          suggestedFilename: filename,
          ts: this.now(),
        });
      } finally {
        wireUnsub();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      const why =
        err instanceof TransportError
          ? err.why
          : err instanceof KwpNegativeError
            ? err.nrc.why
            : undefined;
      const fix =
        err instanceof TransportError
          ? err.fix
          : err instanceof KwpNegativeError
            ? err.nrc.fix
            : undefined;
      this.fail(null, msg, why, fix);

      // Still emit a report with whatever we have. The report is the
      // deliverable — failures become data, not reasons to hide data.
      const reportMd = buildReport({
        toolVersion: this.deps.platform.toolVersion,
        generatedAt: new Date(),
        platform: {
          os: this.deps.platform.os,
          osVersion: this.deps.platform.osVersion,
          arch: this.deps.platform.arch,
        },
        adapter: {
          label: this.deps.adapterLabel,
          baudRate: this.deps.adapterBaudRate,
        },
        init:
          initReport ??
          { error: "run failed before init", why, fix },
        ping: pingResult,
        unlock: unlockResult,
        broadcast: broadcastResult,
        dtc: dtcResult,
        fullDumpPath,
        warnings,
        errors,
        trafficLog: driver.trace,
      });
      const filename = reportFilename(new Date(), matchedBroadcastCode);
      this.emit({
        type: "done",
        success: false,
        reportMarkdown: reportMd,
        suggestedFilename: filename,
        ts: this.now(),
      });
    } finally {
      try {
        await driver.detach();
      } catch {
        // best-effort
      }
    }
  }

  private errAsStage(err: unknown): { error: string; why?: string; fix?: string } {
    if (err instanceof TransportError) {
      return { error: err.message, why: err.why, fix: err.fix };
    }
    if (err instanceof KwpNegativeError) {
      return { error: err.message, why: err.nrc.why, fix: err.nrc.fix };
    }
    return { error: (err as Error).message };
  }

  private attachWireLogger(driver: ElmDriver): () => void {
    // We can't intercept the driver's write path without changing it,
    // so we poll the trace buffer with a cursor. Polling at 40ms is
    // fine because each ELM command is request/response serial.
    let cursor = driver.trace.length;
    let stopped = false;
    const tick = (): void => {
      if (stopped) return;
      const buf = driver.trace;
      while (cursor < buf.length) {
        const e = buf[cursor]!;
        this.emit({
          type: "wire",
          direction: e.direction,
          payload: e.payload,
          ts: e.ts,
        });
        cursor++;
      }
      setTimeout(tick, 40);
    };
    tick();
    return () => {
      // Drain any remaining events on stop
      const buf = driver.trace;
      while (cursor < buf.length) {
        const e = buf[cursor]!;
        this.emit({
          type: "wire",
          direction: e.direction,
          payload: e.payload,
          ts: e.ts,
        });
        cursor++;
      }
      stopped = true;
    };
  }
}
