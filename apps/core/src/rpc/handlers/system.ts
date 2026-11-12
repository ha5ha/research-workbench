import { ErrorCode } from "@research-workbench/contracts";
import { projectIdFromWorkspace } from "../../project-id.js";
import { WorkspaceAccessError } from "../../workspace.js";
import {
  SkillsRunParamsSchema,
  DomainParamsSchema,
  DomainApplyParamsSchema
} from "@research-workbench/contracts";
import { RpcError, type RpcContext, type RpcHandler } from "../context.js";
export function systemHandlers(
  context: RpcContext
): Record<string, RpcHandler> {
  const { options, emit } = context;
  return {
    "system.hello": async (_request) => {
      return {
        name: "research-workbench-core",
        version: "0.1.0",
        workspaceRoot: options.workspaceRoot,
        projectId: projectIdFromWorkspace(options.workspaceRoot),
        capabilities: ["skills", "domain", "artifacts"]
      };
    },
    "skills.list": async (_request) => {
      return {
        skills: options.skills.list().map((skill) => ({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          version: skill.version,
          status: skill.status,
          allowedTools: skill.allowedTools,
          lastReviewed: skill.lastReviewed
        }))
      };
    },
    "skills.run": async (request) => {
      const params = SkillsRunParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "skills.run 参数无效",
          params.error.flatten()
        );
      }
      const { skillId, input } = params.data;
      emit("skill.started", { skillId, scope: input.scope });
      try {
        const result = await options.skills.run(skillId, input);
        for (const artifact of result.artifacts) {
          emit("artifact.created", {
            skillId,
            artifactId: artifact.id,
            path: artifact.path,
            sha256: artifact.sha256
          });
        }
        emit("skill.completed", {
          skillId,
          status: result.status,
          warnings: result.warnings.length
        });
        return result;
      } catch (error) {
        emit("skill.failed", {
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
    },
    "domain.observe": async (request) => {
      const params = DomainParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(ErrorCode.INVALID_PARAMS, "domain.observe 参数无效");
      }
      return options.environment.observe(params.data.scope);
    },
    "domain.actions": async (request) => {
      const params = DomainParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(ErrorCode.INVALID_PARAMS, "domain.actions 参数无效");
      }
      return {
        actions: await options.environment.listActions(params.data.scope)
      };
    },
    "domain.apply": async (request) => {
      const params = DomainApplyParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(ErrorCode.INVALID_PARAMS, "domain.apply 参数无效");
      }
      return options.environment.apply(params.data.scope, params.data.actionId);
    },
    "lsp.start": async (_request) => {
      if (!options.lsp) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "LSP 尚未接入");
      }
      return options.lsp.start();
    },
    "lsp.status": async (_request) => {
      return (
        options.lsp?.status() ?? {
          running: false,
          url: null,
          workspace: options.workspaceRoot,
          error: "LSP 尚未接入"
        }
      );
    }
  };
}
