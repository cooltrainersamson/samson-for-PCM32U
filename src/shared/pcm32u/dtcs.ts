// DTC enable-byte catalogue. Originally seeded from DNYY (pcm32u_tuner_v3.jsx);
// extended 2026-04-18 from a live DRDX (Axiom 3.5L AT) flash dump after
// confirming the table layout is consistent across PCM32U variants.
//
// Each slot in flash SA3 is 4 bytes:
//   <enable> 0x00 <BCD-hi> <BCD-lo>     →  P<bcd-hi><bcd-lo>
//
// Enable byte semantics (bits 7..5 are the action gate; lower bits are
// rare and mostly look like flags for debounce/severity variants):
//   0xE0 = 0b1110_xxxx → enabled + MIL + sticky/freeze
//   0xC0 = 0b1100_xxxx → enabled + MIL, not sticky
//   0xA0 = 0b1010_xxxx → enabled, no MIL (informational/freeze-frame only)
//   0x60 = 0b0110_xxxx → MIL+bit5 staged but master-enable cleared. On
//          the DRDX calibration this byte appears on canonical OBD-II
//          emissions monitors only (catalyst, EVAP, injector circuits,
//          ignition coils, knock) — i.e. monitors the calibration
//          deliberately suppresses without dropping the slot.
//   0x00 = disabled (slot known to firmware, value never set/checked)
//
// The DTC region is NOT a contiguous table — entries are scattered over
// 0x00F900..0x00FD00 with gaps for calibration constants. The scanner
// finds clusters; it does not assume tight packing.

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

// Entries are sorted by address. Defaults come from a live DRDX dump
// (Axiom 3.5L AT) on 2026-04-18; the original DNYY-derived rows have
// been kept where they overlap. Descriptions follow SAE J2012 for the
// standard P0xxx codes; P1xxx codes use the GM/Isuzu interpretation
// that matches the surrounding cluster (e.g. ECT/IAT P11xx pairs).
export const DTC_DB: readonly DtcEntry[] = [
  { addr: 0x00f96c, code: "P1850", desc: "TCC PWM Solenoid Electrical",                defaultByte: 0xc0, category: "TCC" },
  { addr: 0x00f978, code: "P1574", desc: "EBTCM Class 2 Communication",                defaultByte: 0xc0, category: "Comm" },
  { addr: 0x00f97c, code: "P0724", desc: "TRS Circuit",                                defaultByte: 0xc0, category: "PRNDL" },
  { addr: 0x00f980, code: "P0719", desc: "TCC Brake Switch",                           defaultByte: 0xc0, category: "TCC" },
  { addr: 0x00f984, code: "P0571", desc: "Cruise Brake Switch A",                      defaultByte: 0xc0, category: "Cruise" },
  { addr: 0x00f990, code: "P0444", desc: "EVAP Purge Solenoid Open",                   defaultByte: 0xc0, category: "EVAP" },
  { addr: 0x00f994, code: "P0445", desc: "EVAP Purge Solenoid Shorted",                defaultByte: 0xc0, category: "EVAP" },
  { addr: 0x00f998, code: "P0420", desc: "Catalyst Efficiency Below Threshold B1",     defaultByte: 0x60, category: "Catalyst" },
  { addr: 0x00f99c, code: "P0430", desc: "Catalyst Efficiency Below Threshold B2",     defaultByte: 0x60, category: "Catalyst" },
  { addr: 0x00f9a0, code: "P0606", desc: "PCM Processor Performance (1)",              defaultByte: 0xc0, category: "PCM" },
  { addr: 0x00f9a4, code: "P0602", desc: "PCM Not Programmed",                         defaultByte: 0xc0, category: "PCM" },
  { addr: 0x00f9ac, code: "P0118", desc: "ECT Sensor Circuit High",                    defaultByte: 0xa0, category: "ECT" },
  { addr: 0x00f9b0, code: "P1115", desc: "ECT Sensor Intermittent High",               defaultByte: 0xc0, category: "ECT" },
  { addr: 0x00f9b4, code: "P0117", desc: "ECT Sensor Circuit Low",                     defaultByte: 0xa0, category: "ECT" },
  { addr: 0x00f9b8, code: "P1114", desc: "ECT Sensor Intermittent Low",                defaultByte: 0xc0, category: "ECT" },
  { addr: 0x00f9bc, code: "P0125", desc: "ECT Slow to Reach Closed-Loop",              defaultByte: 0xa0, category: "ECT" },
  { addr: 0x00f9c0, code: "P0336", desc: "CKP Sensor Performance",                     defaultByte: 0xa0, category: "CKP" },
  { addr: 0x00f9c4, code: "P0337", desc: "CKP Sensor Signal Too Low",                  defaultByte: 0xa4, category: "CKP" },
  { addr: 0x00f9cc, code: "P0566", desc: "Cruise 'Off' Switch Stuck",                  defaultByte: 0xc0, category: "Cruise" },
  { addr: 0x00f9d8, code: "P0565", desc: "Cruise 'On' Switch Stuck",                   defaultByte: 0xc0, category: "Cruise" },
  { addr: 0x00f9dc, code: "P0567", desc: "Cruise 'Resume' Switch Stuck",               defaultByte: 0xc0, category: "Cruise" },
  { addr: 0x00f9e0, code: "P0568", desc: "Cruise 'Set' Switch Stuck",                  defaultByte: 0xc0, category: "Cruise" },
  { addr: 0x00f9ec, code: "P0401", desc: "EGR Insufficient Flow",                      defaultByte: 0xa0, category: "EGR" },
  { addr: 0x00f9f0, code: "P1404", desc: "EGR Closed Position Performance",            defaultByte: 0xa0, category: "EGR" },
  { addr: 0x00f9f4, code: "P0402", desc: "EGR Excessive Flow",                         defaultByte: 0xa0, category: "EGR" },
  { addr: 0x00f9f8, code: "P0404", desc: "EGR Range/Performance",                      defaultByte: 0xa0, category: "EGR" },
  { addr: 0x00f9fc, code: "P0406", desc: "EGR Position Sensor High",                   defaultByte: 0xa0, category: "EGR" },
  { addr: 0x00fa00, code: "P0405", desc: "EGR Position Sensor Low",                    defaultByte: 0xa0, category: "EGR" },
  { addr: 0x00fa04, code: "P0351", desc: "Ignition Coil A Primary/Secondary",          defaultByte: 0x60, category: "Ignition" },
  { addr: 0x00fa08, code: "P0352", desc: "Ignition Coil B Primary/Secondary",          defaultByte: 0x60, category: "Ignition" },
  { addr: 0x00fa0c, code: "P0353", desc: "Ignition Coil C Primary/Secondary",          defaultByte: 0x60, category: "Ignition" },
  { addr: 0x00fa10, code: "P0354", desc: "Ignition Coil D Primary/Secondary",          defaultByte: 0x60, category: "Ignition" },
  { addr: 0x00fa14, code: "P0355", desc: "Ignition Coil E Primary/Secondary",          defaultByte: 0x60, category: "Ignition" },
  { addr: 0x00fa18, code: "P0356", desc: "Ignition Coil F Primary/Secondary",          defaultByte: 0x60, category: "Ignition" },
  { addr: 0x00fa24, code: "P1514", desc: "TPS / MAF Mismatch (A)",                     defaultByte: 0x60, category: "TPS" },
  { addr: 0x00fa28, code: "P1271", desc: "Manufacturer A/T Solenoid (P1271)",          defaultByte: 0xc0, category: "Solenoid" },
  { addr: 0x00fa2c, code: "P1273", desc: "Manufacturer A/T Solenoid (P1273)",          defaultByte: 0xc0, category: "Solenoid" },
  { addr: 0x00fa30, code: "P1272", desc: "Manufacturer A/T Solenoid (P1272)",          defaultByte: 0xc0, category: "Solenoid" },
  { addr: 0x00fa34, code: "P1275", desc: "Manufacturer A/T Solenoid (P1275)",          defaultByte: 0xa0, category: "Solenoid" },
  { addr: 0x00fa38, code: "P1280", desc: "Manufacturer A/T Solenoid (P1280)",          defaultByte: 0xa0, category: "Solenoid" },
  { addr: 0x00fa3c, code: "P1285", desc: "Manufacturer A/T Solenoid (P1285)",          defaultByte: 0xa0, category: "Solenoid" },
  { addr: 0x00fa40, code: "P0606", desc: "PCM Processor Performance (2)",              defaultByte: 0xc0, category: "PCM" },
  { addr: 0x00fa44, code: "P1290", desc: "Manufacturer Fueling (P1290)",               defaultByte: 0x60, category: "Fuel" },
  { addr: 0x00fa48, code: "P1299", desc: "Manufacturer Fueling (P1299)",               defaultByte: 0x60, category: "Fuel" },
  { addr: 0x00fa4c, code: "P1125", desc: "Pedal Position System Performance",          defaultByte: 0x60, category: "TPS" },
  { addr: 0x00fa50, code: "P1295", desc: "Manufacturer Fueling (P1295)",               defaultByte: 0x60, category: "Fuel" },
  { addr: 0x00fa54, code: "P1120", desc: "TPS Sensor Range/Performance",               defaultByte: 0xa0, category: "TPS" },
  { addr: 0x00fa58, code: "P1220", desc: "TPS B Circuit",                              defaultByte: 0xa0, category: "TPS" },
  { addr: 0x00fa5c, code: "P1221", desc: "TPS A/B Correlation",                        defaultByte: 0xc0, category: "TPS" },
  { addr: 0x00fa60, code: "P1523", desc: "Throttle Actuator Stuck",                    defaultByte: 0xc0, category: "TPS" },
  { addr: 0x00fa64, code: "P1635", desc: "5V Reference Circuit (1)",                   defaultByte: 0xc0, category: "Power" },
  { addr: 0x00fa68, code: "P1639", desc: "5V Reference Circuit (2)",                   defaultByte: 0xc0, category: "Power" },
  { addr: 0x00fa70, code: "P1515", desc: "TPS / MAF Mismatch (B)",                     defaultByte: 0x60, category: "TPS" },
  { addr: 0x00fa74, code: "P1516", desc: "TPS / MAF Mismatch (C)",                     defaultByte: 0x60, category: "TPS" },
  { addr: 0x00fa78, code: "P0606", desc: "PCM Processor Performance (3)",              defaultByte: 0xc0, category: "PCM" },
  { addr: 0x00fa7c, code: "P1441", desc: "EVAP System Flow During Non-Purge",          defaultByte: 0x60, category: "EVAP" },
  { addr: 0x00fa80, code: "P0440", desc: "EVAP System General Failure",                defaultByte: 0x60, category: "EVAP" },
  { addr: 0x00fa84, code: "P0442", desc: "EVAP Small Leak",                            defaultByte: 0x60, category: "EVAP" },
  { addr: 0x00fa88, code: "P0456", desc: "EVAP Very Small Leak",                       defaultByte: 0x60, category: "EVAP" },
  { addr: 0x00fa8c, code: "P0446", desc: "EVAP Vent Performance",                      defaultByte: 0x60, category: "EVAP" },
  { addr: 0x00fa90, code: "P0604", desc: "PCM RAM Failure",                            defaultByte: 0xc0, category: "PCM" },
  { addr: 0x00fa94, code: "P1636", desc: "5V Reference Circuit (3)",                   defaultByte: 0xc0, category: "Power" },
  { addr: 0x00fa98, code: "P0601", desc: "PCM ROM Failure",                            defaultByte: 0x60, category: "PCM" },
  { addr: 0x00faac, code: "P0461", desc: "Fuel Level Sensor Performance",              defaultByte: 0xa0, category: "Fuel" },
  { addr: 0x00fab0, code: "P0464", desc: "Fuel Level Sensor Intermittent",             defaultByte: 0xc0, category: "Fuel" },
  { addr: 0x00fab4, code: "P0463", desc: "Fuel Level Sensor High",                     defaultByte: 0xa0, category: "Fuel" },
  { addr: 0x00fab8, code: "P0462", desc: "Fuel Level Sensor Low",                      defaultByte: 0xa0, category: "Fuel" },
  { addr: 0x00fabc, code: "P0171", desc: "Fuel Trim Lean B1",                          defaultByte: 0xa0, category: "Fuel" },
  { addr: 0x00fac0, code: "P0172", desc: "Fuel Trim Rich B1",                          defaultByte: 0xa0, category: "Fuel" },
  { addr: 0x00fac4, code: "P0174", desc: "Fuel Trim Lean B2",                          defaultByte: 0xa0, category: "Fuel" },
  { addr: 0x00fac8, code: "P0175", desc: "Fuel Trim Rich B2",                          defaultByte: 0xa0, category: "Fuel" },
  { addr: 0x00fad4, code: "P0730", desc: "Incorrect Gear Ratio",                       defaultByte: 0xe0, category: "Shift" },
  { addr: 0x00fae0, code: "P0113", desc: "IAT Sensor Circuit High",                    defaultByte: 0xa0, category: "IAT" },
  { addr: 0x00fae4, code: "P1111", desc: "IAT Sensor Intermittent High",               defaultByte: 0xc0, category: "IAT" },
  { addr: 0x00fae8, code: "P0112", desc: "IAT Sensor Circuit Low",                     defaultByte: 0xa0, category: "IAT" },
  { addr: 0x00faec, code: "P1112", desc: "IAT Sensor Intermittent Low",                defaultByte: 0xc0, category: "IAT" },
  { addr: 0x00faf0, code: "P0507", desc: "Idle Speed Higher Than Expected",            defaultByte: 0xa0, category: "Idle" },
  { addr: 0x00faf4, code: "P0506", desc: "Idle Speed Lower Than Expected",             defaultByte: 0xa0, category: "Idle" },
  { addr: 0x00fb10, code: "P0201", desc: "Injector Cylinder 1 Circuit",                defaultByte: 0x60, category: "Injector" },
  { addr: 0x00fb14, code: "P0202", desc: "Injector Cylinder 2 Circuit",                defaultByte: 0x60, category: "Injector" },
  { addr: 0x00fb18, code: "P0203", desc: "Injector Cylinder 3 Circuit",                defaultByte: 0x60, category: "Injector" },
  { addr: 0x00fb1c, code: "P0204", desc: "Injector Cylinder 4 Circuit",                defaultByte: 0x60, category: "Injector" },
  { addr: 0x00fb20, code: "P0205", desc: "Injector Cylinder 5 Circuit",                defaultByte: 0x60, category: "Injector" },
  { addr: 0x00fb24, code: "P0206", desc: "Injector Cylinder 6 Circuit",                defaultByte: 0x60, category: "Injector" },
  { addr: 0x00fb30, code: "P1340", desc: "CMP Signal Performance",                     defaultByte: 0xa0, category: "CMP" },
  { addr: 0x00fb34, code: "P1326", desc: "Manufacturer Knock (P1326)",                 defaultByte: 0x60, category: "Knock" },
  { addr: 0x00fb3c, code: "P0325", desc: "Knock Sensor 1 B1 Circuit",                  defaultByte: 0xa0, category: "Knock" },
  { addr: 0x00fb44, code: "P1310", desc: "Misfire Counter Bank 1",                     defaultByte: 0x60, category: "Misfire" },
  { addr: 0x00fb48, code: "P1311", desc: "Misfire Counter Bank 2",                     defaultByte: 0x60, category: "Misfire" },
  { addr: 0x00fb4c, code: "P1312", desc: "Misfire Counter (Aux)",                      defaultByte: 0x60, category: "Misfire" },
  { addr: 0x00fb6c, code: "P0103", desc: "MAF Circuit High",                           defaultByte: 0xa0, category: "MAF" },
  { addr: 0x00fb70, code: "P0102", desc: "MAF Circuit Low",                            defaultByte: 0xa0, category: "MAF" },
  { addr: 0x00fb74, code: "P0101", desc: "MAF Range/Performance",                      defaultByte: 0xa0, category: "MAF" },
  { addr: 0x00fb78, code: "P0108", desc: "MAP Circuit High",                           defaultByte: 0xa0, category: "MAP" },
  { addr: 0x00fb7c, code: "P1106", desc: "MAP Sensor Intermittent High",               defaultByte: 0xc4, category: "MAP" },
  { addr: 0x00fb80, code: "P0107", desc: "MAP Circuit Low",                            defaultByte: 0xa0, category: "MAP" },
  { addr: 0x00fb84, code: "P1107", desc: "MAP Sensor Intermittent Low",                defaultByte: 0xc0, category: "MAP" },
  { addr: 0x00fb88, code: "P0106", desc: "MAP Range/Performance",                      defaultByte: 0xa0, category: "MAP" },
  { addr: 0x00fb94, code: "P0300", desc: "Random/Multiple Cylinder Misfire",           defaultByte: 0xa0, category: "Misfire" },
  { addr: 0x00fba0, code: "P1640", desc: "Output Driver A Fault",                      defaultByte: 0xc0, category: "Power" },
  { addr: 0x00fbb4, code: "P1650", desc: "Output Driver B Fault",                      defaultByte: 0xc0, category: "Power" },
  { addr: 0x00fbb8, code: "P0135", desc: "O2 Sensor Heater B1S1",                      defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fbbc, code: "P1171", desc: "O2 Power Enrichment Lean (B1)",              defaultByte: 0xc0, category: "O2" },
  { addr: 0x00fbc0, code: "P0134", desc: "O2 Sensor No Activity B1S1",                 defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fbc4, code: "P0133", desc: "O2 Sensor Slow Response B1S1",               defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fbc8, code: "P1134", desc: "O2 Sensor Transition B1S1",                  defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fbcc, code: "P1133", desc: "O2 Sensor Insufficient Switching B1S1",      defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fbd0, code: "P1167", desc: "O2 Mixed-Air Fueling B1",                    defaultByte: 0xc0, category: "O2" },
  { addr: 0x00fbd4, code: "P0132", desc: "O2 Sensor High B1S1",                        defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fbd8, code: "P0131", desc: "O2 Sensor Low B1S1",                         defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fbdc, code: "P0141", desc: "O2 Sensor Heater B1S2",                      defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fbe0, code: "P0140", desc: "O2 Sensor No Activity B1S2",                 defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fbe4, code: "P0138", desc: "O2 Sensor High B1S2",                        defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fbe8, code: "P0137", desc: "O2 Sensor Low B1S2",                         defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fbec, code: "P0155", desc: "O2 Sensor Heater B2S1",                      defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fbf0, code: "P1171", desc: "O2 Power Enrichment Lean (B2)",              defaultByte: 0xc0, category: "O2" },
  { addr: 0x00fbf4, code: "P0154", desc: "O2 Sensor No Activity B2S1",                 defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fbf8, code: "P0153", desc: "O2 Sensor Slow Response B2S1",               defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fbfc, code: "P1154", desc: "O2 Sensor Transition B2S1",                  defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fc00, code: "P1153", desc: "O2 Sensor Insufficient Switching B2S1",      defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fc04, code: "P1169", desc: "O2 Mixed-Air Fueling B2",                    defaultByte: 0xc0, category: "O2" },
  { addr: 0x00fc08, code: "P0152", desc: "O2 Sensor High B2S1",                        defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fc0c, code: "P0151", desc: "O2 Sensor Low B2S1",                         defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fc10, code: "P0161", desc: "O2 Sensor Heater B2S2",                      defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fc14, code: "P0160", desc: "O2 Sensor No Activity B2S2",                 defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fc18, code: "P0158", desc: "O2 Sensor High B2S2",                        defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fc1c, code: "P0157", desc: "O2 Sensor Low B2S2",                         defaultByte: 0xa0, category: "O2" },
  { addr: 0x00fc20, code: "P0748", desc: "Pressure Ctrl Sol Electrical",               defaultByte: 0xe0, category: "Solenoid" },
  { addr: 0x00fc28, code: "P0705", desc: "TR Sensor Circuit",                          defaultByte: 0xc0, category: "PRNDL" },
  { addr: 0x00fc2c, code: "P0706", desc: "TR Sensor Range",                            defaultByte: 0xc0, category: "PRNDL" },
  { addr: 0x00fc34, code: "P0753", desc: "Shift Sol A Electrical",                     defaultByte: 0xa0, category: "Solenoid" },
  { addr: 0x00fc40, code: "P0751", desc: "Shift Sol A Performance",                    defaultByte: 0xa0, category: "Solenoid" },
  { addr: 0x00fc44, code: "P0752", desc: "Shift Sol A Stuck ON",                       defaultByte: 0xa0, category: "Solenoid" },
  { addr: 0x00fc48, code: "P0758", desc: "Shift Sol B Electrical",                     defaultByte: 0xa0, category: "Solenoid" },
  { addr: 0x00fc54, code: "P0756", desc: "Shift Sol B Performance",                    defaultByte: 0xa0, category: "Solenoid" },
  { addr: 0x00fc58, code: "P0757", desc: "Shift Sol B Stuck ON",                       defaultByte: 0xa0, category: "Solenoid" },
  { addr: 0x00fc5c, code: "P0563", desc: "System Voltage High",                        defaultByte: 0xa4, category: "Power" },
  { addr: 0x00fc60, code: "P0562", desc: "System Voltage Low",                         defaultByte: 0xc0, category: "Power" },
  { addr: 0x00fc64, code: "P0453", desc: "Fuel Tank Pressure High",                    defaultByte: 0xa0, category: "EVAP" },
  { addr: 0x00fc68, code: "P0452", desc: "Fuel Tank Pressure Low",                     defaultByte: 0xa0, category: "EVAP" },
  { addr: 0x00fc6c, code: "P1860", desc: "TCC PWM Solenoid Electrical (alt)",          defaultByte: 0xa0, category: "TCC" },
  { addr: 0x00fc74, code: "P0742", desc: "TCC Stuck ON",                               defaultByte: 0xa0, category: "TCC" },
  { addr: 0x00fc80, code: "P0218", desc: "Trans Fluid Over-Temperature",               defaultByte: 0xc0, category: "Trans" },
  { addr: 0x00fc84, code: "P0711", desc: "TFT Sensor Circuit",                         defaultByte: 0xc0, category: "Temp" },
  { addr: 0x00fc88, code: "P0713", desc: "TFT High",                                   defaultByte: 0xc0, category: "Temp" },
  { addr: 0x00fc8c, code: "P0712", desc: "TFT Low",                                    defaultByte: 0xc0, category: "Temp" },
  { addr: 0x00fc90, code: "P0128", desc: "Coolant Thermostat Insufficient",            defaultByte: 0xa0, category: "ECT" },
  { addr: 0x00fc98, code: "P0723", desc: "OSS Intermittent",                           defaultByte: 0xa0, category: "Speed" },
  { addr: 0x00fc9c, code: "P0722", desc: "OSS No Signal",                              defaultByte: 0xa0, category: "Speed" },
  { addr: 0x00fcb0, code: "P1870", desc: "TCC Mechanical Slip Performance",            defaultByte: 0xa0, category: "TCC" },
  { addr: 0x00fcb4, code: "P0447", desc: "EVAP Vent Solenoid Open",                    defaultByte: 0xc0, category: "EVAP" },
  { addr: 0x00fcb8, code: "P0448", desc: "EVAP Vent Solenoid Shorted",                 defaultByte: 0xc0, category: "EVAP" },
  { addr: 0x00fcbc, code: "P0660", desc: "IMRC Actuator Circuit B1",                   defaultByte: 0xc0, category: "Air" },
  { addr: 0x00fcc0, code: "P0662", desc: "IMRC Actuator Circuit B2",                   defaultByte: 0xc0, category: "Air" },
  { addr: 0x00fcc4, code: "P0502", desc: "VSS Low Input",                              defaultByte: 0xa0, category: "Speed" },
  { addr: 0x00fcd0, code: "P0606", desc: "PCM Processor Performance (4)",              defaultByte: 0xc0, category: "PCM" },
  { addr: 0x00fcd4, code: "P0606", desc: "PCM Processor Performance (5)",              defaultByte: 0xc0, category: "PCM" },
];

export function isDtcEnabled(byte: number): boolean {
  return (byte & DTC_ENABLE_BIT) !== 0;
}
