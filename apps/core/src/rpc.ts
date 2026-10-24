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
import type { ExperimentService } from "./experiment-service.js";
import type { GitService } from "./git-service.js";
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
  experiments?: ExperimentService;
  git?: GitService;
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
        await this.requireApproval({
          toolName: "workspace.write",
          title: "写入工作区文件",
          detail: params.data.path,
          consequence: "覆盖或创建工作区文件；不会修改工作区之外的内容"
        });
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
        await this.requireApproval({
          toolName: "terminal.run",
          title: "执行终端命令",
          detail: params.data.command,
          consequence: "在本地工作区执行 shell 命令，可能修改文件或访问网络"
        });
        const session = await this.options.experiments?.begin(
          "terminal",
          `终端：${params.data.command.slice(0, 80)}`
        );
        try {
          const result = await this.options.workspace.run(params.data.command);
          const experiment = session
            ? await this.options.experiments?.finish(session)
            : undefined;
          if (experiment) {
            this.emit("experiment.completed", experiment);
          }
          return experiment ? { ...result, runId: experiment.id } : result;
        } catch (error) {
          if (session) {
            const experiment = await this.options.experiments?.finish(
              session,
              "failed"
            );
            if (experiment) this.emit("experiment.completed", experiment);
          }
          throw error;
        }
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
        const record = await this.options.experiments.get(params.data.id);
        if (!record) {
          throw new RpcError(ErrorCode.INVALID_PARAMS, "实验记录不存在");
        }
        return record;
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
        await this.requireApproval({
          toolName: "git.commit",
          title: "提交 Git 变更",
          detail: params.data.message,
          consequence: "创建本地 commit；不会推送到远端"
        });
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
          const session = await this.options.experiments?.begin(
            "agent",
            `Agent：${params.data.prompt.slice(0, 80)}`,
            params.data.scope
          );
          try {
            const result = await this.options.chat.prompt(
              params.data.prompt,
              params.data.scope,
              (event) => {
                this.emit(`agent.${event.type}`, event);
              }
            );
            if (!session) return result;
            const experiment = await this.options.experiments?.finish(session);
            if (experiment) this.emit("experiment.completed", experiment);
            return {
              ...(result as Record<string, unknown>),
              runId: experiment?.id ?? null
            };
          } catch (error) {
            if (session) {
              const experiment = await this.options.experiments?.finish(
                session,
                "failed"
              );
              if (experiment) this.emit("experiment.completed", experiment);
            }
            throw error;
          }
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

  private async requireApproval(input: {
    toolName: string;
    title: string;
    detail: string;
    consequence: string;
  }): Promise<void> {
    if (!this.options.approvals) {
      throw new RpcError(ErrorCode.APPROVAL_REQUIRED, "审批通道尚未接入");
    }
    const approved = await this.options.approvals.request?.(input);
    if (approved === undefined) {
      throw new RpcError(ErrorCode.APPROVAL_REQUIRED, "审批通道不支持请求");
    }
    if (!approved) {
      throw new RpcError(ErrorCode.APPROVAL_DENIED, "用户拒绝或审批超时");
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
