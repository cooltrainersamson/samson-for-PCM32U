// Investigate the meaning of the 0x60 enable byte by asking the ECU what
// DTCs it currently considers "stored" or "pending". If 0x60 codes show
// up in any of those queries, the byte is some flavor of *enabled*; if
// they never do, 0x60 is a flavor of *disabled* (configured but inert).
//
// Standard KWP2000 services tried, in order:
//   - 0x18 ReadDTCByStatus      `18 <subFn> <statusMask>`
//   - 0x13 ReadDiagnosticTroubleCodes — older GM-flavored variant
//   - 0x12 ReadFreezeFrameData (probe just to see what's supported)
//
// All three are read-only and not on the safety blocklist. We tolerate
// NRCs and report them so we can characterize the ECU's service support.
//
// Usage: npx jiti scripts/probe-dtc-status.ts <serial-port>

import { SerialTransport } from "../src/shared/transport/serial";
import { ElmDriver } from "../src/shared/elm327/driver";
import { KwpClient } from "../src/shared/kwp/client";
import {
  parseJ1850Frame,
  splitElmResponse,
} from "../src/shared/elm327/frames";
import { explainNrc } from "../src/shared/elm327/nrc";

function hex(bytes: number[] | readonly number[]): string {
  return bytes
    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
    .join(" ");
}
function toHexString(bytes: readonly number[]): string {
  return bytes
    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
    .join("");
}

interface Outcome {
  readonly ok: boolean;
  readonly verdict: string;
  readonly frames: { hex: string; sid: number; data: number[] }[];
}

async function probe(driver: ElmDriver, label: string, bytes: number[]): Promise<Outcome> {
  const tx = hex(bytes);
  console.log(`\n--- ${label}`);
  console.log(`    tx: ${tx}`);
  try {
    const raw = await driver.command(toHexString(bytes), 2000);
    const { lines, statuses } = splitElmResponse(raw);
    if (statuses.some((s) => /NO DATA|UNABLE|ERROR|STOPPED/i.test(s))) {
      const v = `adapter status: ${statuses.join(" / ")}`;
      console.log(`    => ${v}`);
      return { ok: false, verdict: v, frames: [] };
    }
    const frames = lines
      .map((l) => parseJ1850Frame(l))
      .filter((f): f is NonNullable<typeof f> => f !== null);
    for (const f of frames) {
      console.log(`    rx: ${hex([...f.bytes])}`);
    }
    if (frames.length === 0) {
      const v = `no frames: ${JSON.stringify(raw.trim())}`;
      console.log(`    => ${v}`);
      return { ok: false, verdict: v, frames: [] };
    }
    const first = frames[0]!;
    if (first.sid === 0x7f) {
      const nrc =
        first.data.length >= 2
          ? first.data[first.data.length - 1]!
          : 0;
      const v = `NRC=0x${nrc.toString(16).toUpperCase().padStart(2, "0")} (${explainNrc(nrc).name})`;
      console.log(`    => ${v}`);
      return {
        ok: false,
        verdict: v,
        frames: frames.map((f) => ({
          hex: hex([...f.bytes]),
          sid: f.sid,
          data: [...f.data],
        })),
      };
    }
    const v = `✅ POSITIVE (SID 0x${first.sid.toString(16)}) — ${frames.length} frame(s), ${first.data.length} bytes in first frame`;
    console.log(`    => ${v}`);
    return {
      ok: true,
      verdict: v,
      frames: frames.map((f) => ({
        hex: hex([...f.bytes]),
        sid: f.sid,
        data: [...f.data],
      })),
    };
  } catch (err) {
    const v = `EXCEPTION: ${(err as Error).message}`;
    console.log(`    => ${v}`);
    return { ok: false, verdict: v, frames: [] };
  }
}

function decodeP(hi: number, lo: number): string | null {
  const isBcd = (n: number) => (n & 0xf) <= 9 && ((n >> 4) & 0xf) <= 9;
  if (!isBcd(hi) || !isBcd(lo)) return null;
  const d1 = (hi >> 4) & 0xf;
  const d2 = hi & 0xf;
  const d3 = (lo >> 4) & 0xf;
  const d4 = lo & 0xf;
  return `P${d1}${d2}${d3}${d4}`;
}

async function main() {
  const port = process.argv[2];
  if (!port) {
    console.error("usage: npx jiti scripts/probe-dtc-status.ts <serial-port>");
    process.exit(1);
  }

  const transport = new SerialTransport({ path: port, baudRate: 115200 });
  const driver = new ElmDriver(transport);

  try {
    await driver.attach();
    console.log("[init] running ELM init");
    await driver.init();

    const client = new KwpClient(driver);
    console.log("[ping] Mode 0x20");
    await client.ping();

    console.log("[unlock] Mode 0x27 (algo 0x31 table 1)");
    const unlock = await client.unlock({ algo: 0x31, table: 1 });
    console.log(`[unlock] seed=0x${unlock.seed.toString(16).toUpperCase()} key=0x${unlock.key.toString(16).toUpperCase()}`);

    console.log("\n=== Mode 0x18 ReadDtcByStatus variants ===");
    // KWP2000 §8.7.5: 18 <reportType> <statusMask> <groupHi> <groupLo>
    // GM commonly uses subFunction 0x02 ("DTC by status mask") with
    // statusMask 0x00 (any status) and group 0xFF 0x00 (all groups).
    const a = await probe(driver, "A. ReadDTCByStatus all-groups, mask 0xFF",
      [0x18, 0x02, 0xff, 0xff, 0x00]);
    const b = await probe(driver, "B. ReadDTCByStatus stored-only, mask 0x00",
      [0x18, 0x02, 0x00, 0xff, 0x00]);
    const c = await probe(driver, "C. ReadDTCByStatus subFn 0x00 (status of supported)",
      [0x18, 0x00, 0xff, 0x00]);
    const d = await probe(driver, "D. Bare 18 — let ECU pick defaults", [0x18]);

    console.log("\n=== Mode 0x13 (older GM-style) ===");
    const e = await probe(driver, "E. Mode 0x13 bare", [0x13]);
    const f = await probe(driver, "F. Mode 0x13 with status byte 0xFF", [0x13, 0xff]);

    console.log("\n=== Mode 0x12 ReadFreezeFrameData ===");
    const g = await probe(driver, "G. Mode 0x12 record 0x00", [0x12, 0x00]);

    // Print decoded P-codes from any ReadDTC response that succeeded.
    const successes = [a, b, c, d, e, f].filter((o) => o.ok);
    if (successes.length === 0) {
      console.log(
        "\n(none of the DTC-read services succeeded — the ECU may not implement them, or the request format is different)",
      );
    } else {
      console.log("\n=== Decoded DTC payloads from successful queries ===");
      for (const out of successes) {
        const first = out.frames[0]!;
        const data = first.data;
        // Typical positive Mode 0x18 layout: <subFn> <count>? <DTChi> <DTClo> <status> ...
        // Print byte chunks of 3 starting after subFn echo (heuristic).
        console.log(`\n  ${out.verdict}`);
        console.log(`  raw data after SID: ${hex(data)}`);
        // Try to interpret as triples after the first byte
        for (let i = 1; i + 2 < data.length; i += 3) {
          const code = decodeP(data[i]!, data[i + 1]!);
          const status = data[i + 2]!;
          if (code) {
            console.log(
              `    @+${i}: code=${code}  status=0x${status.toString(16).padStart(2, "0").toUpperCase()}`,
            );
          }
        }
      }
    }
  } finally {
    try { await driver.detach(); } catch {}
    try { await transport.close(); } catch {}
  }
}

main().catch((err) => {
  console.error("probe failed:", err);
  process.exit(1);
});
