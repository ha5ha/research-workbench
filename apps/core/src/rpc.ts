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
import type { SkillService } from "./skill-service.js";
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

export interface RpcServerOptions {
  workspaceRoot: string;
  skills: SkillService;
  environment: ResearchEnvironment;
  agent?: AgentRunner;
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
      default:
        throw new RpcError(
          ErrorCode.METHOD_NOT_FOUND,
          `未知方法：${request.method}`
        );
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
