import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import { join } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { homedir, platform as osPlatform, release, arch } from "node:os";
import { SerialTransport, listPorts } from "../shared/transport/serial";
import { Orchestrator } from "../shared/orchestrator";
import type {
  RunEvent,
  RunOptions,
  PlatformInfo,
  PortInfo,
  UpdateEvent,
} from "../shared/ipc/events";

// Read version from package.json so the value never drifts from the
// release tag electron-builder publishes.
const TOOL_VERSION = app.getVersion();

// Outbound update-event channel. Renderer subscribes via `samson.onUpdate`.
function emitUpdate(event: UpdateEvent): void {
  mainWindow?.webContents.send("samson:update", event);
}

let latestUpdateUrl: string | null = null;

let mainWindow: BrowserWindow | null = null;
let currentOrchestrator: Orchestrator | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1060,
    minHeight: 720,
    backgroundColor: "#0a0c10",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: "deny" };
  });

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function getPlatformInfo(): PlatformInfo {
  return {
    os: osPlatform(),
    osVersion: release(),
    arch: arch(),
    toolVersion: TOOL_VERSION,
  };
}

function registerIpc(): void {
  ipcMain.handle("samson:getPlatformInfo", (): PlatformInfo => getPlatformInfo());

  ipcMain.handle("samson:listPorts", async (): Promise<PortInfo[]> => {
    const ports = await listPorts();
    return ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer,
      friendlyName: p.friendlyName,
      vendorId: p.vendorId,
      productId: p.productId,
      serialNumber: p.serialNumber,
    }));
  });

  ipcMain.handle("samson:startRun", async (_evt, options: RunOptions): Promise<void> => {
    if (currentOrchestrator) {
      throw new Error("A diagnostic run is already in progress.");
    }
    const transport = new SerialTransport({
      path: options.portPath,
      baudRate: options.baudRate,
    });
    const orchestrator = new Orchestrator(
      {
        transport,
        adapterLabel: options.portPath,
        adapterBaudRate: options.baudRate,
        platform: getPlatformInfo(),
        emit: (event: RunEvent) => {
          mainWindow?.webContents.send("samson:event", event);
        },
      },
      options,
    );
    currentOrchestrator = orchestrator;
    // Don't await — events stream back via IPC. Release the invoke promise
    // immediately so the UI is unblocked.
    void orchestrator
      .run()
      .catch((err: unknown) => {
        // Already emitted as a fatal event by the orchestrator; this is a
        // last-resort catch for anything that escaped.
        mainWindow?.webContents.send("samson:event", {
          type: "error",
          phase: null,
          message: err instanceof Error ? err.message : String(err),
          ts: Date.now(),
        } satisfies RunEvent);
      })
      .finally(() => {
        currentOrchestrator = null;
        void transport.close().catch(() => undefined);
      });
  });

  ipcMain.handle("samson:cancelRun", async (): Promise<void> => {
    currentOrchestrator?.cancel();
  });

  ipcMain.handle(
    "samson:saveReport",
    async (
      _evt,
      args: { markdown: string; suggestedFilename: string },
    ): Promise<string | null> => {
      if (!mainWindow) return null;
      const defaultDir = join(homedir(), "Desktop");
      try {
        await mkdir(defaultDir, { recursive: true });
      } catch {
        // best-effort
      }
      const result = await dialog.showSaveDialog(mainWindow, {
        title: "Save diagnostic report",
        defaultPath: join(defaultDir, args.suggestedFilename),
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (result.canceled || !result.filePath) return null;
      await writeFile(result.filePath, args.markdown, "utf8");
      return result.filePath;
    },
  );

  ipcMain.handle("samson:getVersion", (): string => TOOL_VERSION);

  // ── Auto-update IPC ────────────────────────────────────────────────
  // On Linux/Windows: download the update and quitAndInstall on user click.
  // On macOS: Gatekeeper blocks silent installs of unsigned apps, so we
  // open the GitHub release page externally and the user re-downloads.
  ipcMain.handle("samson:installUpdate", (): void => {
    if (process.platform === "darwin") {
      if (latestUpdateUrl) void shell.openExternal(latestUpdateUrl);
    } else {
      autoUpdater.quitAndInstall();
    }
  });

  ipcMain.handle("samson:checkForUpdates", async (): Promise<void> => {
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      emitUpdate({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

function configureAutoUpdater(): void {
  // macOS auto-install requires a notarized signed binary, which this
  // open-source project doesn't have. Fall back to notify-only on Mac:
  // we surface "available" with a release URL, user re-downloads.
  const isMac = process.platform === "darwin";
  autoUpdater.autoDownload = !isMac;
  autoUpdater.autoInstallOnAppQuit = !isMac;
  autoUpdater.allowPrerelease = TOOL_VERSION.includes("-"); // alpha/beta builds opt in to prereleases

  autoUpdater.on("checking-for-update", () => emitUpdate({ type: "checking" }));

  autoUpdater.on("update-not-available", (info) => {
    const v =
      info && typeof info === "object" && "version" in info
        ? String((info as { version: unknown }).version)
        : TOOL_VERSION;
    emitUpdate({ type: "current", currentVersion: v });
  });

  autoUpdater.on("update-available", (info) => {
    const version =
      info && typeof info === "object" && "version" in info
        ? String((info as { version: unknown }).version)
        : "(unknown)";
    const releaseUrl = `https://github.com/cooltrainersamson/samson-for-PCM32U/releases/tag/v${version}`;
    latestUpdateUrl = releaseUrl;
    emitUpdate({
      type: "available",
      version,
      releaseUrl,
      canAutoInstall: !isMac,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent =
      progress && typeof progress === "object" && "percent" in progress
        ? Number((progress as { percent: number }).percent)
        : 0;
    emitUpdate({ type: "downloading", percent });
  });

  autoUpdater.on("update-downloaded", (info) => {
    const version =
      info && typeof info === "object" && "version" in info
        ? String((info as { version: unknown }).version)
        : "(unknown)";
    emitUpdate({ type: "ready", version });
  });

  autoUpdater.on("error", (err) => {
    emitUpdate({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  });

  // Skip the check entirely in dev (no `out/` build, the autoUpdater
  // would just throw "Application is not packaged.").
  if (app.isPackaged) {
    // Defer 3s so the renderer finishes mounting and can receive the
    // events. Failure here is non-fatal — the app still works offline.
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err: unknown) => {
        emitUpdate({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    }, 3000);
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  configureAutoUpdater();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
