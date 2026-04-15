// Seed-key transform for the PCM32U ECU, ported from DllSecurity.dll
// (TIS2000 v95) via pcm32u_tuner_v3.jsx. 11 recognized op bytes; every
// other byte is a silent no-op. Algo 0 short-circuits to ~seed. Two tables
// (primary/secondary); this ECU family uses table 1 exclusively.
//
// Live-verified on DNYY 2026-04-09: seed 0x32E0 / algo 0x31 / table 1 -> 0x7C73.

import { ALGO_TABLES, type AlgoRound } from "./tables";
export { ALGO_TABLES, T1_HEX_RAW, T2_HEX_RAW, algoTableToBytes } from "./tables";

export interface SeedKeyOptions {
  algo: number;
  table: 1 | 2;
}

export interface TraceStep {
  round: number | "init";
  op: string;
  value: number;
}

type OpHandler = (seed: number, p0: number, p1: number) => number;
interface OpInfo {
  readonly name: string;
  readonly fn: OpHandler;
}

const mask16 = (v: number): number => v & 0xffff;

export const OP_TYPES: Readonly<Record<number, OpInfo>> = {
  0x05: {
    name: "BYTE_SWAP",
    fn: (s) => mask16(((s & 0xff) << 8) | (s >>> 8)),
  },
  0x14: {
    name: "ADD",
    fn: (s, a, b) => mask16(s + ((a << 8) | b)),
  },
  0x2a: {
    name: "NOT/NEG",
    fn: (s, a, b) => {
      let v = mask16(~s);
      if (a < b) v = mask16(v + 1);
      return v;
    },
  },
  0x37: {
    name: "AND",
    fn: (s, a, b) => s & ((a << 8) | b),
  },
  0x4c: {
    name: "ROT_LEFT",
    fn: (s, a) => {
      let v = s;
      for (let i = 0; i < a; i++) {
        const msb = (v >>> 15) & 1;
        v = mask16((v << 1) | msb);
      }
      return v;
    },
  },
  0x52: {
    name: "OR",
    fn: (s, a, b) => s | ((a << 8) | b),
  },
  0x6b: {
    name: "ROT_RIGHT",
    fn: (s, _a, b) => {
      let v = s;
      for (let i = 0; i < b; i++) {
        const lsb = v & 1;
        v = (v >>> 1) | (lsb ? 0x8000 : 0);
      }
      return v;
    },
  },
  0x75: {
    name: "SWAP_ADD",
    fn: (s, a, b) => mask16(s + ((b << 8) | a)),
  },
  0x7e: {
    name: "BSWAP_ADD",
    fn: (s, a, b) => {
      const sw = mask16(((s & 0xff) << 8) | (s >>> 8));
      const hi = Math.max(a, b);
      const lo = Math.min(a, b);
      return mask16(sw + ((hi << 8) | lo));
    },
  },
  0x98: {
    name: "SUBTRACT",
    fn: (s, a, b) => mask16(s - ((a << 8) | b)),
  },
  0xf8: {
    name: "SWAP_SUB",
    fn: (s, a, b) => mask16(s - ((b << 8) | a)),
  },
};

function hex2(v: number): string {
  return v.toString(16).toUpperCase().padStart(2, "0");
}

function validateTable(n: number): 1 | 2 {
  if (n !== 1 && n !== 2) {
    throw new Error(`seed-key: table must be 1 or 2, got ${n}`);
  }
  return n;
}

function validateAlgo(a: number): number {
  if (!Number.isInteger(a) || a < 0 || a > 0xff) {
    throw new Error(`seed-key: algo must be 0-255, got ${a}`);
  }
  return a;
}

export function computeKey(seed: number, opts: SeedKeyOptions): number {
  return computeKeyWithTrace(seed, opts).key;
}

export function computeKeyWithTrace(
  seed: number,
  opts: SeedKeyOptions,
): { key: number; trace: TraceStep[] } {
  const t = validateTable(opts.table);
  const algo = validateAlgo(opts.algo);
  const s0 = mask16(seed);
  const trace: TraceStep[] = [{ round: "init", op: "—", value: s0 }];

  if (algo === 0) {
    const key = mask16(~s0);
    trace.push({ round: 0, op: "algo 0 → ~seed", value: key });
    return { key, trace };
  }

  const entry = ALGO_TABLES[t][algo];
  if (!entry) {
    throw new Error(`seed-key: table ${t} missing algo 0x${hex2(algo)}`);
  }
  let v = s0;
  entry.forEach((round: AlgoRound, i: number) => {
    const [type, p0, p1] = round;
    const op = OP_TYPES[type];
    if (!op) {
      trace.push({ round: i, op: `NOP (0x${hex2(type)})`, value: v });
      return;
    }
    v = op.fn(v, p0, p1);
    trace.push({
      round: i,
      op: `${op.name}(0x${hex2(p0)},0x${hex2(p1)})`,
      value: v,
    });
  });
  return { key: v, trace };
}

export function identifyAlgo(
  seed: number,
  expectedKey: number,
): Array<{ table: 1 | 2; algo: number }> {
  const want = mask16(expectedKey);
  const matches: Array<{ table: 1 | 2; algo: number }> = [];
  for (const t of [1, 2] as const) {
    for (let a = 0; a <= 0xff; a++) {
      if (computeKey(seed, { algo: a, table: t }) === want) {
        matches.push({ table: t, algo: a });
      }
    }
  }
  return matches;
}
