import type { Transport } from "./types";

/**
 * Paired in-memory transport. Two endpoints; whatever one writes shows up
 * on the other's onData listeners. Used in tests to wire the driver
 * against a PCM32U mock without touching a real adapter.
 */
export function createMockPair(
  labelA = "mock.driver",
  labelB = "mock.ecu",
): [Transport, Transport] {
  const a = new MockEndpoint(labelA);
  const b = new MockEndpoint(labelB);
  a._peer = b;
  b._peer = a;
  return [a, b];
}

class MockEndpoint implements Transport {
  readonly kind = "mock" as const;
  _peer?: MockEndpoint;
  private listeners = new Set<(b: Uint8Array) => void>();
  private open_ = false;

  constructor(readonly label: string) {}

  async open(): Promise<void> {
    this.open_ = true;
  }
  async close(): Promise<void> {
    this.open_ = false;
    this.listeners.clear();
  }
  isOpen(): boolean {
    return this.open_;
  }
  async write(bytes: Uint8Array): Promise<void> {
    if (!this.open_) throw new Error(`mock transport ${this.label} not open`);
    const peer = this._peer;
    if (!peer || !peer.open_) return;
    // queueMicrotask to preserve async semantics the driver expects
    queueMicrotask(() => {
      for (const l of peer.listeners) l(bytes);
    });
  }
  onData(listener: (bytes: Uint8Array) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
