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

declare global {
  interface Window {
    rw: {
      request<T>(method: string, params?: unknown): Promise<T>;
      status(): Promise<CoreStatus | null>;
      getSettings(): Promise<AppSettings>;
      getSshSettings(): Promise<SshSettingsSummary>;
      saveSshProfile(input: SshProfileSaveInput): Promise<SshSettingsSummary>;
      clearSshCredential(id: string): Promise<SshSettingsSummary>;
      probeSshHostKey(
        id: string
      ): Promise<{ hostKeySha256: string; revision: number }>;
      confirmSshHostKey(
        id: string,
        hostKeySha256: string
      ): Promise<SshSettingsSummary>;
      testSshConnection(id: string): Promise<{ connected: boolean }>;
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
