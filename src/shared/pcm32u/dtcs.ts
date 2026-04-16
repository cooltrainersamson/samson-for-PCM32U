// DTC enable-byte catalogue for DNYY. Ported verbatim from
// pcm32u_tuner_v3.jsx. Each entry is a single byte in flash SA3 whose
// top two bits gate the DTC:
//   bit 7 = "report this DTC when faulted"
//   bit 6 = "illuminate MIL when faulted"
//
// Observed states:
//   0xE0 = 0b111xxxxx → DTC enabled + MIL + sticky
//   0xC0 = 0b110xxxxx → DTC enabled + MIL, not sticky
//   0xA0 = 0b101xxxxx → DTC enabled, MIL-only variant
//   0x00..0x7F       → DTC disabled (bit 7 clear)
//
// The DTC region is NOT a contiguous table — entries are scattered over
// 0x00F900..0x00FD00 with gaps (the scanner finds clusters; it does not
// assume tight packing).

export interface DtcEntry {
  readonly addr: number;
  readonly code: string;
  readonly desc: string;
  readonly defaultByte: number;
  readonly category: string;
}

export const DTC_ENABLE_BIT = 0x80;
export const DTC_MIL_BIT = 0x40;

export const DTC_SCAN_RANGE = {
  start: 0x00f900,
  end: 0x00fd00,
} as const;

export const DESCRIPTOR_TABLE_ADDR = 0x00067358;
export const DESCRIPTOR_TABLE_LENGTH = 256;

export const DTC_DB: readonly DtcEntry[] = [
  { addr: 0x00f97c, code: "P0724", desc: "TRS Circuit",                 defaultByte: 0xc0, category: "PRNDL" },
  { addr: 0x00f980, code: "P0719", desc: "TCC Brake Switch",            defaultByte: 0xc0, category: "TCC" },
  { addr: 0x00fad4, code: "P0730", desc: "Incorrect Gear Ratio",        defaultByte: 0xe0, category: "Shift" },
  { addr: 0x00fc20, code: "P0748", desc: "Pressure Ctrl Sol Electrical", defaultByte: 0xe0, category: "Solenoid" },
  { addr: 0x00fc28, code: "P0705", desc: "TR Sensor Circuit",           defaultByte: 0xc0, category: "PRNDL" },
  { addr: 0x00fc2c, code: "P0706", desc: "TR Sensor Range",             defaultByte: 0xc0, category: "PRNDL" },
  { addr: 0x00fc34, code: "P0753", desc: "Shift Sol A Electrical",      defaultByte: 0xa0, category: "Solenoid" },
  { addr: 0x00fc40, code: "P0751", desc: "Shift Sol A Performance",     defaultByte: 0xa0, category: "Solenoid" },
  { addr: 0x00fc44, code: "P0752", desc: "Shift Sol A Stuck ON",        defaultByte: 0xa0, category: "Solenoid" },
  { addr: 0x00fc48, code: "P0758", desc: "Shift Sol B Electrical",      defaultByte: 0xa0, category: "Solenoid" },
  { addr: 0x00fc54, code: "P0756", desc: "Shift Sol B Performance",     defaultByte: 0xa0, category: "Solenoid" },
  { addr: 0x00fc58, code: "P0757", desc: "Shift Sol B Stuck ON",        defaultByte: 0xa0, category: "Solenoid" },
  { addr: 0x00fc74, code: "P0742", desc: "TCC Stuck ON",                defaultByte: 0xa0, category: "TCC" },
  { addr: 0x00fc84, code: "P0711", desc: "TFT Sensor Circuit",          defaultByte: 0xc0, category: "Temp" },
  { addr: 0x00fc88, code: "P0713", desc: "TFT High",                    defaultByte: 0xc0, category: "Temp" },
  { addr: 0x00fc8c, code: "P0712", desc: "TFT Low",                     defaultByte: 0xc0, category: "Temp" },
  { addr: 0x00fc98, code: "P0723", desc: "OSS Intermittent",            defaultByte: 0xa0, category: "Speed" },
  { addr: 0x00fc9c, code: "P0722", desc: "OSS No Signal",               defaultByte: 0xa0, category: "Speed" },
];

export function isDtcEnabled(byte: number): boolean {
  return (byte & DTC_ENABLE_BIT) !== 0;
}
