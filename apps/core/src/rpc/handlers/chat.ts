import { trackWorkspaceWrites } from "../../workspace-mutations.js";
import { ErrorCode } from "@research-workbench/contracts";
import type { AgentCard } from "../../cards.js";
import {
  DomainParamsSchema,
  AgentChatParamsSchema,
  AgentApiKeyParamsSchema,
  AgentProviderParamsSchema,
  SessionFileSchema,
  CompactSchema,
  PermissionsParamsSchema,
  AgentRestoreParamsSchema,
  ApprovalRespondParamsSchema
} from "@research-workbench/contracts";
import { RpcError, type RpcContext, type RpcHandler } from "../context.js";
export function chatHandlers(context: RpcContext): Record<string, RpcHandler> {
  const { options, emit, maybeAutoCommit } = context;
  return {
    "agent.spike": async (request) => {
      if (!options.agent) {
        throw new RpcError(
          ErrorCode.METHOD_NOT_FOUND,
          "Agent runtime 尚未接入"
        );
      }
      const params = DomainParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(ErrorCode.INVALID_PARAMS, "agent.spike 参数无效");
      }
      emit("agent.started", { scope: params.data.scope });
      try {
        const result = await options.agent.run(params.data.scope);
        emit("agent.completed", { scope: params.data.scope });
        return result;
      } catch (error) {
        emit("agent.failed", {
          message: error instanceof Error ? error.message : "未知错误"
        });
        throw new RpcError(
          ErrorCode.SKILL_FAILED,
          error instanceof Error ? error.message : "Agent 执行失败"
        );
      }
    },
    "agent.setApiKey": async (request) => {
      if (!options.chat) {
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
      await options.chat.setApiKey(key);
      return { configured: key.length > 0 };
    },
    "agent.reset": async (_request) => {
      await options.chat?.reset();
      return { reset: true };
    },
    "agent.restoreSession": async (request) => {
      if (!options.chat) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Agent chat 尚未接入");
      }
      const params = AgentRestoreParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "agent.restoreSession 参数无效"
        );
      }
      await options.chat.restoreSession(params.data.sessionFile ?? null);
      return { restored: Boolean(params.data.sessionFile) };
    },
    "agent.abort": async (_request) => {
      if (!options.chat?.abort) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Agent 中断尚未接入");
      }
      await options.chat.abort();
      return { aborted: true };
    },
    "agent.contextUsage": async (_request) => {
      return options.chat?.contextUsage?.() ?? null;
    },
    "agent.compact": async (request) => {
      if (!options.chat?.compact) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "压缩尚未接入");
      }
      const params = CompactSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(ErrorCode.INVALID_PARAMS, "agent.compact 参数无效");
      }
      await options.chat.compact(params.data.instructions);
      return { compacted: true };
    },
    "agent.sessions": async (_request) => {
      if (!options.chat?.listSessions) {
        return { sessions: [] };
      }
      return { sessions: await options.chat.listSessions() };
    },
    "agent.sessionMessages": async (request) => {
      if (!options.chat?.readSession) {
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
        messages: await options.chat.readSession(params.data.file)
      };
    },
    "permissions.get": async (_request) => {
      return options.permissions?.snapshot() ?? { level: "workspace-write" };
    },
    "permissions.configure": async (request) => {
      if (!options.permissions) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "权限服务尚未接入");
      }
      const params = PermissionsParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "permissions.configure 参数无效"
        );
      }
      return options.permissions.configure(params.data);
    },
    "agent.configureProvider": async (request) => {
      if (!options.chat) {
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
      await options.chat.configureProvider(params.data);
      return {
        configured: true,
        provider: params.data.provider,
        model: params.data.model
      };
    },
    "agent.chat": async (request) => {
      if (!options.chat) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Agent chat 尚未接入");
      }
      const params = AgentChatParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(ErrorCode.INVALID_PARAMS, "agent.chat 参数无效");
      }
      try {
        const scope = params.data.scope;
        const before = await options.git?.status();
        const { result, transaction } = await trackWorkspaceWrites(() =>
          options.chat!.prompt(params.data.prompt, scope, (event) => {
            emit(`agent.${event.type}`, {
              ...event,
              conversationId:
                params.data.conversationId ?? scope.taskId ?? scope.projectId,
              turnId: params.data.turnId ?? String(request.id)
            });
            // Cards are the only durable trace of what the turn produced, so
            // they double as milestones for the task timeline.
            if (event.type === "card" && options.milestones) {
              const card = (event as { card?: AgentCard }).card;
              if (card) {
                options.milestones.record({
                  taskId: scope.taskId,
                  kind: card.kind,
                  title:
                    card.kind === "taskbook"
                      ? `任务书：${card.title}`
                      : card.kind === "run_plan"
                        ? `运行方案：${card.title}`
                        : `归档：${card.title}`,
                  experimentId: card.experimentId,
                  payload: card
                });
              }
            }
          })
        );
        if (options.experiments) {
          emit("experiments.changed", {
            count: options.experiments.list().length
          });
        }
        if (before)
          await maybeAutoCommit("chore: agent changes", before, transaction);
        return result;
      } catch (error) {
        throw new RpcError(
          ErrorCode.SKILL_FAILED,
          error instanceof Error ? error.message : "Agent 对话失败"
        );
      }
    },
    "approval.respond": async (request) => {
      if (!options.approvals) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "审批通道尚未接入");
      }
      const params = ApprovalRespondParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "approval.respond 参数无效"
        );
      }
      const handled = options.approvals.respond(
        params.data.id,
        params.data.approved
      );
      if (!handled) {
        throw new RpcError(ErrorCode.INVALID_PARAMS, "审批请求不存在或已过期");
      }
      return { ok: true };
    }
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
