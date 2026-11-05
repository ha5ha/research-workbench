export type View = "chat" | "status" | "records" | "facts";

export type FactStatus = "proposed" | "supported" | "confirmed" | "refuted";

export type Fact = {
  id: string;
  topicId: string | null;
  questionId: string | null;
  taskId: string | null;
  runId: string | null;
  statement: string;
  kind: string;
  importance: number;
  status: FactStatus;
  createdAt: string;
  confirmedAt: string | null;
};

export type Milestone = {
  id: string;
  taskId: string | null;
  kind: string;
  title: string;
  experimentId: string | null;
  at: string;
};

export type PermissionLevel = "read-only" | "workspace-write" | "full-access";

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
  permissionLevel: PermissionLevel;
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

export type ResearchQuestion = {
  id: string;
  title: string;
  status: "planned" | "active" | "done";
  tasks: ResearchTask[];
};

export type ResearchProject = {
  id: string;
  name: string;
  path?: string;
  createdAt: string;
};

export type KnowledgeItem = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  updatedAt: string;
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
  projects: ResearchProject[];
  literature: LiteratureItem[];
  knowledge: KnowledgeItem[];
  questions: ResearchQuestion[];
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

/** Minimal experiment reference kept in the shell for tree evidence counts. */
export type ExperimentRef = {
  id: string;
  scope: { projectId?: string; questionId?: string; taskId?: string } | null;
};

export type ExperimentReusable = {
  kind: string;
  description: string;
  path?: string;
};

export type SessionSummary = {
  file: string;
  id: string;
  title: string;
  startedAt: string;
  size: number;
  messages: number;
};

export type TranscriptMessage = {
  role: "user" | "assistant";
  text: string;
};

export type TraceStep = {
  id: string;
  toolName: string;
  label: string;
  status: "running" | "done" | "error";
};

/** Structured research cards emitted by Core into the conversation. */
export type ChatCard =
  | {
      kind: "taskbook";
      experimentId: string;
      title: string;
      goal: string;
      hypothesis: string;
      design: string;
      metrics: string;
      seeds: number;
      status: "draft" | "confirmed";
      similar: Array<{
        id: string;
        text: string;
        kind: string;
        score: number;
      }>;
    }
  | {
      kind: "archive";
      experimentId: string;
      title: string;
      status: string;
      metrics: string | null;
      conclusion: string | null;
      artifactCount: number;
      seedCount: number;
      reusable: { kind: string; description: string; path?: string } | null;
      facts: Array<{
        id: string;
        statement: string;
        kind: string;
        importance: number;
      }>;
      discarded: Array<{ what: string; reason: string }>;
    };

export type ContextUsage = {
  tokens: number | null;
  percent: number | null;
  contextWindow: number;
};
