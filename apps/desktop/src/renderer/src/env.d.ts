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
  permissionLevel: "read-only" | "workspace-write" | "full-access";
}

declare global {
  interface Window {
    rw: {
      request<T>(method: string, params?: unknown): Promise<T>;
      status(): Promise<CoreStatus | null>;
      getSettings(): Promise<AppSettings>;
      saveProvider(provider: {
        provider: "deepseek" | "openai-compatible";
        baseUrl: string;
        model: string;
        apiKey?: string;
      }): Promise<AppSettings>;
      saveGit(git: {
        gitBinary: string;
        autoCommit: boolean;
      }): Promise<AppSettings>;
      chooseGitBinary(): Promise<{ canceled: boolean; path?: string }>;
      pickAttachments(): Promise<{
        canceled: boolean;
        files: Array<{ name: string; path: string; size: number }>;
      }>;
      savePermissions(
        level: "read-only" | "workspace-write" | "full-access"
      ): Promise<AppSettings>;
      clearApiKey(): Promise<AppSettings>;
      chooseWorkspace(): Promise<{
        canceled: boolean;
        workspace?: string;
      }>;
      resetWorkspace(): Promise<{ canceled: boolean }>;
      onEvent(handler: (event: RpcEvent) => void): () => void;
      onStatus(handler: (status: CoreStatus) => void): () => void;
    };
  }
}

export {};
