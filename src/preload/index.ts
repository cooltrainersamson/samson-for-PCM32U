import { contextBridge, ipcRenderer } from "electron";
import type {
  RunEvent,
  RunOptions,
  PlatformInfo,
  PortInfo,
  UpdateEvent,
} from "../shared/ipc/events";

export interface SamsonApi {
  getPlatformInfo(): Promise<PlatformInfo>;
  getVersion(): Promise<string>;
  listPorts(): Promise<PortInfo[]>;
  startRun(options: RunOptions): Promise<void>;
  cancelRun(): Promise<void>;
  saveReport(markdown: string, suggestedFilename: string): Promise<string | null>;
  onEvent(callback: (event: RunEvent) => void): () => void;
  onUpdate(callback: (event: UpdateEvent) => void): () => void;
  installUpdate(): Promise<void>;
  checkForUpdates(): Promise<void>;
}

const api: SamsonApi = {
  getPlatformInfo: () => ipcRenderer.invoke("samson:getPlatformInfo"),
  getVersion: () => ipcRenderer.invoke("samson:getVersion"),
  listPorts: () => ipcRenderer.invoke("samson:listPorts"),
  startRun: (options) => ipcRenderer.invoke("samson:startRun", options),
  cancelRun: () => ipcRenderer.invoke("samson:cancelRun"),
  saveReport: (markdown, suggestedFilename) =>
    ipcRenderer.invoke("samson:saveReport", { markdown, suggestedFilename }),
  onEvent: (callback) => {
    const listener = (_evt: unknown, payload: RunEvent): void => callback(payload);
    ipcRenderer.on("samson:event", listener);
    return () => ipcRenderer.removeListener("samson:event", listener);
  },
  onUpdate: (callback) => {
    const listener = (_evt: unknown, payload: UpdateEvent): void => callback(payload);
    ipcRenderer.on("samson:update", listener);
    return () => ipcRenderer.removeListener("samson:update", listener);
  },
  installUpdate: () => ipcRenderer.invoke("samson:installUpdate"),
  checkForUpdates: () => ipcRenderer.invoke("samson:checkForUpdates"),
};

contextBridge.exposeInMainWorld("samson", api);

declare global {
  interface Window {
    samson: SamsonApi;
  }
}
