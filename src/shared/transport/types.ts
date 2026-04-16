// A Transport is a minimal byte-stream abstraction the ELM327 driver uses
// to talk to either a real serial port or an in-memory mock. Everything
// above this layer is hardware-agnostic — the same driver runs in tests
// and on real hardware.

export interface Transport {
  readonly kind: "serial" | "mock";
  readonly label: string;
  open(): Promise<void>;
  close(): Promise<void>;
  write(bytes: Uint8Array): Promise<void>;
  /**
   * Register a listener for incoming bytes. Returns an unsubscribe fn.
   * May deliver partial chunks; the driver reassembles into lines.
   */
  onData(listener: (bytes: Uint8Array) => void): () => void;
  isOpen(): boolean;
}

export interface PortInfo {
  path: string;
  manufacturer?: string;
  vendorId?: string;
  productId?: string;
  serialNumber?: string;
  friendlyName?: string;
}

export class TransportError extends Error {
  constructor(
    message: string,
    readonly why: string,
    readonly fix?: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "TransportError";
  }
}
