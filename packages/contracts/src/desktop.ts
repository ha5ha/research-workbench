/** Public desktop settings summary. Authentication values never cross this DTO. */
export interface AppSettings {
  appVersion: string;
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
