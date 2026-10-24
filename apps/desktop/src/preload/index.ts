import { contextBridge, ipcRenderer } from "electron";
import type { RpcEvent } from "@research-workbench/contracts";

interface CoreStatus {
  state: "starting" | "online" | "stopped" | "error";
  message: string;
}

interface AppSettings {
  hasApiKey: boolean;
  apiKeySource: "saved" | "env" | "none";
  provider: "deepseek" | "openai-compatible";
  baseUrl: string;
  model: string;
  workspace: string;
  isDefaultWorkspace: boolean;
  gitBinary: string;
  autoCommit: boolean;
}

contextBridge.exposeInMainWorld("rw", {
  request: <T>(method: string, params?: unknown): Promise<T> =>
    ipcRenderer.invoke("core:request", { method, params }) as Promise<T>,
  status: (): Promise<CoreStatus | null> =>
    ipcRenderer.invoke("core:status") as Promise<CoreStatus | null>,
  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:get") as Promise<AppSettings>,
  saveApiKey: (apiKey: string): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:saveApiKey", {
      apiKey
    }) as Promise<AppSettings>,
  saveProvider: (provider: {
    provider: "deepseek" | "openai-compatible";
    baseUrl: string;
    model: string;
    apiKey?: string;
  }): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:saveProvider", provider) as Promise<AppSettings>,
  saveGit: (git: {
    gitBinary: string;
    autoCommit: boolean;
  }): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:saveGit", git) as Promise<AppSettings>,
  chooseGitBinary: (): Promise<{ canceled: boolean; path?: string }> =>
    ipcRenderer.invoke("settings:chooseGitBinary") as Promise<{
      canceled: boolean;
      path?: string;
    }>,
  clearApiKey: (): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:clearApiKey") as Promise<AppSettings>,
  chooseWorkspace: (): Promise<{
    canceled: boolean;
    workspace?: string;
  }> =>
    ipcRenderer.invoke("settings:chooseWorkspace") as Promise<{
      canceled: boolean;
      workspace?: string;
    }>,
  resetWorkspace: (): Promise<{ canceled: boolean }> =>
    ipcRenderer.invoke("settings:resetWorkspace") as Promise<{
      canceled: boolean;
    }>,
  onEvent: (handler: (event: RpcEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: RpcEvent) =>
      handler(payload);
    ipcRenderer.on("core:event", listener);
    return () => ipcRenderer.removeListener("core:event", listener);
  },
  onStatus: (handler: (status: CoreStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: CoreStatus) =>
      handler(status);
    ipcRenderer.on("core:status", listener);
    return () => ipcRenderer.removeListener("core:status", listener);
  }
});
