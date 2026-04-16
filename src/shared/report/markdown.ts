// Markdown report generator. Every diagnostic run ends with one of these;
// the user is expected to email it to the project owner so he can extend
// his broadcast / DTC tables. Structure follows handoff §9 but with
// headline emphasis on the table-hunting findings (unknown candidates).

import type { ElmInitReport, ElmTrace } from "../elm327/driver";
import type { UnlockResult } from "../kwp/client";
import type { BroadcastScanResult } from "../scanner/broadcast";
import type { DtcScanResult } from "../scanner/dtc";

export interface ReportInput {
  readonly toolVersion: string;
  readonly generatedAt: Date;
  readonly platform: {
    readonly os: string;
    readonly osVersion?: string;
    readonly arch?: string;
  };
  readonly adapter: {
    readonly label: string;
    readonly baudRate?: number;
    readonly vendorId?: string;
    readonly productId?: string;
  };
  readonly init: ElmInitReport | { error: string; why?: string; fix?: string };
  readonly ping?: { ok: boolean; echoByte: number } | { error: string };
  readonly unlock?: UnlockResult | { error: string; why?: string; fix?: string };
  readonly broadcast?: BroadcastScanResult | { error: string; why?: string; fix?: string };
  readonly dtc?: DtcScanResult | { error: string; why?: string; fix?: string };
  readonly fullDumpPath?: string;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly trafficLog: readonly ElmTrace[];
}

function hex(n: number, width = 2): string {
  return n.toString(16).toUpperCase().padStart(width, "0");
}

function addr(n: number): string {
  return `0x${hex(n, 6)}`;
}

function hexDump(bytes: Uint8Array, baseAddr: number, bytesPerLine = 16): string {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += bytesPerLine) {
    const slice = bytes.slice(i, i + bytesPerLine);
    const hexCols = Array.from(slice).map((b) => hex(b)).join(" ");
    const ascii = Array.from(slice)
      .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : "."))
      .join("");
    lines.push(`${addr(baseAddr + i)}  ${hexCols.padEnd(bytesPerLine * 3)}  |${ascii}|`);
  }
  return lines.join("\n");
}

function hasError(
  v: unknown,
): v is { error: string; why?: string; fix?: string } {
  return (
    typeof v === "object" &&
    v !== null &&
    "error" in (v as Record<string, unknown>)
  );
}

export function buildReport(input: ReportInput): string {
  const lines: string[] = [];
  const push = (s = ""): void => void lines.push(s);

  push(`# PCM32U Diagnostic Report`);
  push();
  push(`- **Generated:** ${input.generatedAt.toISOString()}`);
  push(`- **Tool version:** ${input.toolVersion}`);
  push(`- **Platform:** ${input.platform.os}${input.platform.osVersion ? " " + input.platform.osVersion : ""}${input.platform.arch ? " (" + input.platform.arch + ")" : ""}`);
  push(`- **Adapter:** ${input.adapter.label}${input.adapter.baudRate ? " @ " + input.adapter.baudRate : ""}${input.adapter.vendorId ? " [VID:" + input.adapter.vendorId + " PID:" + (input.adapter.productId ?? "?") + "]" : ""}`);
  push();

  // ── 1. Adapter init ────────────────────────────────────────────────
  push(`## 1. Adapter initialization`);
  push();
  if (hasError(input.init)) {
    push(`**❌ FAILED:** ${input.init.error}`);
    if (input.init.why) push(`> **Why:** ${input.init.why}`);
    if (input.init.fix) push(`> **Fix:** ${input.init.fix}`);
  } else {
    const r = input.init;
    push(`- Firmware banner: \`${r.firmwareId ?? "(unknown)"}\``);
    push(`- Device ID: \`${r.deviceId ?? "(not reported)"}\``);
    push(`- Protocol: \`${r.protocol ?? "(not reported)"}\``);
    push(`- Accepted steps: ${r.acceptedSteps.map((s) => "`" + s + "`").join(", ")}`);
    if (r.degradedSteps.length > 0) {
      push(`- ⚠️ Degraded steps (adapter rejected optional commands, continuing):`);
      for (const s of r.degradedSteps) push(`  - ${s}`);
    }
  }
  push();

  // ── 2. Ping ────────────────────────────────────────────────────────
  push(`## 2. ECU alive ping (Mode 0x20)`);
  push();
  if (!input.ping) {
    push(`_not run_`);
  } else if ("error" in input.ping) {
    push(`**❌ FAILED:** ${input.ping.error}`);
  } else {
    push(`✅ ECU responded (echo byte \`0x${hex(input.ping.echoByte)}\`)`);
  }
  push();

  // ── 3. Seed-key unlock ─────────────────────────────────────────────
  push(`## 3. Seed-key unlock (Mode 0x27)`);
  push();
  if (!input.unlock) {
    push(`_not run_`);
  } else if (hasError(input.unlock)) {
    push(`**❌ FAILED:** ${input.unlock.error}`);
    if (input.unlock.why) push(`> **Why:** ${input.unlock.why}`);
    if (input.unlock.fix) push(`> **Fix:** ${input.unlock.fix}`);
  } else {
    const u = input.unlock;
    push(`- **Result:** ${u.unlocked ? "✅ UNLOCKED" : "❌ FAILED"}`);
    push(`- Seed: \`0x${hex(u.seed, 4)}\``);
    push(`- Key:  \`0x${hex(u.key, 4)}\``);
    push(`- Algo: \`0x${hex(u.algo)}\` (table ${u.table})`);
    push(`- Method: ${u.method}`);
    push(`- Raw seed frame: \`${u.rawSeedFrame}\``);
    push(`- Raw key frame:  \`${u.rawKeyFrame}\``);
  }
  push();

  // ── 4. Broadcast identification (HEADLINE FEATURE) ─────────────────
  push(`## 4. Broadcast code identification`);
  push();
  if (!input.broadcast) {
    push(`_not run_`);
  } else if (hasError(input.broadcast)) {
    push(`**❌ FAILED:** ${input.broadcast.error}`);
    if (input.broadcast.why) push(`> **Why:** ${input.broadcast.why}`);
    if (input.broadcast.fix) push(`> **Fix:** ${input.broadcast.fix}`);
  } else {
    const b = input.broadcast;
    push(`- Scanned window: \`${addr(b.scannedAddr)}..${addr(b.scannedAddr + b.scannedLength)}\` (${b.scannedLength} bytes)`);
    if (b.matched && b.matchAddr !== null) {
      push(`- **Matched broadcast:** \`${b.matched.code}\` @ ${addr(b.matchAddr)}`);
      push(`  - Vehicle: ${b.matched.vehicle}`);
      push(`  - Year/market: ${b.matched.year} / ${b.matched.market}`);
      push(`  - Transmission: ${b.matched.trans}`);
      push(`  - Engine: ${b.matched.engine}`);
      push(`  - configBase: ${addr(b.matched.configBase)}`);
      push(`  - dtcBase: ${addr(b.matched.dtcBase)}`);
    } else {
      push(`- **No known broadcast matched.** This is valuable — please send this report.`);
      if (b.candidates.length > 0) {
        push(`- Unknown 4-letter ASCII candidates in window:`);
        for (const c of b.candidates) {
          push(`  - ${addr(c.addr)}  \`${c.text}\``);
        }
      } else {
        push(`- No 4-letter ASCII runs found at all. The broadcast may be stored elsewhere, or the scan window is wrong for this ECU variant.`);
      }
    }
    if (b.asciiRuns.length > 0) {
      push();
      push(`<details><summary>All ASCII runs in window (${b.asciiRuns.length})</summary>`);
      push();
      push(`\`\`\``);
      for (const r of b.asciiRuns) {
        push(`${addr(r.addr)}  [${r.length}]  ${JSON.stringify(r.text)}`);
      }
      push(`\`\`\``);
      push();
      push(`</details>`);
    }
    push();
    push(`<details><summary>Raw hex dump of broadcast window</summary>`);
    push();
    push(`\`\`\``);
    push(hexDump(b.rawBytes, b.scannedAddr));
    push(`\`\`\``);
    push();
    push(`</details>`);
  }
  push();

  // ── 5. DTC tables (HEADLINE FEATURE) ───────────────────────────────
  push(`## 5. DTC table scan`);
  push();
  if (!input.dtc) {
    push(`_not run_`);
  } else if (hasError(input.dtc)) {
    push(`**❌ FAILED:** ${input.dtc.error}`);
    if (input.dtc.why) push(`> **Why:** ${input.dtc.why}`);
    if (input.dtc.fix) push(`> **Fix:** ${input.dtc.fix}`);
  } else {
    const d = input.dtc;
    push(`- Scanned region: \`${addr(d.enableRegion.startAddr)}..${addr(d.enableRegion.startAddr + d.enableRegion.bytes.length)}\` (${d.enableRegion.bytes.length} bytes)`);
    push();
    push(`### 5.1 Known DTCs from DTC_DB`);
    push();
    push(`| Addr | Code | Desc | Expected | Actual | Enabled |`);
    push(`|------|------|------|----------|--------|---------|`);
    for (const k of d.known) {
      push(
        `| ${addr(k.entry.addr)} | ${k.entry.code} | ${k.entry.desc} | 0x${hex(k.entry.defaultByte)} | 0x${hex(k.actualByte)}${k.matchesDefault ? "" : " ⚠"} | ${k.enabled ? "✓" : "✗"} |`,
      );
    }
    push();
    push(`### 5.2 Unknown DTC candidates (bit-7-set bytes in clusters)`);
    push();
    if (d.unknownCandidates.length === 0) {
      push(`_none detected in this window_`);
    } else {
      push(`**These are bytes with bit 7 set that cluster with other enable-shaped bytes but are not in DTC_DB. Likely uncharacterized DTCs the project owner has not yet catalogued — please send this report so he can extend the database.**`);
      push();
      push(`| Addr | Byte | Nearby enable bytes |`);
      push(`|------|------|---------------------|`);
      for (const u of d.unknownCandidates) {
        push(`| ${addr(u.addr)} | 0x${hex(u.byte)} | ${u.clusterCount} |`);
      }
    }
    push();
    if (d.descriptorTable) {
      push(`### 5.3 DTC descriptor table (${DESC_LABEL})`);
      push();
      push(`\`\`\``);
      push(hexDump(d.descriptorTable.bytes, d.descriptorTable.startAddr));
      push(`\`\`\``);
      push();
    }
    push(`<details><summary>Raw hex dump of DTC enable region (${d.enableRegion.bytes.length} bytes)</summary>`);
    push();
    push(`\`\`\``);
    push(hexDump(d.enableRegion.bytes, d.enableRegion.startAddr));
    push(`\`\`\``);
    push();
    push(`</details>`);
  }
  push();

  // ── 6. Full flash dump ─────────────────────────────────────────────
  push(`## 6. Full flash dump`);
  push();
  if (input.fullDumpPath) {
    push(`Full flash saved to: \`${input.fullDumpPath}\``);
  } else {
    push(`_not run_ (optional, slow — see the Connect tab in the app)`);
  }
  push();

  // ── 7. Warnings & errors ───────────────────────────────────────────
  push(`## 7. Warnings and errors`);
  push();
  if (input.warnings.length === 0 && input.errors.length === 0) {
    push(`_none_`);
  } else {
    for (const w of input.warnings) push(`- ⚠️ ${w}`);
    for (const e of input.errors) push(`- ❌ ${e}`);
  }
  push();

  // ── 8. Raw traffic log ─────────────────────────────────────────────
  push(`## 8. Raw traffic log`);
  push();
  push(`<details><summary>${input.trafficLog.length} entries</summary>`);
  push();
  push(`\`\`\``);
  for (const t of input.trafficLog) {
    const stamp = new Date(t.ts).toISOString().slice(11, 23);
    push(`${stamp}  ${t.direction.padEnd(4)}  ${t.payload}${t.note ? "  ; " + t.note : ""}`);
  }
  push(`\`\`\``);
  push();
  push(`</details>`);
  push();

  // ── 9. What to do next ─────────────────────────────────────────────
  push(`## 9. How to share this report`);
  push();
  push(`If anything in sections 4 or 5 shows "unknown candidates" or a broadcast that didn't match, the project owner would like to see this report to extend his reverse-engineered tables:`);
  push();
  push(`1. **Review the file** before sending — the tool does not collect PII, but always double-check.`);
  push(`2. **Email the \`.md\` file** to **cooltrainersamson@gmail.com**`);
  push(`3. Include: vehicle year/make/model, last 6 digits of the VIN (optional), and any modifications already done.`);
  push();

  return lines.join("\n");
}

const DESC_LABEL = `256 bytes at 0x67358 — see Phase 14 DSPX analysis`;

/** Standard filename per the reports/ folder convention. */
export function reportFilename(date: Date, broadcast: string | null): string {
  const iso = date.toISOString().slice(0, 10); // YYYY-MM-DD
  const tag = broadcast ?? "UNKNOWN";
  return `${iso}-${tag}.md`;
}
