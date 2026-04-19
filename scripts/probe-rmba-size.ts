// Phase-2 RMBA probe: now that we know variant A (`23 AH AM AL SIZE`) works
// at size=1 on this Axiom ECU but not at size=4, we need to characterize:
//
//   1. The exact upper bound on SIZE (is it 1, 2, or 3?).
//   2. The response payload format — when we ask for size=1 we got back
//      4 data bytes (`00 00 00 01`). Two hypotheses:
//        (a) Fixed 4-byte payload, only `size` bytes are meaningful (which
//            position holds them?).
//        (b) The ECU always returns 4 sequential bytes from the requested
//            address, regardless of the size byte.
//
// We disambiguate by reading 4 consecutive addresses with size=1 and
// looking at how the payloads relate. If hypothesis (b) is true, the
// payloads will shift by one byte position each request.
//
// Usage: npx jiti scripts/probe-rmba-size.ts <serial-port>

import { SerialTransport } from "../src/shared/transport/serial";
import { ElmDriver } from "../src/shared/elm327/driver";
import { KwpClient } from "../src/shared/kwp/client";
import { parseJ1850Frame, splitElmResponse } from "../src/shared/elm327/frames";
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
function ascii(b: number): string {
  return b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ".";
}

interface ParsedRx {
  readonly raw: string;
  readonly sid: number | null;
  readonly data: readonly number[];
  readonly verdict: string;
}

function parseRx(raw: string, requestBytes: readonly number[]): ParsedRx {
  const cleaned = raw.replace(/>\s*$/, "").trim();
  const { lines, statuses } = splitElmResponse(raw);
  if (statuses.some((s) => /NO DATA|UNABLE|ERROR|STOPPED/i.test(s))) {
    return {
      raw: cleaned,
      sid: null,
      data: [],
      verdict: `adapter status: ${statuses.join(" / ")}`,
    };
  }
  const f = lines.length ? parseJ1850Frame(lines[0]!) : null;
  if (!f) {
    return { raw: cleaned, sid: null, data: [], verdict: "unparseable" };
  }
  if (f.sid === 0x63) {
    return {
      raw: cleaned,
      sid: f.sid,
      data: f.data,
      verdict: `✅ POSITIVE — data=${hex([...f.data])} (${f.data.length} bytes)`,
    };
  }
  if (f.sid === 0x7f) {
    const nrc = f.data.length >= 2 ? f.data[f.data.length - 1]! : 0;
    return {
      raw: cleaned,
      sid: f.sid,
      data: f.data,
      verdict: `❌ NRC=0x${nrc.toString(16).toUpperCase().padStart(2, "0")} (${explainNrc(nrc).name})`,
    };
  }
  return {
    raw: cleaned,
    sid: f.sid,
    data: f.data,
    verdict: `unexpected SID 0x${f.sid.toString(16)}`,
  };
}

async function send(driver: ElmDriver, bytes: number[]): Promise<ParsedRx> {
  const raw = await driver.command(toHexString(bytes), 2000);
  return parseRx(raw, bytes);
}

async function main() {
  const port = process.argv[2];
  if (!port) {
    console.error("usage: npx jiti scripts/probe-rmba-size.ts <serial-port>");
    process.exit(1);
  }

  const transport = new SerialTransport({ path: port, baudRate: 115200 });
  const driver = new ElmDriver(transport);

  try {
    await driver.attach();
    console.log("[init] running ELM init");
    await driver.init();

    console.log("[ping] Mode 0x20");
    const client = new KwpClient(driver);
    await client.ping();

    console.log("[unlock] Mode 0x27 (algo 0x31 table 1)");
    const unlock = await client.unlock({ algo: 0x31, table: 1 });
    console.log(
      `[unlock] ok — seed=0x${unlock.seed.toString(16).toUpperCase()} key=0x${unlock.key.toString(16).toUpperCase()}\n`,
    );

    // ── Phase A: size sweep at a known-good address ─────────────────
    // Re-use 0x018270 (we already know it accepts size=1 there).
    console.log(
      "=== Phase A: size sweep at 0x018270 (find the SIZE upper bound) ===",
    );
    for (const size of [1, 2, 3, 4]) {
      const req = [0x23, 0x01, 0x82, 0x70, size];
      console.log(`-- size=${size}  tx: ${hex(req)}`);
      const rx = await send(driver, req);
      console.log(`              => ${rx.verdict}`);
      await new Promise((r) => setTimeout(r, 80));
    }

    // ── Phase B: payload-format probe ───────────────────────────────
    // Read 5 consecutive addresses at size=1. If the ECU returns 4
    // sequential bytes from the requested address, the payload of each
    // call should match the *next* call shifted by one byte.
    console.log(
      "\n=== Phase B: 5 consecutive size=1 reads near the broadcast tag (0x018280..0x018284) ===",
    );
    console.log(
      "   (the broadcast tag should be ASCII letters around 0x018280)",
    );
    const collected: { addr: number; data: readonly number[] }[] = [];
    for (let i = 0; i < 5; i++) {
      const addr = 0x018280 + i;
      const req = [0x23, (addr >> 16) & 0xff, (addr >> 8) & 0xff, addr & 0xff, 0x01];
      console.log(`-- addr=0x${addr.toString(16).toUpperCase()}  tx: ${hex(req)}`);
      const rx = await send(driver, req);
      console.log(`              => ${rx.verdict}`);
      if (rx.sid === 0x63) {
        collected.push({ addr, data: rx.data });
      }
      await new Promise((r) => setTimeout(r, 80));
    }

    // ── Phase C: payload analysis ───────────────────────────────────
    if (collected.length >= 2) {
      console.log("\n=== Phase C: payload analysis ===");
      console.log(
        "   Each row: addr → data bytes (with ASCII rendering of trailing 4 bytes)",
      );
      for (const { addr, data } of collected) {
        // Heuristic: data starts with 2-byte addr echo (AM, AL) followed
        // by a 4-byte (or N-byte) memory window. Drop the first 2 bytes
        // for the ASCII view.
        const tail = data.slice(2);
        const asciiStr = tail.map(ascii).join("");
        console.log(
          `   0x${addr.toString(16).toUpperCase()}: data=${hex([...data])}   tail-as-ascii="${asciiStr}"`,
        );
      }
      // Cross-check: if the ECU returns 4 sequential bytes, then
      // collected[0].data[2..6] should equal collected[1].data[2..6]
      // shifted by one position to the LEFT.
      const a = collected[0]!.data.slice(2);
      const b = collected[1]!.data.slice(2);
      if (a.length >= 2 && b.length >= 1) {
        const shifted = a.slice(1);
        const match =
          shifted.length === Math.min(b.length, shifted.length) &&
          shifted.every((v, i) => v === b[i]);
        console.log(
          `\n   shift-by-one check: ${match ? "✅ payloads slide by 1 byte → ECU returns 4 sequential bytes per request" : "❌ payloads do NOT slide → fixed-position payload (size byte is meaningful)"}`,
        );
      }
    }
  } finally {
    try {
      await driver.detach();
    } catch {}
    try {
      await transport.close();
    } catch {}
  }
}

main().catch((err) => {
  console.error("probe failed:", err);
  process.exit(1);
});
