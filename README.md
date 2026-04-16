# Samson for PCM32U

Open-source, **read-only** cross-platform diagnostic tool for the Delphi
68332-based GM/Isuzu PCM32U ECU (2002–2004 Rodeo/Trooper/Axiom and GM
siblings).

> **v0.1.0-alpha.2 is available for testing.** Download pre-built binaries for
> macOS, Windows, and Linux from the
> [Releases page](https://github.com/cooltrainersamson/samson-for-PCM32U/releases).

## Why this exists — right to repair

Samson is a read-only diagnostic tool built to support **right to repair** for
owners of a specific, aging fleet of vehicles. Modern vehicles embed
technological protection measures that prevent owners from inspecting,
diagnosing, or understanding the computers in cars they legally own. For the
2002–2004 Isuzu and GM vehicles this tool targets, the manufacturers walked
away from dealer support more than a decade ago, and the remaining community
of owners and independent mechanics has been left without viable first-party
diagnostic options.

This project exists to chip away at that problem for one specific ECU
platform — the Delphi PCM32U — by providing an open, auditable, cross-platform
diagnostic tool that owners can run on their own hardware, against their own
vehicles, to understand their own property.

The tool is **deliberately read-only**. It does not write flash, does not
modify calibration values, does not toggle DTCs, and cannot alter ECU state
in any way. Every destructive KWP2000 service is blocked by a hard-coded
wire-boundary safety rail before a byte reaches the adapter. See the
[Safety](#safety) section for the full list of blocked SIDs.

## Download

| Platform | File | Notes |
| --- | --- | --- |
| **macOS (Apple Silicon)** | `Samson-for-PCM32U-*-arm64.dmg` | M1/M2/M3/M4. Right-click → Open on first launch. |
| **macOS (Intel)** | `Samson-for-PCM32U-*.dmg` | (the one *without* `arm64`). Right-click → Open on first launch. |
| **Windows** | `Samson-for-PCM32U-Setup-*.exe` | Click "More info" → "Run anyway" on SmartScreen. |
| **Linux** | `Samson-for-PCM32U-*.AppImage` | `chmod +x` then run. See serial port note below. |

Binaries are **unsigned** in this alpha. Your OS will warn you the first time
you open the app — this is expected and safe to bypass.

## What it does

Samson is a plug-and-play diagnostic tool. No vehicle selection screens, no
VIN entry — just plug in your OBD-II adapter, click Start, and the tool
figures out the rest automatically.

1. **Connect** to the ECU over any ELM327-compatible USB OBD-II adapter on J1850 VPW.
2. **Read the broadcast code** directly from the ECU's flash memory to identify the vehicle (e.g. DNYY = 2002 Rodeo Sport 3.2L AT).
3. **Unlock** the ECU using the matched algorithm. No manual algo selection needed.
4. **Scan flash memory** to locate and characterize DTC enable tables and calibration table offsets — the headline feature. Known DTCs are checked against expected values; unknown bit-7 clusters are surfaced as candidates for the project owner to catalogue.
5. **Full flash dump** (optional, extremely slow — hardware bus speed limitation). Reads the entire flash 4 bytes at a time over J1850 VPW.
6. **Generate a Markdown report** with full wire traffic log, save it locally.

Every step streams live narration to the UI so you can see exactly what the
tool is doing on the wire in real time.

### How the unlock works

The ECU doesn't transmit which algorithm to use. Instead, Samson reads the
ECU's 4-letter **broadcast code** from flash (via Mode 0x23) and looks it up
in a table derived from TIS2000's `DllSecurity.dll`. This is the same
mechanism GM's own Service Programming System uses — we just do it
automatically instead of requiring a manual vehicle selection.

| Broadcast | Vehicle | Algo | Table | Status |
| --- | --- | --- | --- | --- |
| DNYY | 2002 Rodeo Sport 3.2L AT | 0x31 | 1 | Confirmed live |
| DLYW | 2002 Trooper 3.5L AT | 0x31 | 1 | Presumed |
| DNBN | 2002 Trooper 3.5L AT (alt) | 0x31 | 1 | Presumed |
| DSPX | 2003 Frontera 3.5L MT | 0x31 | 1 | Presumed |

If your ECU has a broadcast code not in this table, the tool surfaces it as
an unknown candidate in the report. **That's exactly the data we need** — send
the report so we can extend the table for everyone.

## What it does NOT do

* ❌ **No flash writing.** No tuning. No DTC toggling. No kernel uploads.
* ❌ **No destructive operations of any kind.** A hard safety rail in the code blocks every KWP2000 service that could modify ECU state (Mode 0x34, 0x36, 0x37, 0x3D, etc.) before it reaches the wire.
* ❌ No telemetry, no cloud sync, no auto-upload.
* ❌ No data leaves your computer unless you choose to share the report file.

This tool is deliberately scoped to **read-only** operations. The worst case
is a failed read that you can retry — never a brick.

## Supported hardware

* **Adapters:** Any ELM327-compatible USB serial adapter with a J1850 VPW-capable chipset — OBDLink SX, Vgate iCar, Veepeak, generic ELM327 v1.5+ clones on FTDI/CH340/CP210x silicon.
* **Vehicles:** 2002–2004 Isuzu Rodeo / Rodeo Sport / Trooper / Axiom, Frontera, and GM siblings that use the J1850 VPW bus and the Delphi PCM32U ECU.
* **Platforms:** Windows 10/11, macOS (Intel & Apple Silicon), Linux x86_64.

If your vehicle uses CAN instead of J1850 VPW, this tool will not work.

## Quick start

1. Plug your OBD-II adapter into the vehicle and your computer.
2. Turn the key to **RUN** (do **not** start the engine).
3. Open Samson, pick the serial port, click **Continue**.
4. Click **Start run** in the Identify tab.
5. Watch the phases light up as the tool talks to your ECU.
6. When it finishes, go to the **Report** tab and click **Save as…**

## How to help

If you run the diagnostic, **please email the saved `.md` report** to
**cooltrainersamson@gmail.com**. Include:

* Vehicle year, make, model
* Last 6 digits of the VIN (optional)
* Any modifications already done (intake, exhaust, MT swap, etc.)

**Unknown broadcasts and unknown DTC candidates** in your report are the most
valuable data — that's what extends the compatibility table for everyone.

The tool does not collect PII automatically. Always review the report before
sharing.

## Serial port access (Linux)

On Linux, your user may not have permission to open serial devices. Fix:

```
sudo usermod -a -G dialout $USER
```

Then **log out and back in** (or reboot). The app will show a clear error
message if this step is needed.

## Building from source

```
npm install
npm test            # 47 unit + integration tests
npm run typecheck   # TypeScript strict check
npm run dev         # launch in dev mode with hot reload
npm run build       # production build (out/)
npm run dist:mac    # .dmg for macOS
npm run dist:win    # .exe installer for Windows
npm run dist:linux  # .AppImage for Linux
```

Requires Node 22+ and npm 10+.

## Architecture

```
src/
  main/           Electron main process (IPC, serial, orchestrator)
  preload/        contextBridge (typed window.samson API)
  renderer/       React 19 UI (tabs, live step log, wire traffic)
  shared/
    seedkey/      TIS2000 seed-key engine (256×2 algo tables from DllSecurity.dll)
    pcm32u/       Broadcast→algo mapping, DTC database, known vehicle profiles
    elm327/       ELM327 driver, frame parser, NRC table, safety rail
    kwp/          KWP2000 client (ping, unlock, RMBA)
    scanner/      Table-hunting heuristics + broadcast/DTC finders
    report/       Markdown report generator
    mock-ecu/     In-memory PCM32U simulator for testing
    transport/    Serial + mock transport abstraction
    ipc/          Event protocol types
    orchestrator  Run coordinator with broadcast-driven algo selection
```

47 tests cover the seed-key engine, ELM327 protocol, scanner heuristics,
report generation, orchestrator flow, and the destructive-SID safety rail.

## Safety

The tool includes a **hard wire-boundary safety rail** that categorically
refuses to transmit any KWP2000 service that could modify ECU state:

| Blocked SID | Service | Why |
| --- | --- | --- |
| 0x2E | WriteDataByIdentifier | Writes calibration values |
| 0x31 | StartRoutineByLocalIdentifier | Can trigger flash erase |
| 0x34 | RequestDownload | Opens a flash write session |
| 0x36 | TransferData | Uploads kernels / writes flash |
| 0x37 | RequestTransferExit | Finalizes a write session |
| 0x3B | WriteDataByCommonIdentifier | Writes common data |
| 0x3D | WriteMemoryByAddress | Arbitrary memory write |

If any code path ever constructs one of these requests — even through a bug —
`DestructiveSidBlockedError` fires before a single byte reaches the adapter.

## Trademarks and affiliation

This project is not affiliated with, endorsed by, sponsored by, or otherwise
connected to General Motors, Isuzu, Delphi, Aptiv, Hitachi Astemo, or any
vehicle or powertrain manufacturer. References to third-party products,
services, protocols, and file names — including TIS2000, DllSecurity.dll,
PCM32U, I-TEC, KWP2000, J1850 VPW, and ELM327 — are used solely for
identification and interoperability purposes. All trademarks are the property
of their respective owners. See [NOTICE](NOTICE) for the full attribution
and non-affiliation statement.

## Regulatory context

**U.S. users:** Circumvention of technological protection measures on lawfully
acquired motor vehicles for the purposes of diagnosis, repair, and lawful
modification is the subject of temporary exemptions adopted by the Librarian
of Congress under 17 U.S.C. § 1201. These exemptions have been repeatedly
renewed, most recently in the Ninth Triennial Rulemaking, effective
October 28, 2024.

**Users outside the U.S.** are responsible for compliance with the laws of
their own jurisdiction.

Regardless of jurisdiction, users are solely responsible for compliance with
all applicable emissions, warranty, safety, and vehicle-modification laws and
regulations. This software is provided "AS IS" — see [LICENSE](LICENSE) for
the full warranty disclaimer and limitation of liability. Nothing in this
README constitutes legal advice.

## License

MIT. See [LICENSE](LICENSE) for the full license text and [NOTICE](NOTICE)
for attribution and trademark information.
