import { ErrorCode } from "@research-workbench/contracts";
import {
  WorkspaceAccessError,
  WorkspaceConflictError
} from "../../workspace.js";
import {
  UploadsDeleteSchema,
  TerminalRunParamsSchema,
  WorkspaceReadParamsSchema,
  WorkspaceWriteParamsSchema
} from "@research-workbench/contracts";
import { RpcError, type RpcContext, type RpcHandler } from "../context.js";
export function workspaceHandlers(
  context: RpcContext
): Record<string, RpcHandler> {
  const { options, emit } = context;
  return {
    "workspace.tree": async (_request) => {
      if (!options.workspace) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "工作区服务尚未接入");
      }
      return options.workspace.tree();
    },
    "workspace.read": async (request) => {
      if (!options.workspace) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "工作区服务尚未接入");
      }
      const params = WorkspaceReadParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(ErrorCode.INVALID_PARAMS, "workspace.read 参数无效");
      }
      try {
        return await options.workspace.read(params.data.path);
      } catch (error) {
        if (error instanceof WorkspaceAccessError) {
          throw new RpcError(ErrorCode.WORKSPACE_DENIED, error.message);
        }
        throw new RpcError(
          ErrorCode.INTERNAL_ERROR,
          error instanceof Error ? error.message : "读取文件失败"
        );
      }
    },
    "workspace.write": async (request) => {
      if (!options.workspace) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "工作区服务尚未接入");
      }
      const params = WorkspaceWriteParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "workspace.write 参数无效"
        );
      }
      try {
        return await options.workspace.write(
          params.data.path,
          params.data.content,
          params.data.expectedSha256
        );
      } catch (error) {
        if (error instanceof WorkspaceConflictError) throw error;
        if (error instanceof WorkspaceAccessError) {
          throw new RpcError(ErrorCode.WORKSPACE_DENIED, error.message);
        }
        throw new RpcError(
          ErrorCode.INTERNAL_ERROR,
          error instanceof Error ? error.message : "写入文件失败"
        );
      }
    },
    "terminal.cancel": async (_request) => {
      return { canceled: options.workspace?.cancelCommands() ?? 0 };
    },
    "terminal.run": async (request) => {
      if (!options.workspace) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "工作区服务尚未接入");
      }
      const params = TerminalRunParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(ErrorCode.INVALID_PARAMS, "terminal.run 参数无效");
      }
      const result = await options.workspace.run(params.data.command);
      // Shell changes cannot be safely attributed; leave them for the Git review panel.
      if (options.git?.isAutoCommitEnabled())
        emit("git.auto-commit-skipped", {
          reason:
            result.exitCode === 0 && !result.timedOut && !result.canceled
              ? "命令改动需在 Git 面板审阅"
              : "命令失败或取消，不自动提交"
        });
      return result;
    },
    "workspace.uploads": async (_request) => {
      if (!options.workspace) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "工作区服务尚未接入");
      }
      return { uploads: await options.workspace.listUploads() };
    },
    "workspace.deleteUpload": async (request) => {
      if (!options.workspace) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "工作区服务尚未接入");
      }
      const params = UploadsDeleteSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "workspace.deleteUpload 参数无效"
        );
      }
      await options.workspace.deleteUpload(params.data.path);
      return { uploads: await options.workspace.listUploads() };
    }
  };
}
