// An in-memory PCM32U simulator that speaks just enough ELM327 +
// KWP2000-over-J1850-VPW to exercise the driver end-to-end without real
// hardware. It plays both the "adapter" role (AT command responses) and
// the "ECU" role (KWP2000 responses), because the real tool never sees
// the gap between them either.
//
// Supported services:
//   - Mode 0x20  alive ping
//   - Mode 0x27 01  request seed (returns live-verified DNYY seed 0x32E0)
//   - Mode 0x27 02  send key (accepts 0x7C73, rejects anything else)
//
// The mock is intentionally pedantic about the ELM init sequence so
// tests catch driver regressions.

import type { Transport } from "../transport/types";
import { createMockPair } from "../transport/mock";
import { parseHexLine } from "../elm327/frames";

export interface MockEcuOptions {
  readonly seed?: number;
  readonly expectedKey?: number;
  readonly firmwareBanner?: string;
  /** Inject faults at specific steps to test error paths. */
  readonly rejectAtsp?: boolean;
  readonly rejectAtal?: boolean;
  readonly firstAttemptTimesOut?: boolean;
}

interface EcuState {
  unlocked: boolean;
  lastSeed: number | null;
  seedRequestCount: number;
  headerBytes: number[];
}

const DEFAULT_SEED = 0x32e0;
const DEFAULT_KEY = 0x7c73;
const DEFAULT_BANNER = "ELM327 v1.5";

/**
 * Creates a paired transport and attaches the mock ECU to the "ecu" end.
 * The "driver" end is returned for the ElmDriver to use. Both endpoints
 * are already open on return.
 */
export async function attachMockEcu(
  opts: MockEcuOptions = {},
): Promise<{ driverTransport: Transport; mock: MockEcu }> {
  const [driverTransport, ecuTransport] = createMockPair();
  await driverTransport.open();
  await ecuTransport.open();
  const mock = new MockEcu(ecuTransport, opts);
  return { driverTransport, mock };
}

export class MockEcu {
  private inputBuffer = "";
  private state: EcuState = {
    unlocked: false,
    lastSeed: null,
    seedRequestCount: 0,
    headerBytes: [0x6c, 0x10, 0xf1],
  };
  private firstCommandConsumed = false;
  readonly log: string[] = [];

  constructor(
    readonly transport: Transport,
    readonly opts: MockEcuOptions,
  ) {
    transport.onData((chunk) => this.handleChunk(chunk));
  }

  get seed(): number {
    return this.opts.seed ?? DEFAULT_SEED;
  }
  get expectedKey(): number {
    return this.opts.expectedKey ?? DEFAULT_KEY;
  }
  get banner(): string {
    return this.opts.firmwareBanner ?? DEFAULT_BANNER;
  }

  private handleChunk(chunk: Uint8Array): void {
    for (let i = 0; i < chunk.length; i++) {
      this.inputBuffer += String.fromCharCode(chunk[i]!);
    }
    let crIdx: number;
    while ((crIdx = this.inputBuffer.indexOf("\r")) >= 0) {
      const cmd = this.inputBuffer.slice(0, crIdx).trim();
      this.inputBuffer = this.inputBuffer.slice(crIdx + 1);
      if (cmd.length > 0) this.handleCommand(cmd);
    }
  }

  private handleCommand(cmd: string): void {
    this.log.push(`IN  ${cmd}`);
    if (
      this.opts.firstAttemptTimesOut &&
      !this.firstCommandConsumed &&
      /^ATZ$/i.test(cmd)
    ) {
      // swallow silently to simulate baud-mismatch / dead adapter.
      this.firstCommandConsumed = true;
      return;
    }
    this.firstCommandConsumed = true;
    if (cmd.toUpperCase().startsWith("AT") || cmd.toUpperCase() === "AT@1") {
      this.handleAt(cmd.toUpperCase());
    } else {
      this.handleKwp(cmd);
    }
  }

  private handleAt(cmd: string): void {
    if (cmd === "ATZ") {
      this.respond(`\r${this.banner}\r\r>`);
      return;
    }
    if (cmd === "ATI") {
      this.respond(`${this.banner}\r>`);
      return;
    }
    if (cmd === "AT@1") {
      this.respond(`OBD MOCK ECU\r>`);
      return;
    }
    if (cmd === "ATDP") {
      this.respond(`SAE J1850 VPW\r>`);
      return;
    }
    if (cmd === "ATSP 2" || cmd === "ATSP2") {
      if (this.opts.rejectAtsp) return this.respond(`?\r>`);
      return this.respond(`OK\r>`);
    }
    if (cmd === "ATAL") {
      if (this.opts.rejectAtal) return this.respond(`?\r>`);
      return this.respond(`OK\r>`);
    }
    if (
      cmd === "ATE0" ||
      cmd === "ATL0" ||
      cmd === "ATH1" ||
      /^ATST /.test(cmd) ||
      /^ATSH /.test(cmd)
    ) {
      if (/^ATSH /.test(cmd)) {
        const parts = cmd.slice(5).trim().split(/\s+/);
        const headerBytes = parts.map((p) => parseInt(p, 16));
        if (headerBytes.length === 3 && headerBytes.every((b) => !Number.isNaN(b))) {
          // Store the tester's intended TX header; the ECU's response
          // header is fixed at 6C F1 10 (swap src/dst).
          this.state.headerBytes = headerBytes;
        }
      }
      return this.respond(`OK\r>`);
    }
    // Unknown AT command → '?' like the real ELM does
    this.respond(`?\r>`);
  }

  private handleKwp(cmd: string): void {
    const bytes = parseHexLine(cmd.replace(/(..)/g, "$1 ").trim());
    if (!bytes || bytes.length === 0) {
      this.respond(`?\r>`);
      return;
    }
    const sid = bytes[0]!;
    // Response headers: priority byte 6C, dest = tester (F1), src = ECU (10)
    const hdr = [0x6c, 0xf1, 0x10];
    if (sid === 0x20) {
      // Alive ping
      this.respondFrame([...hdr, 0x60, 0x00]);
      return;
    }
    if (sid === 0x27) {
      const sub = bytes[1];
      if (sub === 0x01) {
        this.state.seedRequestCount++;
        const hi = (this.seed >> 8) & 0xff;
        const lo = this.seed & 0xff;
        this.state.lastSeed = this.seed;
        this.respondFrame([...hdr, 0x67, 0x01, hi, lo]);
        return;
      }
      if (sub === 0x02) {
        const hi = bytes[2] ?? 0;
        const lo = bytes[3] ?? 0;
        const provided = ((hi << 8) | lo) & 0xffff;
        if (this.state.lastSeed === null) {
          this.respondFrame([...hdr, 0x7f, 0x27, 0x24]); // conditionsNotCorrect-ish
          return;
        }
        if (provided === this.expectedKey) {
          this.state.unlocked = true;
          this.respondFrame([...hdr, 0x67, 0x02, 0x34]);
          return;
        }
        this.respondFrame([...hdr, 0x7f, 0x27, 0x35]);
        return;
      }
      // Unknown subfunction
      this.respondFrame([...hdr, 0x7f, 0x27, 0x12]);
      return;
    }
    // Any other SID → serviceNotSupported
    this.respondFrame([...hdr, 0x7f, sid, 0x11]);
  }

  private respondFrame(bytes: number[]): void {
    const withCrc = [...bytes, 0x00]; // fake CRC — driver tolerates it
    const hex = withCrc
      .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
      .join(" ");
    this.respond(`${hex}\r>`);
  }

  private respond(text: string): void {
    this.log.push(`OUT ${text.replace(/\r/g, "\\r")}`);
    const bytes = new TextEncoder().encode(text);
    void this.transport.write(bytes);
  }
}
