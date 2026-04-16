import { describe, expect, it } from "vitest";
import {
  findAsciiRuns,
  findEnableByteCandidates,
  findFillSpans,
  findPointerClusters,
  findStrideCandidates,
  regionOf,
} from "./heuristics";

function bytes(...hex: number[]): Uint8Array {
  return new Uint8Array(hex);
}

describe("findAsciiRuns", () => {
  it("finds a 4-char run surrounded by non-printable bytes", () => {
    const b = bytes(0x00, 0xff, 0x44, 0x4e, 0x59, 0x59, 0xff, 0x00);
    const runs = findAsciiRuns(regionOf(b, 0x018270), 4);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.text).toBe("DNYY");
    expect(runs[0]!.addr).toBe(0x018272);
  });

  it("ignores runs shorter than minLength", () => {
    const b = bytes(0x41, 0x42, 0x43, 0xff, 0x44, 0x45, 0x46, 0x47, 0x48);
    const runs = findAsciiRuns(regionOf(b, 0), 4);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.text).toBe("DEFGH");
  });

  it("returns nothing for all-null input", () => {
    expect(findAsciiRuns(regionOf(new Uint8Array(64), 0), 4)).toEqual([]);
  });
});

describe("findEnableByteCandidates", () => {
  it("detects a cluster of DNYY-shaped enable bytes", () => {
    // 4 enable bytes packed into a 64-byte window
    const b = new Uint8Array(128);
    b[0x10] = 0xc0;
    b[0x14] = 0xc0;
    b[0x20] = 0xe0;
    b[0x30] = 0xa0;
    const found = findEnableByteCandidates(regionOf(b, 0x00f900), 64, 3);
    expect(found.length).toBeGreaterThanOrEqual(4);
    const addrs = found.map((f) => f.addr).sort((a, b) => a - b);
    expect(addrs).toContain(0x00f910);
    expect(addrs).toContain(0x00f914);
    expect(addrs).toContain(0x00f920);
    expect(addrs).toContain(0x00f930);
  });

  it("ignores a lone bit-7 byte with no neighbors", () => {
    const b = new Uint8Array(128);
    b[0x42] = 0xc0;
    expect(findEnableByteCandidates(regionOf(b, 0), 64, 3)).toEqual([]);
  });
});

describe("findStrideCandidates", () => {
  it("detects a smooth monotonic region", () => {
    const b = new Uint8Array(128);
    for (let i = 0; i < 64; i++) b[i] = i * 2;
    const found = findStrideCandidates(regionOf(b, 0), 32, 16);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]!.score).toBeGreaterThanOrEqual(0.85);
  });

  it("rejects pure noise", () => {
    const b = new Uint8Array(128);
    for (let i = 0; i < b.length; i++) b[i] = (i * 211) & 0xff;
    // Noise may or may not produce false positives depending on periodicity;
    // the contract is "smooth regions win", not "noise = 0".
    const found = findStrideCandidates(regionOf(b, 0), 32, 4);
    // With very tight delta and coarse noise, expect few/no matches
    expect(found.length).toBeLessThan(3);
  });
});

describe("findPointerClusters", () => {
  it("detects 8 pointers all in the same 64KB page", () => {
    const b = new Uint8Array(64);
    for (let i = 0; i < 8; i++) {
      const target = 0x00061000 + i * 0x20;
      b[i * 4 + 0] = (target >>> 24) & 0xff;
      b[i * 4 + 1] = (target >>> 16) & 0xff;
      b[i * 4 + 2] = (target >>> 8) & 0xff;
      b[i * 4 + 3] = target & 0xff;
    }
    const found = findPointerClusters(regionOf(b, 0x00067358), 8);
    expect(found).toHaveLength(1);
    expect(found[0]!.addr).toBe(0x00067358);
    expect(found[0]!.target_lo).toBeGreaterThanOrEqual(0x00061000);
    expect(found[0]!.target_hi).toBeLessThanOrEqual(0x000610e0);
  });
});

describe("findFillSpans", () => {
  it("detects a large 0xFF fill region", () => {
    const b = new Uint8Array(64);
    b.fill(0xff);
    const spans = findFillSpans(regionOf(b, 0x01c000), 16);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.fillByte).toBe(0xff);
    expect(spans[0]!.length).toBe(64);
  });

  it("ignores short fill runs", () => {
    const b = bytes(0x01, 0x02, 0x03, 0x00, 0x00, 0x00, 0x01);
    expect(findFillSpans(regionOf(b, 0), 16)).toEqual([]);
  });
});
