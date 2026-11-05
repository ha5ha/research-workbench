import { z } from "zod";
import {
  ErrorCode,
  ResearchScopeSchema,
  RpcRequestSchema,
  SkillRunInputSchema,
  type ResearchScope,
  type RpcEvent,
  type RpcId,
  type RpcRequest
} from "@research-workbench/contracts";
import type { ResearchEnvironment } from "@research-workbench/contracts";
import type { ExperimentStore } from "./experiment-store.js";
import type { FactStore } from "./fact-store.js";
import type { GitService } from "./git-service.js";
import type { MilestoneStore } from "./milestone-store.js";
import type { AgentCard } from "./cards.js";
import type { LspService } from "./lsp-service.js";
import type { PermissionService } from "./permissions.js";
import { projectIdFromWorkspace } from "./project-id.js";
import type { ResearchService } from "./research-service.js";
import type { SkillService } from "./skill-service.js";
import type { WorkspaceService } from "./workspace-service.js";
import { WorkspaceAccessError } from "./workspace.js";

const SkillsRunParamsSchema = z.object({
  skillId: z.string().min(1),
  input: SkillRunInputSchema
});

const DomainParamsSchema = z.object({
  scope: ResearchScopeSchema
});

const DomainApplyParamsSchema = z.object({
  scope: ResearchScopeSchema,
  actionId: z.string().min(1)
});

const AgentChatParamsSchema = z.object({
  prompt: z.string().min(1).max(20_000),
  scope: ResearchScopeSchema
});

const AgentApiKeyParamsSchema = z.object({
  apiKey: z.string().max(500)
});

const AgentProviderParamsSchema = z.object({
  provider: z.enum(["deepseek", "openai-compatible"]),
  baseUrl: z.string().max(500),
  model: z.string().min(1).max(200),
  apiKey: z.string().max(500).optional()
});

const GitConfigureParamsSchema = z.object({
  binary: z.string().max(1000).optional(),
  autoCommit: z.boolean().optional()
});

const ResearchTopicCreateSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional()
});

const ResearchTopicUpdateSchema = z.object({
  topicId: z.string().min(1),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional()
});

const ResearchLiteratureAddSchema = z.object({
  topicId: z.string().min(1),
  title: z.string().min(1).max(500),
  path: z.string().max(2000).optional(),
  url: z.string().max(2000).optional(),
  note: z.string().max(2000).optional()
});

const ResearchLiteratureRemoveSchema = z.object({
  topicId: z.string().min(1),
  literatureId: z.string().min(1)
});

const ResearchRouteCreateSchema = z.object({
  topicId: z.string().min(1),
  title: z.string().min(1).max(500)
});

const ResearchRouteStatusSchema = z.object({
  routeId: z.string().min(1),
  status: z.enum(["planned", "active", "done"])
});

const ResearchCreateTaskSchema = z.object({
  routeId: z.string().min(1),
  title: z.string().min(1).max(500)
});

const ResearchTaskStatusSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(["todo", "active", "done"])
});

const ResearchIdSchema = z.object({
  id: z.string().min(1)
});

const UploadsDeleteSchema = z.object({
  path: z.string().min(1)
});

const ExperimentReusableSchema = z.object({
  kind: z.string().min(1).max(80),
  description: z.string().min(1).max(2000),
  path: z.string().max(1000).optional()
});

const ExperimentCreateSchema = z.object({
  title: z.string().min(1).max(300),
  goal: z.string().max(2000).default(""),
  hypothesis: z.string().max(2000).default(""),
  design: z.string().max(2000).default(""),
  metrics: z.string().max(2000).optional(),
  seeds: z.number().int().min(0).max(1000).default(1),
  conclusion: z.string().max(4000).optional(),
  reusable: ExperimentReusableSchema.optional(),
  scope: ResearchScopeSchema.optional()
});

const ExperimentUpdateSchema = z.object({
  id: z.string().min(1),
  conclusion: z.string().max(4000).optional(),
  reusable: ExperimentReusableSchema.nullable().optional(),
  confirmed: z.boolean().optional()
});

const SessionFileSchema = z.object({
  file: z.string().min(1).max(2000)
});

const FactsListSchema = z.object({
  topicId: z.string().min(1).optional()
});

const FactStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["proposed", "supported", "confirmed", "refuted"])
});

const CompactSchema = z.object({
  instructions: z.string().max(4000).optional()
});

const MilestonesListSchema = z.object({
  taskId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(200).optional()
});

const PermissionsParamsSchema = z.object({
  level: z.enum(["read-only", "workspace-write", "full-access"])
});

const AgentRestoreParamsSchema = z.object({
  sessionFile: z.string().max(2000).nullable().optional()
});

const ApprovalRespondParamsSchema = z.object({
  id: z.string().min(1),
  approved: z.boolean()
});

const WorkspaceReadParamsSchema = z.object({
  path: z.string().min(1)
});

const WorkspaceWriteParamsSchema = z.object({
  path: z.string().min(1),
  content: z.string().max(2 * 1024 * 1024)
});

const TerminalRunParamsSchema = z.object({
  command: z.string().min(1).max(8_000)
});

const ExperimentGetParamsSchema = z.object({
  id: z.string().min(1)
});

const GitDiffParamsSchema = z.object({
  path: z.string().min(1),
  staged: z.boolean().default(false)
});

const GitPathsParamsSchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(200)
});

const GitCommitParamsSchema = z.object({
  message: z.string().min(1).max(2_000)
});

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown
  ) {
    super(message);
  }
}

export interface AgentRunner {
  run(scope: ResearchScope): Promise<unknown>;
}

export interface AgentChatRunner {
  prompt(
    prompt: string,
    scope: ResearchScope,
    onEvent: (event: { type: string; [key: string]: unknown }) => void
  ): Promise<unknown>;
  setApiKey(apiKey: string): void;
  reset(): void;
  restoreSession(sessionFile: string | null): void;
  configureProvider(input: {
    provider: "deepseek" | "openai-compatible";
    baseUrl: string;
    model: string;
    apiKey?: string;
  }): void;
  abort?(): Promise<void>;
  contextUsage?(): {
    tokens: number | null;
    percent: number | null;
    contextWindow: number;
  } | null;
  compact?(customInstructions?: string): Promise<void>;
  listSessions?(): Promise<
    Array<{
      file: string;
      id: string;
      title: string;
      startedAt: string;
      size: number;
      messages: number;
    }>
  >;
  readSession?(
    file: string
  ): Promise<Array<{ role: "user" | "assistant"; text: string }>>;
}

export interface ApprovalResponder {
  respond(id: string, approved: boolean): boolean;
  request?(input: {
    toolName: string;
    title: string;
    detail: string;
    consequence?: string;
  }): Promise<boolean>;
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
  git?: GitService;
  lsp?: LspService;
  research?: ResearchService;
  permissions?: PermissionService;
  emit?: (event: RpcEvent) => void;
}

export class RpcServer {
  private seq = 0;

  constructor(private readonly options: RpcServerOptions) {}

  async handleLine(line: string): Promise<string | null> {
    const trimmed = line.trim();
    if (trimmed.length === 0) return null;

    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      return this.failure(null, ErrorCode.PARSE_ERROR, "无法解析 JSON");
    }

    const parsed = RpcRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return this.failure(
        extractId(raw),
        ErrorCode.INVALID_REQUEST,
        "无效的 JSON-RPC 请求"
      );
    }

    const request = parsed.data;
    try {
      const result = await this.dispatch(request);
      return JSON.stringify({
        jsonrpc: "2.0",
        id: request.id ?? null,
        result
      });
    } catch (error) {
      if (error instanceof RpcError) {
        return this.failure(request.id ?? null, error.code, error.message, error.data);
      }
      if (error instanceof WorkspaceAccessError) {
        return this.failure(
          request.id ?? null,
          ErrorCode.WORKSPACE_DENIED,
          error.message
        );
      }
      return this.failure(
        request.id ?? null,
        ErrorCode.INTERNAL_ERROR,
        error instanceof Error ? error.message : "内部错误"
      );
    }
  }

  private async dispatch(request: RpcRequest): Promise<unknown> {
    switch (request.method) {
      case "system.hello":
        return {
          name: "research-workbench-core",
          version: "0.1.0",
          workspaceRoot: this.options.workspaceRoot,
          projectId: projectIdFromWorkspace(this.options.workspaceRoot),
          capabilities: ["skills", "domain", "artifacts"]
        };
      case "skills.list":
        return {
          skills: this.options.skills.list().map((skill) => ({
            id: skill.id,
            name: skill.name,
            description: skill.description,
            version: skill.version,
            status: skill.status,
            allowedTools: skill.allowedTools,
            lastReviewed: skill.lastReviewed
          }))
        };
      case "skills.run": {
        const params = SkillsRunParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "skills.run 参数无效",
            params.error.flatten()
          );
        }
        const { skillId, input } = params.data;
        this.emit("skill.started", { skillId, scope: input.scope });
        try {
          const result = await this.options.skills.run(skillId, input);
          for (const artifact of result.artifacts) {
            this.emit("artifact.created", {
              skillId,
              artifactId: artifact.id,
              path: artifact.path,
              sha256: artifact.sha256
            });
          }
          this.emit("skill.completed", {
            skillId,
            status: result.status,
            warnings: result.warnings.length
          });
          return result;
        } catch (error) {
          this.emit("skill.failed", {
            skillId,
            message: error instanceof Error ? error.message : "未知错误"
          });
          if (error instanceof WorkspaceAccessError) {
            throw new RpcError(ErrorCode.WORKSPACE_DENIED, error.message);
          }
          throw new RpcError(
            ErrorCode.SKILL_FAILED,
            error instanceof Error ? error.message : "Skill 执行失败",
            { skillId }
          );
        }
      }
      case "domain.observe": {
        const params = DomainParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "domain.observe 参数无效"
          );
        }
        return this.options.environment.observe(params.data.scope);
      }
      case "domain.actions": {
        const params = DomainParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "domain.actions 参数无效"
          );
        }
        return {
          actions: await this.options.environment.listActions(params.data.scope)
        };
      }
      case "domain.apply": {
        const params = DomainApplyParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "domain.apply 参数无效"
          );
        }
        return this.options.environment.apply(
          params.data.scope,
          params.data.actionId
        );
      }
      case "workspace.tree": {
        if (!this.options.workspace) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "工作区服务尚未接入");
        }
        return this.options.workspace.tree();
      }
      case "workspace.read": {
        if (!this.options.workspace) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "工作区服务尚未接入");
        }
        const params = WorkspaceReadParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(ErrorCode.INVALID_PARAMS, "workspace.read 参数无效");
        }
        try {
          return await this.options.workspace.read(params.data.path);
        } catch (error) {
          if (error instanceof WorkspaceAccessError) {
            throw new RpcError(ErrorCode.WORKSPACE_DENIED, error.message);
          }
          throw new RpcError(
            ErrorCode.INTERNAL_ERROR,
            error instanceof Error ? error.message : "读取文件失败"
          );
        }
      }
      case "workspace.write": {
        if (!this.options.workspace) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "工作区服务尚未接入");
        }
        const params = WorkspaceWriteParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(ErrorCode.INVALID_PARAMS, "workspace.write 参数无效");
        }
        try {
          return await this.options.workspace.write(
            params.data.path,
            params.data.content
          );
        } catch (error) {
          if (error instanceof WorkspaceAccessError) {
            throw new RpcError(ErrorCode.WORKSPACE_DENIED, error.message);
          }
          throw new RpcError(
            ErrorCode.INTERNAL_ERROR,
            error instanceof Error ? error.message : "写入文件失败"
          );
        }
      }
      case "terminal.run": {
        if (!this.options.workspace) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "工作区服务尚未接入");
        }
        const params = TerminalRunParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(ErrorCode.INVALID_PARAMS, "terminal.run 参数无效");
        }
        const result = await this.options.workspace.run(params.data.command);
        await this.maybeAutoCommit("chore: terminal command changes");
        return result;
      }
      case "workspace.uploads": {
        if (!this.options.workspace) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "工作区服务尚未接入");
        }
        return { uploads: await this.options.workspace.listUploads() };
      }
      case "workspace.deleteUpload": {
        if (!this.options.workspace) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "工作区服务尚未接入");
        }
        const params = UploadsDeleteSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "workspace.deleteUpload 参数无效"
          );
        }
        await this.options.workspace.deleteUpload(params.data.path);
        return { uploads: await this.options.workspace.listUploads() };
      }
      case "experiments.list": {
        if (!this.options.experiments) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "实验记录尚未接入");
        }
        return this.options.experiments.list();
      }
      case "experiments.get": {
        if (!this.options.experiments) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "实验记录尚未接入");
        }
        const params = ExperimentGetParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(ErrorCode.INVALID_PARAMS, "experiments.get 参数无效");
        }
        const record = this.options.experiments.get(params.data.id);
        if (!record) {
          throw new RpcError(ErrorCode.INVALID_PARAMS, "实验记录不存在");
        }
        return record;
      }
      case "experiments.create": {
        if (!this.options.experiments) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "实验记录尚未接入");
        }
        const params = ExperimentCreateSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(ErrorCode.INVALID_PARAMS, "experiments.create 参数无效");
        }
        const created = this.options.experiments.create({
          title: params.data.title,
          goal: params.data.goal,
          hypothesis: params.data.hypothesis,
          design: params.data.design,
          metrics: params.data.metrics ?? "",
          seeds: params.data.seeds,
          scope: params.data.scope
        });
        const record = this.options.experiments.finish(
          created.id,
          {
            metrics: params.data.metrics,
            conclusion: params.data.conclusion,
            reusable: params.data.reusable,
            status: "archived"
          },
          []
        );
        this.emit("experiments.changed", {
          count: this.options.experiments.list().length
        });
        return record;
      }
      case "experiments.confirmTaskbook": {
        if (!this.options.experiments) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "实验记录尚未接入");
        }
        const params = ResearchIdSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "experiments.confirmTaskbook 参数无效"
          );
        }
        const record = this.options.experiments.confirmTaskbook(params.data.id);
        const recordScope = record.scope as { taskId?: string } | null;
        this.options.milestones?.record({
          taskId: recordScope?.taskId,
          kind: "confirm",
          title: `确认任务书：${record.title}`,
          experimentId: record.id
        });
        this.emit("experiments.changed", {
          count: this.options.experiments.list().length
        });
        return record;
      }
      case "experiments.update": {
        if (!this.options.experiments) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "实验记录尚未接入");
        }
        const params = ExperimentUpdateSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(ErrorCode.INVALID_PARAMS, "experiments.update 参数无效");
        }
        const record = this.options.experiments.update(params.data.id, {
          conclusion: params.data.conclusion,
          reusable: params.data.reusable,
          confirmed: params.data.confirmed
        });
        this.emit("experiments.changed", {
          count: this.options.experiments.list().length
        });
        return record;
      }
      case "research.tree": {
        if (!this.options.research) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
        }
        return this.options.research.tree();
      }
      case "research.createTopic": {
        if (!this.options.research) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
        }
        const params = ResearchTopicCreateSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "research.createTopic 参数无效"
          );
        }
        const topic = await this.options.research.createTopic(
          params.data.title,
          params.data.description
        );
        return { topic, topics: await this.options.research.tree() };
      }
      case "research.updateTopic": {
        if (!this.options.research) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
        }
        const params = ResearchTopicUpdateSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "research.updateTopic 参数无效"
          );
        }
        const topic = await this.options.research.updateTopic(
          params.data.topicId,
          { title: params.data.title, description: params.data.description }
        );
        return { topic, topics: await this.options.research.tree() };
      }
      case "research.addLiterature": {
        if (!this.options.research) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
        }
        const params = ResearchLiteratureAddSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "research.addLiterature 参数无效"
          );
        }
        const literature = await this.options.research.addLiterature(
          params.data.topicId,
          params.data
        );
        return { literature, topics: await this.options.research.tree() };
      }
      case "research.removeLiterature": {
        if (!this.options.research) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
        }
        const params = ResearchLiteratureRemoveSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "research.removeLiterature 参数无效"
          );
        }
        const topic = await this.options.research.removeLiterature(
          params.data.topicId,
          params.data.literatureId
        );
        return { topic, topics: await this.options.research.tree() };
      }
      case "research.createRoute": {
        if (!this.options.research) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
        }
        const params = ResearchRouteCreateSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "research.createRoute 参数无效"
          );
        }
        const route = await this.options.research.createRoute(
          params.data.topicId,
          params.data.title
        );
        return { route, topics: await this.options.research.tree() };
      }
      case "research.setRouteStatus": {
        if (!this.options.research) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
        }
        const params = ResearchRouteStatusSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "research.setRouteStatus 参数无效"
          );
        }
        const route = await this.options.research.setRouteStatus(
          params.data.routeId,
          params.data.status
        );
        return { route, topics: await this.options.research.tree() };
      }
      case "research.createTask": {
        if (!this.options.research) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
        }
        const params = ResearchCreateTaskSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "research.createTask 参数无效"
          );
        }
        const task = await this.options.research.createTask(
          params.data.routeId,
          params.data.title
        );
        return { task, topics: await this.options.research.tree() };
      }
      case "research.setTaskStatus": {
        if (!this.options.research) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
        }
        const params = ResearchTaskStatusSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "research.setTaskStatus 参数无效"
          );
        }
        const task = await this.options.research.setTaskStatus(
          params.data.taskId,
          params.data.status
        );
        return { task, topics: await this.options.research.tree() };
      }
      case "research.deleteTopic": {
        if (!this.options.research) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
        }
        const params = ResearchIdSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "research.deleteTopic 参数无效"
          );
        }
        await this.options.research.deleteTopic(params.data.id);
        return { topics: await this.options.research.tree() };
      }
      case "research.deleteRoute": {
        if (!this.options.research) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
        }
        const params = ResearchIdSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "research.deleteRoute 参数无效"
          );
        }
        await this.options.research.deleteRoute(params.data.id);
        return { topics: await this.options.research.tree() };
      }
      case "research.deleteTask": {
        if (!this.options.research) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
        }
        const params = ResearchIdSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "research.deleteTask 参数无效"
          );
        }
        await this.options.research.deleteTask(params.data.id);
        return { topics: await this.options.research.tree() };
      }
      case "lsp.start": {
        if (!this.options.lsp) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "LSP 尚未接入");
        }
        return this.options.lsp.start();
      }
      case "lsp.status": {
        return (
          this.options.lsp?.status() ?? {
            running: false,
            url: null,
            workspace: this.options.workspaceRoot,
            error: "LSP 尚未接入"
          }
        );
      }
      case "git.configure": {
        if (!this.options.git) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Git 尚未接入");
        }
        const params = GitConfigureParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(ErrorCode.INVALID_PARAMS, "git.configure 参数无效");
        }
        this.options.git.configure(params.data);
        let version: string | null = null;
        if (params.data.binary !== undefined) {
          try {
            version = await this.options.git.version();
          } catch (error) {
            throw new RpcError(
              ErrorCode.INVALID_PARAMS,
              error instanceof Error ? error.message : "Git 可执行文件不可用"
            );
          }
        }
        return {
          configured: true,
          autoCommit: this.options.git.isAutoCommitEnabled(),
          version
        };
      }
      case "git.status": {
        if (!this.options.git) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Git 尚未接入");
        }
        return this.options.git.status();
      }
      case "git.diff": {
        if (!this.options.git) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Git 尚未接入");
        }
        const params = GitDiffParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(ErrorCode.INVALID_PARAMS, "git.diff 参数无效");
        }
        return {
          path: params.data.path,
          staged: params.data.staged,
          diff: await this.options.git.diff(
            params.data.path,
            params.data.staged
          )
        };
      }
      case "git.stage": {
        if (!this.options.git) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Git 尚未接入");
        }
        const params = GitPathsParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(ErrorCode.INVALID_PARAMS, "git.stage 参数无效");
        }
        await this.options.git.stage(params.data.paths);
        return { ok: true };
      }
      case "git.unstage": {
        if (!this.options.git) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Git 尚未接入");
        }
        const params = GitPathsParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(ErrorCode.INVALID_PARAMS, "git.unstage 参数无效");
        }
        await this.options.git.unstage(params.data.paths);
        return { ok: true };
      }
      case "git.commit": {
        if (!this.options.git) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Git 尚未接入");
        }
        const params = GitCommitParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(ErrorCode.INVALID_PARAMS, "git.commit 参数无效");
        }
        return this.options.git.commit(params.data.message);
      }
      case "git.log": {
        if (!this.options.git) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Git 尚未接入");
        }
        return this.options.git.log();
      }
      case "agent.spike": {
        if (!this.options.agent) {
          throw new RpcError(
            ErrorCode.METHOD_NOT_FOUND,
            "Agent runtime 尚未接入"
          );
        }
        const params = DomainParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(ErrorCode.INVALID_PARAMS, "agent.spike 参数无效");
        }
        this.emit("agent.started", { scope: params.data.scope });
        try {
          const result = await this.options.agent.run(params.data.scope);
          this.emit("agent.completed", { scope: params.data.scope });
          return result;
        } catch (error) {
          this.emit("agent.failed", {
            message: error instanceof Error ? error.message : "未知错误"
          });
          throw new RpcError(
            ErrorCode.SKILL_FAILED,
            error instanceof Error ? error.message : "Agent 执行失败"
          );
        }
      }
      case "agent.setApiKey": {
        if (!this.options.chat) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Agent chat 尚未接入");
        }
        const params = AgentApiKeyParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "agent.setApiKey 参数无效"
          );
        }
        const key = params.data.apiKey.trim();
        if (key.length > 0 && key.length < 8) {
          throw new RpcError(ErrorCode.INVALID_PARAMS, "API Key 长度无效");
        }
        this.options.chat.setApiKey(key);
        return { configured: key.length > 0 };
      }
      case "agent.reset": {
        this.options.chat?.reset();
        return { reset: true };
      }
      case "agent.restoreSession": {
        if (!this.options.chat) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Agent chat 尚未接入");
        }
        const params = AgentRestoreParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "agent.restoreSession 参数无效"
          );
        }
        this.options.chat.restoreSession(params.data.sessionFile ?? null);
        return { restored: Boolean(params.data.sessionFile) };
      }
      case "agent.abort": {
        if (!this.options.chat?.abort) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Agent 中断尚未接入");
        }
        await this.options.chat.abort();
        return { aborted: true };
      }
      case "agent.contextUsage": {
        return this.options.chat?.contextUsage?.() ?? null;
      }
      case "agent.compact": {
        if (!this.options.chat?.compact) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "压缩尚未接入");
        }
        const params = CompactSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(ErrorCode.INVALID_PARAMS, "agent.compact 参数无效");
        }
        await this.options.chat.compact(params.data.instructions);
        return { compacted: true };
      }
      case "facts.list": {
        const params = FactsListSchema.safeParse(request.params ?? {});
        if (!params.success) {
          throw new RpcError(ErrorCode.INVALID_PARAMS, "facts.list 参数无效");
        }
        return {
          facts: this.options.facts?.list({ topicId: params.data.topicId }) ?? []
        };
      }
      case "facts.update": {
        if (!this.options.facts) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "事实存储尚未接入");
        }
        const params = FactStatusSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(ErrorCode.INVALID_PARAMS, "facts.update 参数无效");
        }
        return this.options.facts.setStatus(params.data.id, params.data.status);
      }
      case "agent.sessions": {
        if (!this.options.chat?.listSessions) {
          return { sessions: [] };
        }
        return { sessions: await this.options.chat.listSessions() };
      }
      case "milestones.list": {
        const params = MilestonesListSchema.safeParse(request.params ?? {});
        if (!params.success) {
          throw new RpcError(ErrorCode.INVALID_PARAMS, "milestones.list 参数无效");
        }
        return {
          milestones:
            this.options.milestones?.list({
              taskId: params.data.taskId,
              limit: params.data.limit
            }) ?? []
        };
      }
      case "agent.sessionMessages": {
        if (!this.options.chat?.readSession) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "会话读取尚未接入");
        }
        const params = SessionFileSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "agent.sessionMessages 参数无效"
          );
        }
        return {
          messages: await this.options.chat.readSession(params.data.file)
        };
      }
      case "permissions.get": {
        return this.options.permissions?.snapshot() ?? { level: "workspace-write" };
      }
      case "permissions.configure": {
        if (!this.options.permissions) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "权限服务尚未接入");
        }
        const params = PermissionsParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "permissions.configure 参数无效"
          );
        }
        return this.options.permissions.configure(params.data);
      }
      case "agent.configureProvider": {
        if (!this.options.chat) {
          throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Agent chat 尚未接入");
        }
        const params = AgentProviderParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "agent.configureProvider 参数无效"
          );
        }
        if (
          params.data.provider === "openai-compatible" &&
          !isHttpUrl(params.data.baseUrl)
        ) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "OpenAI 兼容 Base URL 必须是 http(s) 地址"
          );
        }
        this.options.chat.configureProvider(params.data);
        return {
          configured: true,
          provider: params.data.provider,
          model: params.data.model
        };
      }
      case "agent.chat": {
        if (!this.options.chat) {
          throw new RpcError(
            ErrorCode.METHOD_NOT_FOUND,
            "Agent chat 尚未接入"
          );
        }
        const params = AgentChatParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(ErrorCode.INVALID_PARAMS, "agent.chat 参数无效");
        }
        try {
          const scope = params.data.scope;
          const result = await this.options.chat.prompt(
            params.data.prompt,
            scope,
            (event) => {
              this.emit(`agent.${event.type}`, event);
              // Cards are the only durable trace of what the turn produced, so
              // they double as milestones for the task timeline.
              if (event.type === "card" && this.options.milestones) {
                const card = (event as { card?: AgentCard }).card;
                if (card) {
                  this.options.milestones.record({
                    taskId: scope.taskId,
                    kind: card.kind,
                    title:
                      card.kind === "taskbook"
                        ? `任务书：${card.title}`
                        : `归档：${card.title}`,
                    experimentId: card.experimentId,
                    payload: card
                  });
                }
              }
            }
          );
          if (this.options.experiments) {
            this.emit("experiments.changed", {
              count: this.options.experiments.list().length
            });
          }
          await this.maybeAutoCommit("chore: agent changes");
          return result;
        } catch (error) {
          throw new RpcError(
            ErrorCode.SKILL_FAILED,
            error instanceof Error ? error.message : "Agent 对话失败"
          );
        }
      }
      case "approval.respond": {
        if (!this.options.approvals) {
          throw new RpcError(
            ErrorCode.METHOD_NOT_FOUND,
            "审批通道尚未接入"
          );
        }
        const params = ApprovalRespondParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "approval.respond 参数无效"
          );
        }
        const handled = this.options.approvals.respond(
          params.data.id,
          params.data.approved
        );
        if (!handled) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            "审批请求不存在或已过期"
          );
        }
        return { ok: true };
      }
      default:
        throw new RpcError(
          ErrorCode.METHOD_NOT_FOUND,
          `未知方法：${request.method}`
        );
    }
  }

  emitEvent(type: string, payload: unknown): void {
    this.emit(type, payload);
  }

  private async maybeAutoCommit(message: string): Promise<void> {
    if (!this.options.git?.isAutoCommitEnabled()) return;
    try {
      const result = await this.options.git.autoCommit(message);
      if (result) this.emit("git.committed", result);
    } catch (error) {
      this.emit("git.auto-commit-failed", {
        message: error instanceof Error ? error.message : "自动提交失败"
      });
    }
  }

  private emit(type: string, payload: unknown): void {
    this.seq += 1;
    this.options.emit?.({
      jsonrpc: "2.0",
      method: "event",
      params: {
        seq: this.seq,
        type,
        at: new Date().toISOString(),
        payload
      }
    });
  }

  private failure(
    id: RpcId,
    code: number,
    message: string,
    data?: unknown
  ): string {
    return JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code, message, ...(data === undefined ? {} : { data }) }
    });
  }
}

function extractId(value: unknown): RpcId {
  if (
    value !== null &&
    typeof value === "object" &&
    "id" in value &&
    (typeof value.id === "string" || typeof value.id === "number")
  ) {
    return value.id;
  }
  return null;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
