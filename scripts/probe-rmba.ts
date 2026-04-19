// Live-hardware probe for Mode 0x23 (ReadMemoryByAddress) format variants.
//
// Usage:
//   npx jiti scripts/probe-rmba.ts <serial-port>
//   e.g. npx jiti scripts/probe-rmba.ts /dev/tty.usbserial-223230349701
//
// Context: on DNYY the canonical request `23 AH AM AL SIZE` works. On some
// other PCM32U variants (observed on an Isuzu Axiom 3.5L AT) the same
// request is refused with NRC 0x12 (subFunctionNotSupported) and the ECU
// echoes the request parameters before the NRC in the negative response.
// That tells us the service exists but the parameter framing is wrong.
//
// This probe sends the same read request (4 bytes at the start of the
// broadcast window, 0x018270) using a handful of alternative parameter
// layouts. For each variant it prints the raw adapter response so we can
// see which one the ECU likes.
//
// The probe uses driver.command() directly rather than sendKwp() so every
// response is surfaced as raw text, regardless of whether it parses as a
// negative response.

import { SerialTransport } from "../src/shared/transport/serial";
import { ElmDriver } from "../src/shared/elm327/driver";
import { KwpClient } from "../src/shared/kwp/client";
import { parseJ1850Frame, splitElmResponse } from "../src/shared/elm327/frames";
import { explainNrc } from "../src/shared/elm327/nrc";

const TARGET_ADDR = { ah: 0x01, am: 0x82, al: 0x70 };
const TARGET_SIZE = 0x04;

interface Variant {
  readonly id: string;
  readonly desc: string;
  readonly bytes: readonly number[];
}

const { ah, am, al } = TARGET_ADDR;
const variants: readonly Variant[] = [
  {
    id: "A",
    desc: "standard: 23 AH AM AL SIZE (what the tool sends today)",
    bytes: [0x23, ah, am, al, TARGET_SIZE],
  },
  {
    id: "B",
    desc: "2-byte size tail: 23 AH AM AL 00 SIZE",
    bytes: [0x23, ah, am, al, 0x00, TARGET_SIZE],
  },
  {
    id: "C",
    desc: "4-byte address, leading zero: 23 00 AH AM AL SIZE",
    bytes: [0x23, 0x00, ah, am, al, TARGET_SIZE],
  },
  {
    id: "D",
    desc: "GM address/length format prefix 0x14: 23 14 AH AM AL SIZE",
    bytes: [0x23, 0x14, ah, am, al, TARGET_SIZE],
  },
  {
    id: "E",
    desc: "size first, then address: 23 SIZE AH AM AL",
    bytes: [0x23, TARGET_SIZE, ah, am, al],
  },
  {
    id: "F",
    desc: "3-byte size tail: 23 AH AM AL 00 00 SIZE",
    bytes: [0x23, ah, am, al, 0x00, 0x00, TARGET_SIZE],
  },
  {
    id: "G",
    desc: "subfunction 0x81 (GM 'readByAddress' variant): 23 81 AH AM AL SIZE",
    bytes: [0x23, 0x81, ah, am, al, TARGET_SIZE],
  },
  {
    id: "H",
    desc: "single-byte read (size=1) standard form: 23 AH AM AL 01",
    bytes: [0x23, ah, am, al, 0x01],
  },
];

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

interface ParsedResult {
  readonly raw: string;
  readonly frames: ReturnType<typeof parseJ1850Frame>[];
  readonly verdict: string;
}

function analyze(raw: string, requestBytes: readonly number[]): ParsedResult {
  const cleaned = raw.replace(/>\s*$/, "").trim();
  const { lines, statuses } = splitElmResponse(raw);
  const frames = lines.map((l) => parseJ1850Frame(l));

  if (statuses.some((s) => /NO DATA|UNABLE|ERROR|STOPPED/i.test(s))) {
    return {
      raw: cleaned,
      frames,
      verdict: `adapter status: ${statuses.join(" / ")}`,
    };
  }

  if (frames.length === 0) {
    return { raw: cleaned, frames, verdict: "no frames parsed" };
  }

  const first = frames[0]!;
  if (!first) {
    return { raw: cleaned, frames, verdict: "frame parse failed" };
  }

  if (first.sid === 0x63) {
    const payload = first.data.slice(3);
    return {
      raw: cleaned,
      frames,
      verdict: `✅ POSITIVE (0x63) — payload: ${hex([...payload])}`,
    };
  }

  if (first.sid === 0x7f) {
    const requestedSid = first.data[0] ?? 0;
    // Extract NRC both ways so we can compare.
    const nrcStandard = first.data[1] ?? 0;
    const nrcExtended =
      first.data.length >= 2 ? first.data[first.data.length - 1]! : 0;
    const middle = first.data.slice(1, -1);
    const reqTail = requestBytes.slice(1);
    const echoesRequest =
      middle.length === reqTail.length &&
      middle.every((b, i) => b === reqTail[i]);
    const nrcInfo = explainNrc(nrcExtended);
    return {
      raw: cleaned,
      frames,
      verdict:
        `❌ NEGATIVE 7F ${requestedSid.toString(16).toUpperCase().padStart(2, "0")} — ` +
        `NRC=0x${nrcExtended.toString(16).toUpperCase().padStart(2, "0")} (${nrcInfo.name})` +
        (echoesRequest
          ? ` [extended format, echoes request params]`
          : ` [standard format; data[1]=0x${nrcStandard.toString(16)}]`),
    };
  }

  return {
    raw: cleaned,
    frames,
    verdict: `unexpected SID 0x${first.sid.toString(16)}`,
  };
}

async function main() {
  const port = process.argv[2];
  if (!port) {
    console.error(
      "usage: npx jiti scripts/probe-rmba.ts <serial-port>\n" +
        "  e.g. npx jiti scripts/probe-rmba.ts /dev/tty.usbserial-223230349701",
    );
    process.exit(1);
  }

  console.log(`[init] opening ${port} @ 115200`);
  const transport = new SerialTransport({ path: port, baudRate: 115200 });
  const driver = new ElmDriver(transport);

  try {
    await driver.attach();
    console.log("[init] running ELM init");
    const report = await driver.init();
    console.log(
      `[init] firmware=${report.firmwareId} protocol=${report.protocol}`,
    );
    if (report.degradedSteps.length) {
      console.log(`[init] degraded: ${report.degradedSteps.join(", ")}`);
    }

    console.log("\n[ping] Mode 0x20");
    const client = new KwpClient(driver);
    const ping = await client.ping();
    console.log(`[ping] ok=${ping.ok} echo=0x${ping.echoByte.toString(16)}`);

    console.log("\n[unlock] Mode 0x27 01/02 (algo 0x31 table 1)");
    const unlock = await client.unlock({ algo: 0x31, table: 1 });
    console.log(
      `[unlock] method=${unlock.method} seed=0x${unlock.seed.toString(16).toUpperCase()} key=0x${unlock.key.toString(16).toUpperCase()}`,
    );

    console.log(
      `\n=== Mode 0x23 format probe @ addr 0x${[ah, am, al].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()} size ${TARGET_SIZE} ===`,
    );
    console.log(
      "  (note: all variants read the same address+size — only the request framing changes)\n",
    );

    for (const v of variants) {
      console.log(`--- ${v.id}. ${v.desc}`);
      console.log(`    tx: ${hex(v.bytes)}`);
      const hexCmd = toHexString(v.bytes);
      try {
        const raw = await driver.command(hexCmd, 2000);
        const parsed = analyze(raw, v.bytes);
        for (const f of parsed.frames) {
          if (f) console.log(`    rx: ${hex([...f.bytes])}`);
        }
        if (parsed.frames.length === 0) {
          console.log(`    rx: (no frames) raw=${JSON.stringify(parsed.raw)}`);
        }
        console.log(`    => ${parsed.verdict}`);
      } catch (err) {
        console.log(`    ERR: ${(err as Error).message}`);
      }
      // Tiny cool-off; some ECUs wig out on back-to-back requests.
      await new Promise((r) => setTimeout(r, 80));
    }

    console.log(
      "\nDone. Copy the output above so we can identify the accepted format.",
    );
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
