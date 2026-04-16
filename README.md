# Samson-for-PCM32U

Open-source, **read-only** cross-platform diagnostic tool for the Delphi 68332-based
GM/Isuzu PCM32U ECU (2002–2004 Rodeo/Trooper/Axiom and GM siblings).

> ⚠️ **Early development.** This tool is under active construction. It is
> currently a scaffold; nothing useful runs yet. Check back when there's a
> tagged release.

## What it does (planned MVP)

1. Talk to the ECU over an ELM327/OBDLink adapter on J1850 VPW.
2. Unlock the ECU with the reverse-engineered TIS2000 seed-key algorithm.
3. Identify the ECU by its 4-letter broadcast code and display the vehicle profile.
4. Scan flash memory to **locate and characterize DTC enable tables and calibration tables** — the headline feature.
5. (Optional, slow) Dump the full flash to a local `.bin` file for offline analysis.
6. Save a Markdown report to `reports/[YYYY-MM-DD]-[broadcast].md`.

## What it does NOT do

- ❌ No flash writing. No tuning. No DTC toggling. No kernel uploads.
- ❌ No telemetry, no cloud sync, no auto-upload.
- ❌ No data leaves your computer unless you choose to share the report file.

This tool is deliberately scoped to **read-only** operations. Writing to a
PCM32U requires reverse-engineering work that is not yet validated, and a
mistake will brick the ECU permanently.

## Supported hardware

- **Adapters:** ELM327 v1.5+, OBDLink SX, generic FTDI/CH340/CP210x clones
- **Vehicles:** 2002–2004 Isuzu Rodeo / Rodeo Sport / Trooper / Axiom, Frontera,
  and GM siblings that use the J1850 VPW bus and the Delphi PCM32U ECU
- **Platforms:** Windows 10/11, macOS (Intel & Apple Silicon), Linux x86_64

If your vehicle uses CAN instead of J1850 VPW, this tool will not work.

## Building from source

```bash
npm install
npm test          # unit tests
npm run typecheck # TypeScript check
```

Electron build scripts land in a later commit.

## License

MIT. See [LICENSE](LICENSE).

## Sharing your report

If you run the diagnostic and want to contribute data to the project, email
the generated report file to **cooltrainersamson@gmail.com**. Before sending,
open the `.md` file and remove anything you don't want public (the tool does
not collect PII automatically, but always review before sharing).
