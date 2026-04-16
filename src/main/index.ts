import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
import { join } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { homedir, platform as osPlatform, release, arch } from "node:os";
import { SerialTransport, listPorts } from "../shared/transport/serial";
import { Orchestrator } from "../shared/orchestrator";
import type { RunEvent, RunOptions, PlatformInfo, PortInfo } from "../shared/ipc/events";

const TOOL_VERSION = "0.0.1";

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
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
