import { contextBridge, ipcRenderer } from "electron";
import type {
  RunEvent,
  RunOptions,
  PlatformInfo,
  PortInfo,
} from "../shared/ipc/events";

export interface SamsonApi {
  getPlatformInfo(): Promise<PlatformInfo>;
  getVersion(): Promise<string>;
  listPorts(): Promise<PortInfo[]>;
  startRun(options: RunOptions): Promise<void>;
  cancelRun(): Promise<void>;
  saveReport(markdown: string, suggestedFilename: string): Promise<string | null>;
  onEvent(callback: (event: RunEvent) => void): () => void;
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
};

contextBridge.exposeInMainWorld("samson", api);

declare global {
  interface Window {
    samson: SamsonApi;
  }
}
