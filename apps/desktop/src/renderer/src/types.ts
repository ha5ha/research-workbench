export type View = "chat" | "status" | "records";

export type PermissionMode = "ask" | "allow" | "deny";

export type Permissions = {
  fileWrite: PermissionMode;
  command: PermissionMode;
  gitCommit: PermissionMode;
  note: PermissionMode;
};

export type AppSettings = {
  hasApiKey: boolean;
  apiKeySource: "saved" | "env" | "none";
  provider: "deepseek" | "openai-compatible";
  baseUrl: string;
  model: string;
  workspace: string;
  isDefaultWorkspace: boolean;
  gitBinary: string;
  autoCommit: boolean;
  permissions: Permissions;
};

export type CoreStatus = {
  state: "starting" | "online" | "stopped" | "error";
  message: string;
};

export type SkillInfo = {
  id: string;
  name: string;
  description: string;
  version: string;
  status: "runnable" | "planned" | "disabled";
  allowedTools: string[];
  lastReviewed: string;
};

export type Observation = {
  summary: string;
  facts: string[];
  artifactCount: number;
  actions: Array<{ id: string; title: string; risk: string; approval: string }>;
};

export type Hello = {
  name: string;
  version: string;
  workspaceRoot: string;
  projectId: string;
  capabilities: string[];
};

export type AgentChatResult = {
  text: string;
  mode: "faux" | "deepseek" | "openai";
  sessionFile: string | null;
};

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  mode?: "faux" | "deepseek" | "openai";
};

export type ApprovalRequest = {
  id: string;
  toolName: string;
  title: string;
  detail: string;
  consequence?: string;
};

export type ResearchTask = {
  id: string;
  title: string;
  status: "todo" | "active" | "done";
};

export type ResearchRoute = {
  id: string;
  title: string;
  status: "planned" | "active" | "done";
  tasks: ResearchTask[];
};

export type LiteratureItem = {
  id: string;
  title: string;
  path?: string;
  url?: string;
  note?: string;
  addedAt: string;
};

export type ResearchTopic = {
  id: string;
  title: string;
  description: string;
  literature: LiteratureItem[];
  routes: ResearchRoute[];
};

export type Attachment = {
  name: string;
  path: string;
  size: number;
};

export type UploadedFile = {
  path: string;
  name: string;
  size: number;
  modifiedAt: string;
};

export type ResearchScope = {
  projectId: string;
  questionId?: string;
  taskId?: string;
};
