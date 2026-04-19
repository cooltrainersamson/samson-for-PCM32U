// ELM327 driver. Adapter-agnostic: works with any OBD-II adapter that
// speaks the ELM AT command set and has a J1850 VPW-capable chipset.
// Known-good with OBDLink SX, Vgate iCar, Veepeak, ELM327 v1.5+ clones.
//
// Design notes:
//   - Request/response is serialized: one outstanding command at a time.
//     The ELM can't handle interleaved commands anyway.
//   - Each command reads until it sees the '>' prompt OR a timeout fires.
//   - Init steps that fail with '?' are logged as degraded but do not
//     abort the session, because different clones reject different
//     optional commands.

import type { Transport } from "../transport/types";
import { TransportError } from "../transport/types";
import {
  splitElmResponse,
  parseJ1850Frame,
  toHexString,
  type KwpFrame,
} from "./frames";
import { KwpNegativeError } from "./nrc";
import { assertSidSafe } from "./safety";

export interface ElmTrace {
  readonly ts: number;
  readonly direction: "tx" | "rx" | "info";
  readonly payload: string;
  readonly note?: string;
}

export interface ElmInitReport {
  readonly firmwareId: string | null;
  readonly deviceId: string | null;
  readonly protocol: string | null;
  readonly degradedSteps: readonly string[];
  readonly acceptedSteps: readonly string[];
}

export interface InitOptions {
  /** ms to wait for each AT command */
  readonly commandTimeoutMs?: number;
  /** J1850 VPW target header */
  readonly targetHeader?: string;
}

const DEFAULT_TARGET_HEADER = "6C 10 F1";
const DEFAULT_TIMEOUT = 2000;
const PROMPT = 0x3e; // '>'

export class ElmDriver {
  private buffer = "";
  private pending: ((raw: string) => void) | null = null;
  private pendingTimer: NodeJS.Timeout | null = null;
  private pendingTimeoutRejector: ((err: Error) => void) | null = null;
  private unsub: (() => void) | null = null;
  private inflight = false;
  readonly trace: ElmTrace[] = [];

  constructor(readonly transport: Transport) {}

  private log(direction: ElmTrace["direction"], payload: string, note?: string) {
    this.trace.push({ ts: Date.now(), direction, payload, note });
  }

  async attach(): Promise<void> {
    if (!this.transport.isOpen()) await this.transport.open();
    this.unsub = this.transport.onData((chunk) => this.handleChunk(chunk));
  }

  async detach(): Promise<void> {
    if (this.unsub) {
      this.unsub();
      this.unsub = null;
    }
  }

  private handleChunk(chunk: Uint8Array): void {
    let text = "";
    for (let i = 0; i < chunk.length; i++) {
      text += String.fromCharCode(chunk[i]!);
    }
    this.buffer += text;
    if (chunk.includes(PROMPT)) {
      const idx = this.buffer.indexOf(">");
      if (idx >= 0) {
        const block = this.buffer.slice(0, idx + 1);
        this.buffer = this.buffer.slice(idx + 1);
        const cb = this.pending;
        this.pending = null;
        if (this.pendingTimer) {
          clearTimeout(this.pendingTimer);
          this.pendingTimer = null;
        }
        this.pendingTimeoutRejector = null;
        this.inflight = false;
        if (cb) cb(block);
      }
    }
  }

  /** Send an ELM command line (no CR needed — we add it). Returns raw response (text up to and including the prompt). */
  async command(cmd: string, timeoutMs = DEFAULT_TIMEOUT): Promise<string> {
    if (this.inflight) {
      throw new Error(
        "ELM driver: a command is already in flight. The driver serializes requests.",
      );
    }
    this.inflight = true;
    const bytes = new TextEncoder().encode(cmd + "\r");
    this.log("tx", cmd);
    await this.transport.write(bytes);
    return new Promise<string>((resolve, reject) => {
      this.pending = (raw) => {
        const stripped = stripEcho(raw, cmd);
        this.log("rx", stripped.trim());
        resolve(stripped);
      };
      this.pendingTimeoutRejector = reject;
      this.pendingTimer = setTimeout(() => {
        this.pending = null;
        this.pendingTimer = null;
        this.pendingTimeoutRejector = null;
        this.inflight = false;
        reject(
          new TransportError(
            `ELM command "${cmd}" timed out after ${timeoutMs}ms`,
            "The adapter did not emit a '>' prompt in time. This usually means one of: (1) the baud rate is wrong and the adapter is echoing garbage, (2) the adapter didn't power up, (3) the USB cable is data-less (charge-only cables are a frequent culprit), or (4) the command itself caused the adapter to hang (rare).",
            'Try a different baud rate (the driver tries 115200, 38400, 9600, 57600, 230400 in order). If all fail, replace the USB cable with a known-good data cable and try again.',
          ),
        );
      }, timeoutMs);
    });
  }

  /**
   * Run the full init sequence, including baud auto-detection if possible.
   * The transport must already be open. Returns an init report describing
   * what worked, what was degraded, and what the adapter claims to be.
   */
  async init(opts: InitOptions = {}): Promise<ElmInitReport> {
    const targetHeader = opts.targetHeader ?? DEFAULT_TARGET_HEADER;
    const timeout = opts.commandTimeoutMs ?? DEFAULT_TIMEOUT;
    const accepted: string[] = [];
    const degraded: string[] = [];

    // ATZ — full reset. Mandatory; if this fails, nothing else matters.
    let atzResponse = "";
    try {
      atzResponse = await this.command("ATZ", timeout * 2);
    } catch (err) {
      throw new TransportError(
        "ELM327 adapter did not respond to ATZ reset",
        "The adapter should reply with its firmware banner within a couple of seconds of receiving ATZ. Silence means the serial link exists but the adapter isn't alive — either it's at the wrong baud rate, it's not actually an ELM327-compatible device, or it's a fake that booted into a weird state.",
        "1) Unplug the adapter, wait 5 seconds, plug back in, retry. 2) Try a different baud rate manually. 3) Verify the adapter works with a known-good app like OBDLink or Torque to rule out hardware failure.",
        err,
      );
    }
    if (!/ELM/i.test(atzResponse)) {
      throw new TransportError(
        "Device responded to ATZ but does not identify as an ELM327",
        `The ATZ response was: ${JSON.stringify(atzResponse.trim())}. ELM327-compatible adapters always include "ELM" in their banner.`,
        "This is probably a non-OBD serial device (a GPS receiver, a USB-to-TTL cable attached to nothing, etc.). Pick a different port.",
      );
    }
    accepted.push("ATZ");
    const firmwareId = extractBanner(atzResponse);

    // Optional identity probes — if these fail we continue.
    const deviceId = await this.softCommand("AT@1", timeout).catch(() => null);

    // Mandatory setup. Most clones accept all of these.
    const mustSteps: [string, string][] = [
      ["ATE0", "echo off"],
      ["ATL0", "linefeeds off"],
      ["ATH1", "headers on"],
    ];
    for (const [cmd, label] of mustSteps) {
      const r = await this.command(cmd, timeout);
      if (isOk(r)) accepted.push(cmd);
      else
        throw new TransportError(
          `Adapter rejected mandatory command ${cmd} (${label})`,
          `Response: ${JSON.stringify(r.trim())}. This command is standard across ELM327 v1.0+ — if your adapter rejects it, it's either a non-ELM device pretending, or it's crashed.`,
          "Unplug/replug the adapter and retry. If it still fails, this adapter is not compatible.",
        );
    }

    // Optional / tolerated failures — log degradation but don't abort.
    const optionalSteps: [string, string][] = [
      ["ATAL", "allow long messages"],
      ["ATST FF", "max response timeout"],
      [`ATSH ${targetHeader}`, "set transmit header"],
    ];
    for (const [cmd, label] of optionalSteps) {
      try {
        const r = await this.command(cmd, timeout);
        if (isOk(r)) accepted.push(cmd);
        else {
          degraded.push(`${cmd} (${label}): ${r.trim() || "rejected"}`);
          this.log("info", `${cmd} degraded`, label);
        }
      } catch (err) {
        degraded.push(`${cmd} (${label}): ${String(err)}`);
      }
    }

    // Protocol selection — J1850 VPW. This is where non-VPW chipsets fail.
    const spResponse = await this.command("ATSP 2", timeout);
    if (!isOk(spResponse)) {
      throw new TransportError(
        "Adapter rejected ATSP 2 (J1850 VPW)",
        `Response: ${JSON.stringify(spResponse.trim())}. This tool only works on vehicles with a J1850 VPW bus (GM/Isuzu 2002-2004 era). If your adapter refused ATSP 2, its chipset does not support VPW even though it may claim to be an ELM327. Many ultra-cheap clones ship with a CAN-only STN chip.`,
        "Use a different adapter that supports J1850 VPW. OBDLink SX and Vgate iCar Pro are known-good. If you're sure the adapter supports VPW, your vehicle may use a different bus (ISO 15765 CAN) and this tool is not applicable to it.",
      );
    }
    accepted.push("ATSP 2");

    const protocolResponse = await this.command("ATDP", timeout).catch(
      () => "",
    );
    const protocol = extractBanner(protocolResponse) || null;

    return {
      firmwareId,
      deviceId,
      protocol,
      degradedSteps: degraded,
      acceptedSteps: accepted,
    };
  }

  /** Send an AT command; return its first-line response or null if it errored. */
  private async softCommand(cmd: string, timeout: number): Promise<string | null> {
    try {
      const r = await this.command(cmd, timeout);
      const trimmed = r.trim();
      if (!trimmed || /\?/.test(trimmed)) return null;
      return extractBanner(r);
    } catch {
      return null;
    }
  }

  /**
   * Send a KWP2000 request (bytes after ATSH header, e.g. [0x27, 0x01]) and
   * parse the response frames. Throws KwpNegativeError on NRC. Returns an
   * array of frames for services that produce multi-frame responses.
   */
  async sendKwp(requestBytes: number[], timeoutMs = DEFAULT_TIMEOUT): Promise<KwpFrame[]> {
    // Hard safety rail: refuse to transmit any destructive service ID.
    // Defense-in-depth — the higher layers never construct these, but a
    // future bug/refactor could. This catches it at the wire boundary.
    assertSidSafe(requestBytes);
    const hex = toHexString(requestBytes).replace(/ /g, "");
    const raw = await this.command(hex, timeoutMs);
    const { lines, statuses } = splitElmResponse(raw);
    for (const s of statuses) {
      if (/NO DATA|UNABLE TO CONNECT|BUS INIT|BUS ERROR|CAN ERROR|STOPPED|ERROR/i.test(s)) {
        throw new TransportError(
          `ELM reported "${s}" while sending SID 0x${requestBytes[0]!.toString(16).toUpperCase()}`,
          interpretStatus(s),
          suggestForStatus(s),
        );
      }
    }
    const frames: KwpFrame[] = [];
    for (const line of lines) {
      const f = parseJ1850Frame(line);
      if (f) frames.push(f);
    }
    if (frames.length === 0) {
      throw new TransportError(
        `No frames received for SID 0x${requestBytes[0]!.toString(16).toUpperCase()}`,
        `The ELM returned: ${JSON.stringify(raw.trim())}. Either the ECU is silent or the adapter filtered the response.`,
        "Verify the key is in the RUN position. If the ECU just never answers, check that you're talking to the PCM and not the TCM (they share the bus and have different addresses on some vehicles).",
      );
    }
    // Check for negative response frame.
    //
    // Standard KWP2000 negative response is [SID, NRC] — 2 data bytes.
    // Some GM/Delphi PCM32U variants (observed on Isuzu Axiom 3.5L) return
    // an extended format that echoes the rejected request's parameters
    // between the SID and the NRC: [SID, ...echoedParams, NRC]. In both
    // layouts the NRC is the final byte of the data payload.
    for (const f of frames) {
      if (f.sid === 0x7f) {
        const requestedSid = f.data[0] ?? 0;
        const nrc = f.data.length >= 2 ? f.data[f.data.length - 1]! : 0;
        throw new KwpNegativeError(requestedSid, nrc);
      }
    }
    return frames;
  }
}

function stripEcho(raw: string, cmd: string): string {
  // Some adapters echo even with ATE0 on the first command after reset.
  const lines = raw.split(/[\r\n]+/);
  if (lines[0]?.trim().toUpperCase() === cmd.toUpperCase()) {
    return lines.slice(1).join("\r");
  }
  return raw;
}

function isOk(raw: string): boolean {
  return /OK/i.test(raw) || /^\s*$/.test(raw.replace(/[>\r\n]/g, ""));
}

function extractBanner(raw: string): string {
  return raw
    .replace(/[>\r]/g, "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0) ?? "";
}

function interpretStatus(s: string): string {
  if (/NO DATA/i.test(s))
    return "The ELM sent the request but no ECU answered within the adapter's wait window. The bus is alive (otherwise we'd see BUS INIT errors), but no module at the target address replied. Usually means: key not in RUN, wrong target address, or engine is running and the ECU is busy with other work.";
  if (/UNABLE TO CONNECT/i.test(s))
    return "The ELM tried to establish a session on the selected protocol and got nothing back. On J1850 VPW this almost always means the adapter cannot see the bus — either the adapter's VPW chip is dead or the OBD connector is not seated properly.";
  if (/BUS (INIT|ERROR)/i.test(s))
    return "The adapter detected electrical problems on the OBD-II bus itself. Either the adapter isn't properly grounded to the vehicle, or there's a real fault with the bus wiring.";
  if (/CAN ERROR/i.test(s))
    return "The ELM detected CAN bus activity where it expected J1850 VPW. Your vehicle probably has a CAN bus (2008+ GM, most non-US vehicles). This tool only works on J1850 VPW vehicles.";
  return `The ELM reported status: ${s}`;
}

function suggestForStatus(s: string): string {
  if (/NO DATA/i.test(s))
    return "Turn the key to RUN but do NOT start the engine. Ensure the adapter is firmly seated in the OBD-II port. Retry.";
  if (/UNABLE TO CONNECT/i.test(s))
    return "Try a different adapter. If you have two, swap and compare. Check the adapter's LEDs if it has any — power LED should be on when the key is in RUN.";
  if (/BUS/i.test(s))
    return "Unplug the adapter, wait 10 seconds, plug it back in with the key ON. If that doesn't help, the adapter may be failing.";
  if (/CAN ERROR/i.test(s))
    return "This tool does not support CAN-based vehicles. If you're sure your vehicle is J1850 VPW, the adapter may be auto-detecting incorrectly — try a different adapter.";
  return "Include this error verbatim in the report and send it to the project owner.";
}
