import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  RpcEvent,
  SshProfileSaveInput,
  SshSettingsSummary
} from "@research-workbench/contracts";

interface CoreStatus {
  state: "starting" | "online" | "stopped" | "error";
  message: string;
}

contextBridge.exposeInMainWorld("rw", {
  request: <T>(method: string, params?: unknown): Promise<T> =>
    ipcRenderer.invoke("core:request", { method, params }) as Promise<T>,
  status: (): Promise<CoreStatus | null> =>
    ipcRenderer.invoke("core:status") as Promise<CoreStatus | null>,
  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:get") as Promise<AppSettings>,
  getSshSettings: (): Promise<SshSettingsSummary> =>
    ipcRenderer.invoke("ssh:list") as Promise<SshSettingsSummary>,
  saveSshProfile: (input: SshProfileSaveInput): Promise<SshSettingsSummary> =>
    ipcRenderer.invoke("ssh:saveProfile", input) as Promise<SshSettingsSummary>,
  clearSshCredential: (id: string): Promise<SshSettingsSummary> =>
    ipcRenderer.invoke("ssh:clearCredential", {
      id
    }) as Promise<SshSettingsSummary>,
  probeSshHostKey: (
    id: string
  ): Promise<{ hostKeySha256: string; revision: number }> =>
    ipcRenderer.invoke("ssh:probeHostKey", { id }) as Promise<{
      hostKeySha256: string;
      revision: number;
    }>,
  confirmSshHostKey: (
    id: string,
    hostKeySha256: string
  ): Promise<SshSettingsSummary> =>
    ipcRenderer.invoke("ssh:confirmHostKey", {
      id,
      hostKeySha256
    }) as Promise<SshSettingsSummary>,
  testSshConnection: (id: string): Promise<{ connected: boolean }> =>
    ipcRenderer.invoke("ssh:testConnection", { id }) as Promise<{
      connected: boolean;
    }>,
  saveProvider: (provider: {
    provider: "deepseek" | "openai-compatible";
    baseUrl: string;
    model: string;
    apiKey?: string;
  }): Promise<AppSettings> =>
    ipcRenderer.invoke(
      "settings:saveProvider",
      provider
    ) as Promise<AppSettings>,
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
  pickAttachments: (): Promise<{
    canceled: boolean;
    files: Array<{ name: string; path: string; size: number }>;
  }> =>
    ipcRenderer.invoke("files:pickAttachments") as Promise<{
      canceled: boolean;
      files: Array<{ name: string; path: string; size: number }>;
    }>,
  savePermissions: (
    level: "read-only" | "workspace-write" | "full-access"
  ): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:savePermissions", {
      level
    }) as Promise<AppSettings>,
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
