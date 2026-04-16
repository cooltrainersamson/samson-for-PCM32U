import type { Transport, PortInfo } from "./types";
import { TransportError } from "./types";

// serialport is a native module with prebuilds. We import lazily so unit
// tests (which use MockTransport only) don't touch native code.
type SerialPortModule = typeof import("serialport");

let cached: SerialPortModule | undefined;
async function load(): Promise<SerialPortModule> {
  if (cached) return cached;
  try {
    cached = await import("serialport");
    return cached;
  } catch (err) {
    throw new TransportError(
      "Failed to load the serialport native module",
      "The tool ships with prebuilt binaries for common platforms, but the loader couldn't find one for yours. This usually means the install step was interrupted or the module was pruned.",
      "Try reinstalling: `npm rebuild serialport` (if building from source) or reinstall the app. On Linux, ensure you have libudev-dev available.",
      err,
    );
  }
}

export async function listPorts(): Promise<PortInfo[]> {
  const mod = await load();
  try {
    const ports = await mod.SerialPort.list();
    return ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer,
      vendorId: p.vendorId,
      productId: p.productId,
      serialNumber: p.serialNumber,
      friendlyName: p.friendlyName,
    }));
  } catch (err) {
    throw new TransportError(
      "Could not enumerate serial ports",
      "The OS refused to list serial devices. On Linux this usually means your user is not in the `dialout` group. On macOS it's almost always a driver issue. On Windows it's typically a permissions issue.",
      "Linux: `sudo usermod -a -G dialout $USER` then log out and back in. macOS: unplug and reconnect the adapter; if it's a CH340 clone, install the driver from wch.cn. Windows: run the app as Administrator once, then normally.",
      err,
    );
  }
}

export interface SerialTransportOptions {
  path: string;
  baudRate: number;
}

export class SerialTransport implements Transport {
  readonly kind = "serial" as const;
  readonly label: string;
  private port?: import("serialport").SerialPort;
  private listeners = new Set<(b: Uint8Array) => void>();
  private open_ = false;

  constructor(private readonly opts: SerialTransportOptions) {
    this.label = `${opts.path}@${opts.baudRate}`;
  }

  isOpen(): boolean {
    return this.open_;
  }

  async open(): Promise<void> {
    const mod = await load();
    await new Promise<void>((resolve, reject) => {
      try {
        this.port = new mod.SerialPort({
          path: this.opts.path,
          baudRate: this.opts.baudRate,
          autoOpen: false,
        });
        this.port.on("data", (chunk: Buffer) => {
          const bytes = new Uint8Array(
            chunk.buffer,
            chunk.byteOffset,
            chunk.byteLength,
          );
          for (const l of this.listeners) l(bytes);
        });
        this.port.on("error", (_err: Error) => {
          // swallowed here; per-call errors surface via write/close rejections
        });
        this.port.open((err?: Error | null) => {
          if (err) return reject(this.translateOpenError(err));
          this.open_ = true;
          resolve();
        });
      } catch (err) {
        reject(
          new TransportError(
            `Failed to construct serial port ${this.opts.path}`,
            "The serialport binding rejected the path or baud rate before opening.",
            "Double-check the port path (e.g. /dev/cu.usbserial-XXXX on macOS, COM3 on Windows) and that the baud rate is a standard value (115200 is the default for OBDLink SX).",
            err,
          ),
        );
      }
    });
  }

  private translateOpenError(err: Error): TransportError {
    const msg = String(err?.message ?? err);
    if (/access denied|permission/i.test(msg)) {
      return new TransportError(
        `Permission denied opening ${this.opts.path}`,
        "The OS refused to open the serial device because your user account doesn't have read/write access to it. On Linux this is usually the `dialout` group. On macOS it's rare but can happen if another process grabbed exclusive access.",
        "Linux: `sudo usermod -a -G dialout $USER` and reboot. macOS: close any other OBD apps (Torque, OBDLink, ForScan) and try again. Windows: run this app as Administrator.",
        err,
      );
    }
    if (/in use|busy|locked/i.test(msg)) {
      return new TransportError(
        `${this.opts.path} is already in use`,
        "Another process has the serial port open. Only one program can talk to an ELM327 adapter at a time.",
        "Close any other OBD-II apps (Torque, OBDLink, ForScan, Arduino IDE, terminal emulators) and retry.",
        err,
      );
    }
    if (/no such file|cannot find|ENOENT/i.test(msg)) {
      return new TransportError(
        `Serial port ${this.opts.path} not found`,
        "The OS reports no device at that path. The adapter was probably unplugged, or the path changed since the port was enumerated (some adapters get a new /dev/cu.* name every reconnect).",
        "Unplug and replug the adapter, then click Refresh in the Connect tab to re-enumerate.",
        err,
      );
    }
    return new TransportError(
      `Failed to open ${this.opts.path}`,
      `The serialport binding reported: ${msg}`,
      "Check that the adapter is plugged in, powered (key in ON position), and that no other OBD app has it open.",
      err,
    );
  }

  async close(): Promise<void> {
    const p = this.port;
    if (!p || !this.open_) return;
    await new Promise<void>((resolve) => {
      p.close(() => {
        this.open_ = false;
        resolve();
      });
    });
    this.listeners.clear();
    this.port = undefined;
  }

  async write(bytes: Uint8Array): Promise<void> {
    const p = this.port;
    if (!p || !this.open_) {
      throw new TransportError(
        "Cannot write to a closed serial port",
        "The driver tried to send data before the port was open, or after it was closed.",
        "This is a bug in the app — please report it with the steps that caused it.",
      );
    }
    await new Promise<void>((resolve, reject) => {
      p.write(Buffer.from(bytes), (err?: Error | null) => {
        if (err)
          return reject(
            new TransportError(
              `Serial write failed on ${this.opts.path}`,
              "The OS kernel rejected the outbound bytes. This usually means the adapter was unplugged mid-session.",
              "Check the adapter cable, then click Connect again.",
              err,
            ),
          );
        p.drain(() => resolve());
      });
    });
  }

  onData(listener: (bytes: Uint8Array) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
