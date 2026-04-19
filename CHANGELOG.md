# Changelog

## v0.1.0-alpha.3 — 2026-04-19

Second alpha release. Headline: **first PCM32U variant beyond DNYY now
works end-to-end** — the Isuzu Axiom 3.5L AT (broadcast `DRDX`) was
captured live on 2026-04-18 and every layer of the stack got the
changes needed to handle it.

### What's new

- **Mode 0x23 dialect auto-detection.** The Axiom firmware speaks a
  GM-extended variant of ReadMemoryByAddress — size > 1 is rejected
  with NRC 0x12, the positive response echoes only the low two bytes
  of the address (no AH), and the ECU always returns 4 sequential
  bytes regardless of the size byte. The driver now probes once per
  session: tries the legacy DNYY format (size = 4) first, falls back
  to the Axiom format (size = 1) on NRC 0x12, and caches the result
  per-driver. DNYY users see no change; Axiom users see one extra
  round-trip on the first read of a session.

- **GM-extended negative-response parsing.** The same GM dialect
  returns negative responses with the rejected request's parameters
  echoed between the SID and the NRC: `7F 23 <echo> NRC` instead of
  the standard `7F 23 NRC`. The NRC parser now reads the trailing
  data byte, which collapses to the standard layout for normal-format
  responses. Before this fix, every Mode 0x23 NRC on the Axiom
  surfaced as `unknown_0x01` or `unknown_0x00` — the first echoed
  byte. Now we get the real NRC (0x12 in our case → properly named
  `subFunctionNotSupported` in the report).

- **DRDX broadcast added** to KNOWN_BROADCASTS and BROADCAST_ALGO.
  Identified live as a 2002 Isuzu Axiom 3.5L AT, calibration string
  `025UPSUS AT NLEV STCL CRUZ RC1 SWI15V05D4CLZAD4SE18`. Seed-key
  algo 0x31 table 1 (same as the rest of the PCM32U family).
  configBase 0x018280, dtcBase 0x00f948 (family default — the live
  DTC scan worked at this address, but it's marked as such pending
  comparison against more variants).

- **DTC_DB extended from 18 → 157 entries.** Decoded the entire
  Axiom DTC enable region (0x00F900..0x00FD00) from a live capture
  and back-filled the database with: 108 enabled new candidates
  covering the full 6VE1 sensor surface (ECT, MAP, MAF, IAT, CKP,
  CMP, knock, misfire, B1+B2 O2 sensors, fuel trim, EGR, EVAP, idle
  speed, PCM self-test, 5V refs, output drivers, TCC variants,
  pedal/TPS, cruise switches, system voltage, fuel level, fuel tank
  pressure, IMRC) plus 31 "0x60-suppressed" entries (canonical OBD-II
  monitors the calibration deliberately turns off without dropping
  the slot — catalyst, ignition coils, per-cylinder injectors, EVAP
  system tests, knock counters, PCM ROM). All 18 prior DNYY-derived
  defaults were verified against the live Axiom; every one matches.

- **CLI tooling under `scripts/`** for live-ECU work: `npm run diag`
  (CLI orchestrator), `npm run probe:rmba` (Mode 0x23 format probe),
  `npm run probe:rmba-size` (size-limit characterization),
  `npm run probe:dtc-status` (DTC reporting service probe), and
  `npm run catalog:dtcs` (post-process a saved diagnostic into a
  per-slot DTC catalogue). All read-only, all guarded by the
  existing destructive-SID safety rail.

- **Live diagnostic archive** under `Broadcast-codes/DRDX/` —
  the 2026-04-19 diagnostic markdown plus the decoded DTC catalogue.
  Shipped in-tree so the project owner has a permanent reference
  point when reviewing what the second-known PCM32U variant looks
  like.

### Behaviour changes & migration notes

- The "Method: known" label in the unlock section of the report now
  reflects whether the algo came from the BROADCAST_ALGO lookup OR
  from the family-default fallback; the orchestrator wording was
  already correct, but for the Axiom this means the report now reads
  "Unlocked via broadcast-derived algo" instead of the
  family-fallback path.
- DNYY and any other pre-existing variant: zero behavioural change.
  The dialect probe is conservative (DNYY format first, fallback
  only on NRC 0x12).
- Tests: 50 pass (was 47). The "scanDtcTables reports all known
  DTCs" test no longer hard-codes 18 — it walks `DTC_DB.length` so
  the database can grow without test churn. Two unknown-DTC injection
  tests moved their sentinel address from 0x00FCB0 (now P1870 in the
  expanded DB) to 0x00FCDC (a non-DB slot the live Axiom carries
  with the unusual 0x28 enable byte).

### Still on the list

- 0x60 enable byte semantics is currently inferred from the bit
  pattern (`0110_0000` reads as MIL+bit5 staged, master enable
  cleared) and the topical clustering of codes (all canonical OBD-II
  monitors). Live confirmation via Mode 0x18 is queued — the script
  is in `scripts/probe-dtc-status.ts`, just needs to be run against
  the Axiom next time the adapter is connected.
- dtcBase for DRDX is currently the family default (0x00f948). A
  side-by-side comparison with the live DTC scan output will confirm
  or revise it.

## v0.1.0-alpha.1 — 2026-04-15

First alpha release for guinea-pig testing.

**This is a read-only diagnostic tool.** It cannot write to, tune, or modify
your ECU in any way. The worst case is a failed read — never a brick.

### What works
- Connect to any ELM327-compatible adapter over USB serial (J1850 VPW)
- Unlock the ECU via the reverse-engineered TIS2000 seed-key algorithm
  (algo 0x31 table 1, live-verified on DNYY)
- Read and identify the 4-letter broadcast code from flash
- Scan the DTC enable region and report known + unknown candidates
- Read the DTC descriptor table at 0x67358
- Full flash dump (very slow — hardware bus speed limitation)
- Generate a Markdown diagnostic report with full wire traffic log
- Save the report locally

### What doesn't work yet
- No tuning, no flash writing, no DTC toggling — deliberately disabled
- No kernel uploads — the tool only uses safe KWP2000 services
- No auto-baud detection — pick baud manually (OBDLink SX = 115200)
- No CAN bus support — J1850 VPW only
- Unsigned binaries — macOS will ask "are you sure?" on first launch

### How to help
1. Plug in your OBDLink / ELM327 adapter
2. Turn key to RUN, engine OFF
3. Run the diagnostic
4. Email the saved `.md` report to cooltrainersamson@gmail.com
5. Include: vehicle year/make/model, last 6 of VIN (optional), any mods

Unknown broadcasts and unknown DTC candidates in your report are the
most valuable data — that's what extends the compatibility table.
