export type {
  FactStatus,
  Fact,
  Milestone,
  PermissionLevel,
  CoreStatus,
  Hello,
  AgentChatResult,
  ApprovalRequest,
  ResearchTask,
  ResearchQuestion,
  ResearchProject,
  KnowledgeItem,
  LiteratureItem,
  ResearchTopic,
  ResearchScope,
  ExperimentReusable,
  SessionSummary,
  TranscriptMessage,
  ContextUsage,
  UploadedFile,
  AgentCard as ChatCard
} from "@research-workbench/contracts";
export type View = "chat" | "status" | "records" | "facts";

export type { AppSettings } from "@research-workbench/contracts";

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

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  mode?: "faux" | "deepseek" | "openai";
};

export type Attachment = {
  name: string;
  path: string;
  size: number;
};

/** Minimal experiment reference kept in the shell for tree evidence counts. */
export type ExperimentRef = {
  id: string;
  scope: { projectId?: string; questionId?: string; taskId?: string } | null;
};

export type TraceStep = {
  id: string;
  toolName: string;
  label: string;
  status: "running" | "done" | "error";
};

/** Structured research cards emitted by Core into the conversation. */
