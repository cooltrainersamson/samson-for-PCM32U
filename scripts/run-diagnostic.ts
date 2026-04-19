// CLI runner for the Orchestrator. Same flow as the Electron app's
// "Identify" button, just without the UI. Streams events to stdout and
// writes the markdown report next to this script.
//
// Usage: npx jiti scripts/run-diagnostic.ts <serial-port>
//   e.g. npx jiti scripts/run-diagnostic.ts /dev/tty.usbserial-223230349701

import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { platform as osPlatform, release, arch } from "node:os";

import { SerialTransport } from "../src/shared/transport/serial";
import { Orchestrator } from "../src/shared/orchestrator";
import type { RunEvent } from "../src/shared/ipc/events";

const TOOL_VERSION = "0.0.1-dev";

async function main() {
  const port = process.argv[2];
  if (!port) {
    console.error("usage: npx jiti scripts/run-diagnostic.ts <serial-port>");
    process.exit(1);
  }

  const transport = new SerialTransport({ path: port, baudRate: 115200 });
  const events: RunEvent[] = [];

  let reportMarkdown = "";
  let suggestedFilename = "diagnostic.md";

  const orch = new Orchestrator(
    {
      transport,
      adapterLabel: port,
      adapterBaudRate: 115200,
      platform: {
        os: osPlatform(),
        osVersion: release(),
        arch: arch(),
        toolVersion: TOOL_VERSION,
      },
      emit: (event: RunEvent) => {
        events.push(event);
        // Concise live narration to stdout
        if (event.type === "phase") {
          const icon =
            event.status === "ok"
              ? "✅"
              : event.status === "error"
                ? "❌"
                : event.status === "warn"
                  ? "⚠️ "
                  : event.status === "skipped"
                    ? "⏭ "
                    : "▶ ";
          console.log(`${icon} [${event.phase}] ${event.message}`);
        } else if (event.type === "narrate") {
          console.log(`     ${event.message}`);
        } else if (event.type === "warning") {
          console.log(`⚠️  ${event.message}`);
        } else if (event.type === "error") {
          console.log(`❌ FATAL: ${event.message}`);
          if (event.why) console.log(`   why: ${event.why}`);
          if (event.fix) console.log(`   fix: ${event.fix}`);
        } else if (event.type === "done") {
          reportMarkdown = event.reportMarkdown;
          suggestedFilename = event.suggestedFilename;
          console.log(
            `\n=== run finished, success=${event.success}, report=${event.suggestedFilename} ===`,
          );
        }
      },
    },
    {
      portPath: port,
      baudRate: 115200,
      scanBroadcast: true,
      scanDtc: true,
      includeDescriptorTable: false,
      fullFlashDump: false,
    },
  );

  try {
    await orch.run();
  } finally {
    try {
      await transport.close();
    } catch {}
  }

  if (reportMarkdown) {
    const here = dirname(fileURLToPath(import.meta.url));
    const outPath = join(here, "..", "reports", suggestedFilename);
    await writeFile(outPath, reportMarkdown, "utf8");
    console.log(`\nreport written: ${outPath}`);
  } else {
    console.log("(no report markdown captured)");
  }
}

main().catch((err) => {
  console.error("run-diagnostic failed:", err);
  process.exit(1);
});
