# Changelog

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
