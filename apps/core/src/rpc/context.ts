import { type WorkspaceTransaction } from "../workspace-mutations.js";
import type { RunService } from "../run-service.js";
import {
  type ResearchScope,
  type RpcEvent,
  type RpcEventType,
  type AgentStreamEvent,
  type RpcRequest,
  type AgentSpikeResult,
  type AgentChatResult,
  type ContextUsage,
  type SessionSummary,
  type TranscriptMessage,
  type ApprovalInput,
  type ParsedRpcParams
} from "@research-workbench/contracts";
import type { ResearchEnvironment } from "@research-workbench/contracts";
import type { ExperimentStore } from "../experiment-store.js";
import type { FactStore } from "../fact-store.js";
import type { GitService } from "../git-service.js";
import type { MilestoneStore } from "../milestone-store.js";
import type { ScheduleStore } from "../schedule-store.js";
import type { LspService } from "../lsp-service.js";
import type { PermissionService } from "../permissions.js";
import type { ResearchService } from "../research-service.js";
import type { SkillService } from "../skill-service.js";
import type { WorkspaceService } from "../workspace-service.js";
export class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown
  ) {
    super(message);
  }
}
export interface AgentRunner {
  run(scope: ResearchScope): Promise<AgentSpikeResult>;
}
export interface AgentChatRunner {
  prompt(
    prompt: string,
    scope: ResearchScope,
    onEvent: (event: AgentStreamEvent) => void
  ): Promise<AgentChatResult>;
  setApiKey(apiKey: string): void | Promise<void>;
  reset(): void | Promise<void>;
  restoreSession(sessionFile: string | null): void | Promise<void>;
  configureProvider(
    input: ParsedRpcParams<"agent.configureProvider">
  ): void | Promise<void>;
  abort?(): Promise<void>;
  contextUsage?(): ContextUsage | null;
  compact?(customInstructions?: string): Promise<void>;
  listSessions?(): Promise<SessionSummary[]>;
  readSession?(file: string): Promise<TranscriptMessage[]>;
}
export interface ApprovalResponder {
  respond(id: string, approved: boolean): boolean;
  request?(input: ApprovalInput): Promise<boolean>;
}
export interface RpcServerOptions {
  workspaceRoot: string;
  skills: SkillService;
  environment: ResearchEnvironment;
  agent?: AgentRunner;
  chat?: AgentChatRunner;
  approvals?: ApprovalResponder;
  workspace?: WorkspaceService;
  experiments?: ExperimentStore;
  facts?: FactStore;
  milestones?: MilestoneStore;
  schedules?: ScheduleStore;
  runSchedule?: (id: string) => Promise<void>;
  loop?: RunService;
  git?: GitService;
  lsp?: LspService;
  research?: ResearchService;
  permissions?: PermissionService;
  emit?: (event: RpcEvent) => void;
}
export interface RpcContext {
  options: RpcServerOptions;
  emit(type: RpcEventType, payload: unknown): void;
  maybeAutoCommit(
    message: string,
    before: import("../git-service.js").GitStatus,
    transaction: WorkspaceTransaction
  ): Promise<void>;
}
export type RpcHandler = (request: RpcRequest) => Promise<unknown>;
