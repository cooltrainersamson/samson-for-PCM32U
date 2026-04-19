// Walks the DTC enable region from a saved diagnostic report and emits a
// per-slot catalog. The PCM32U DTC table layout is a tightly-packed array
// of 4-byte slots, each shaped like:
//
//   <enable> 0x00 <code-hi> <code-lo>
//
// where code-hi/code-lo are packed BCD — e.g. `07 24` decodes as "0724"
// and is reported by the powertrain as DTC P0724. Enable byte is bit 7
// for "enabled", bit 6 for MIL-on, bit 5 for the no-MIL variant.
//
// We parse the hex dump out of a markdown report (the `Raw hex dump of
// DTC enable region` block), walk the region in 4-byte strides, classify
// each slot, decode known codes, and emit the catalog as a new markdown
// section. This is the fastest path from "unknown candidates list" to
// "actionable list of DTC codes the project owner can review".
//
// Usage: npx jiti scripts/catalog-dtcs.ts <path-to-report.md> [out.md]

import { readFile, writeFile } from "node:fs/promises";

import { DTC_DB } from "../src/shared/pcm32u/dtcs";

interface Slot {
  readonly addr: number;
  readonly enable: number;
  readonly secondByte: number;
  readonly codeHi: number;
  readonly codeLo: number;
}

interface Decoded {
  readonly addr: number;
  readonly enable: number;
  readonly secondByte: number;
  readonly codeHi: number;
  readonly codeLo: number;
  readonly code: string | null;     // e.g. "P0724" or null if not a valid BCD code
  readonly enableLabel: string;
  readonly known: { code: string; desc: string } | null;
  readonly slotShape: "dtc" | "calib" | "skip";
}

const DTC_REGION_START = 0x00f900;
const DTC_REGION_END = 0x00fd00;

function isBcdNibble(n: number): boolean {
  return (n & 0xf) <= 9 && ((n >> 4) & 0xf) <= 9;
}

function decodeCode(hi: number, lo: number): string | null {
  if (!isBcdNibble(hi) || !isBcdNibble(lo)) return null;
  const d1 = (hi >> 4) & 0xf;
  const d2 = hi & 0xf;
  const d3 = (lo >> 4) & 0xf;
  const d4 = lo & 0xf;
  return `P${d1}${d2}${d3}${d4}`;
}

function enableLabel(b: number): string {
  if (b === 0x00) return "disabled";
  if ((b & 0x80) === 0) return `non-enable (0x${b.toString(16).padStart(2, "0")})`;
  const flags: string[] = ["enabled"];
  if (b & 0x40) flags.push("MIL");
  if (b & 0x20) flags.push("noMIL");
  if (b & 0x10) flags.push("bit4");
  if (b & 0x08) flags.push("bit3");
  if (b & 0x04) flags.push("bit2");
  if (b & 0x02) flags.push("bit1");
  if (b & 0x01) flags.push("bit0");
  return flags.join("|");
}

function classify(slot: Slot, knownByAddr: Map<number, { code: string; desc: string }>): Decoded {
  const known = knownByAddr.get(slot.addr) ?? null;
  const base = {
    addr: slot.addr,
    enable: slot.enable,
    secondByte: slot.secondByte,
    codeHi: slot.codeHi,
    codeLo: slot.codeLo,
    enableLabel: enableLabel(slot.enable),
  };
  // Only treat as a DTC slot if byte 1 is 0x00 and bytes 2/3 are valid BCD.
  if (slot.secondByte !== 0x00) {
    return { ...base, code: null, known: null, slotShape: "calib" };
  }
  const code = decodeCode(slot.codeHi, slot.codeLo);
  if (!code) {
    return { ...base, code: null, known: null, slotShape: "skip" };
  }
  return { ...base, code, known, slotShape: "dtc" };
}

function slotBytesStr(d: Decoded): string {
  return [d.enable, d.secondByte, d.codeHi, d.codeLo]
    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
    .join(" ");
}

function parseHexDump(reportMd: string): Map<number, number> {
  // Match `0x00F900  03 9A 04 A8 ...` lines from the DTC enable hex dump.
  const out = new Map<number, number>();
  for (const line of reportMd.split(/\r?\n/)) {
    const m = /^\s*0x([0-9A-Fa-f]{4,8})\s+((?:[0-9A-Fa-f]{2}\s+){1,16})/.exec(line);
    if (!m) continue;
    const base = parseInt(m[1]!, 16);
    if (base < DTC_REGION_START || base >= DTC_REGION_END) continue;
    const bytes = m[2]!.trim().split(/\s+/).map((b) => parseInt(b, 16));
    for (let i = 0; i < bytes.length; i++) {
      out.set(base + i, bytes[i]!);
    }
  }
  return out;
}

function buildSlots(mem: Map<number, number>): Slot[] {
  const slots: Slot[] = [];
  for (let addr = DTC_REGION_START; addr + 3 < DTC_REGION_END; addr += 4) {
    const b0 = mem.get(addr);
    const b1 = mem.get(addr + 1);
    const b2 = mem.get(addr + 2);
    const b3 = mem.get(addr + 3);
    if (b0 === undefined || b1 === undefined || b2 === undefined || b3 === undefined) {
      continue;
    }
    slots.push({ addr, enable: b0, secondByte: b1, codeHi: b2, codeLo: b3 });
  }
  return slots;
}

function summarize(decoded: Decoded[]): {
  totalSlots: number;
  dtcSlots: number;
  enabled: number;
  disabled: number;
  knownEnabled: number;
  unknownEnabled: number;
  byEnableByte: Map<number, number>;
} {
  const byEnableByte = new Map<number, number>();
  let dtcSlots = 0,
    enabled = 0,
    disabled = 0,
    knownEnabled = 0,
    unknownEnabled = 0;
  for (const d of decoded) {
    if (d.slotShape !== "dtc") continue;
    dtcSlots++;
    byEnableByte.set(d.enable, (byEnableByte.get(d.enable) ?? 0) + 1);
    if ((d.enable & 0x80) === 0) {
      disabled++;
    } else {
      enabled++;
      if (d.known) knownEnabled++;
      else unknownEnabled++;
    }
  }
  return {
    totalSlots: decoded.length,
    dtcSlots,
    enabled,
    disabled,
    knownEnabled,
    unknownEnabled,
    byEnableByte,
  };
}

function emitMarkdown(broadcast: string, decoded: Decoded[]): string {
  const sum = summarize(decoded);
  const lines: string[] = [];
  lines.push(`# DTC catalog — ${broadcast}`);
  lines.push("");
  lines.push(`Decoded from the DTC enable region 0x${DTC_REGION_START.toString(16).toUpperCase().padStart(6, "0")}..0x${DTC_REGION_END.toString(16).toUpperCase().padStart(6, "0")}.`);
  lines.push("");
  lines.push(`Each slot is 4 bytes: \`<enable> 0x00 <BCD-hi> <BCD-lo>\` → P-code.`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push("");
  lines.push(`- DTC-shaped slots: **${sum.dtcSlots}**`);
  lines.push(`- Enabled (bit 7 set): **${sum.enabled}**  (known in DTC_DB: ${sum.knownEnabled}, **new candidates: ${sum.unknownEnabled}**)`);
  lines.push(`- Disabled: ${sum.disabled}`);
  lines.push(`- Other 4-byte slots in region (calibration / non-DTC): ${sum.totalSlots - sum.dtcSlots}`);
  lines.push("");
  lines.push(`### Enable byte distribution`);
  lines.push("");
  lines.push(`| Byte | Count | Bits | Meaning hypothesis |`);
  lines.push(`|------|-------|------|---------------------|`);
  const orderedBytes = [...sum.byEnableByte.entries()].sort((a, b) => b[1] - a[1]);
  for (const [b, count] of orderedBytes) {
    lines.push(`| 0x${b.toString(16).toUpperCase().padStart(2, "0")} | ${count} | ${b.toString(2).padStart(8, "0")} | ${enableLabel(b)} |`);
  }
  lines.push("");

  // Section: enabled DTCs not in DTC_DB (the actionable list)
  lines.push(`## Enabled DTCs not in DTC_DB (new candidates for review)`);
  lines.push("");
  lines.push(`| Addr | Code | Enable | Slot bytes |`);
  lines.push(`|------|------|--------|------------|`);
  for (const d of decoded) {
    if (d.slotShape !== "dtc") continue;
    if ((d.enable & 0x80) === 0) continue;
    if (d.known) continue;
    lines.push(`| 0x${d.addr.toString(16).toUpperCase().padStart(6, "0")} | ${d.code} | 0x${d.enable.toString(16).toUpperCase().padStart(2, "0")} (${enableLabel(d.enable)}) | \`${slotBytesStr(d)}\` |`);
  }
  lines.push("");

  // Section: known DTCs (sanity check — should match DTC_DB)
  lines.push(`## Known DTCs from DTC_DB found in this scan`);
  lines.push("");
  lines.push(`| Addr | Code | Description | Enable | Matches default? |`);
  lines.push(`|------|------|-------------|--------|------------------|`);
  for (const d of decoded) {
    if (d.slotShape !== "dtc" || !d.known) continue;
    const expected = DTC_DB.find((e) => e.addr === d.addr);
    const matchesDefault = expected ? expected.defaultByte === d.enable : false;
    lines.push(`| 0x${d.addr.toString(16).toUpperCase().padStart(6, "0")} | ${d.known.code} | ${d.known.desc} | 0x${d.enable.toString(16).toUpperCase().padStart(2, "0")} | ${matchesDefault ? "✓" : `**no — expected 0x${expected?.defaultByte.toString(16).padStart(2, "0").toUpperCase()}**`} |`);
  }
  lines.push("");

  // Section: disabled-but-present DTCs (the ECU knows about them but they're off)
  lines.push(`## Disabled DTCs present in the table`);
  lines.push("");
  lines.push(`These slots have a valid DTC code but the enable byte is 0x00. The ECU's firmware knows about these codes but won't report them. Useful as evidence of which features are *implemented but switched off* on this calibration.`);
  lines.push("");
  lines.push(`| Addr | Code |`);
  lines.push(`|------|------|`);
  for (const d of decoded) {
    if (d.slotShape !== "dtc") continue;
    if ((d.enable & 0x80) !== 0) continue;
    if (d.enable !== 0x00) continue;
    lines.push(`| 0x${d.addr.toString(16).toUpperCase().padStart(6, "0")} | ${d.code} |`);
  }
  lines.push("");

  // Section: weird enable bytes (bit-7 unset but non-zero, like 0x60)
  lines.push(`## Slots with non-standard enable bytes`);
  lines.push("");
  lines.push(`Bit 7 is unset but the byte is non-zero — these probably encode a different category (e.g. history-only, or grouped under a different MIL-control bit). Worth a closer look.`);
  lines.push("");
  lines.push(`| Addr | Code | Enable byte |`);
  lines.push(`|------|------|-------------|`);
  for (const d of decoded) {
    if (d.slotShape !== "dtc") continue;
    if ((d.enable & 0x80) !== 0) continue;
    if (d.enable === 0x00) continue;
    lines.push(`| 0x${d.addr.toString(16).toUpperCase().padStart(6, "0")} | ${d.code} | 0x${d.enable.toString(16).toUpperCase().padStart(2, "0")} (${d.enable.toString(2).padStart(8, "0")}) |`);
  }
  lines.push("");

  return lines.join("\n");
}

async function main() {
  const reportPath = process.argv[2];
  if (!reportPath) {
    console.error("usage: npx jiti scripts/catalog-dtcs.ts <report.md> [out.md]");
    process.exit(1);
  }
  const reportMd = await readFile(reportPath, "utf8");
  const broadcastMatch = /Matched broadcast:\*\*\s*`?(\w{4})`?/.exec(reportMd);
  const broadcast = broadcastMatch ? broadcastMatch[1]! : "UNKNOWN";

  const mem = parseHexDump(reportMd);
  if (mem.size === 0) {
    console.error(
      "no DTC hex dump found in report — make sure the report includes the 'Raw hex dump of DTC enable region' block",
    );
    process.exit(1);
  }
  console.log(`parsed ${mem.size} bytes from hex dump`);

  const slots = buildSlots(mem);
  const knownByAddr = new Map(DTC_DB.map((e) => [e.addr, { code: e.code, desc: e.desc }]));
  const decoded = slots.map((s) => classify(s, knownByAddr));

  const md = emitMarkdown(broadcast, decoded);
  const outPath = process.argv[3] ?? reportPath.replace(/\.md$/, "-dtc-catalog.md");
  await writeFile(outPath, md, "utf8");
  console.log(`catalog written: ${outPath}`);

  const sum = summarize(decoded);
  console.log(
    `\nsummary: ${sum.dtcSlots} DTC slots, ${sum.enabled} enabled (${sum.knownEnabled} known + ${sum.unknownEnabled} new candidates), ${sum.disabled} disabled`,
  );
}

main().catch((err) => {
  console.error("catalog failed:", err);
  process.exit(1);
});
