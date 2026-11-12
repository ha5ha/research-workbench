import { ErrorCode } from "@research-workbench/contracts";
import {
  GitConfigureParamsSchema,
  GitDiffParamsSchema,
  GitPathsParamsSchema,
  GitCommitParamsSchema
} from "@research-workbench/contracts";
import { RpcError, type RpcContext, type RpcHandler } from "../context.js";
export function gitHandlers(context: RpcContext): Record<string, RpcHandler> {
  const { options } = context;
  return {
    "git.configure": async (request) => {
      if (!options.git) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Git 尚未接入");
      }
      const params = GitConfigureParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(ErrorCode.INVALID_PARAMS, "git.configure 参数无效");
      }
      options.git.configure(params.data);
      let version: string | null = null;
      if (params.data.binary !== undefined) {
        try {
          version = await options.git.version();
        } catch (error) {
          throw new RpcError(
            ErrorCode.INVALID_PARAMS,
            error instanceof Error ? error.message : "Git 可执行文件不可用"
          );
        }
      }
      return {
        configured: true,
        autoCommit: options.git.isAutoCommitEnabled(),
        version
      };
    },
    "git.status": async (_request) => {
      if (!options.git) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Git 尚未接入");
      }
      return options.git.status();
    },
    "git.diff": async (request) => {
      if (!options.git) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Git 尚未接入");
      }
      const params = GitDiffParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(ErrorCode.INVALID_PARAMS, "git.diff 参数无效");
      }
      return {
        path: params.data.path,
        staged: params.data.staged,
        diff: await options.git.diff(params.data.path, params.data.staged)
      };
    },
    "git.stage": async (request) => {
      if (!options.git) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Git 尚未接入");
      }
      const params = GitPathsParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(ErrorCode.INVALID_PARAMS, "git.stage 参数无效");
      }
      await options.git.stage(params.data.paths);
      return { ok: true };
    },
    "git.unstage": async (request) => {
      if (!options.git) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Git 尚未接入");
      }
      const params = GitPathsParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(ErrorCode.INVALID_PARAMS, "git.unstage 参数无效");
      }
      await options.git.unstage(params.data.paths);
      return { ok: true };
    },
    "git.commit": async (request) => {
      if (!options.git) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Git 尚未接入");
      }
      const params = GitCommitParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(ErrorCode.INVALID_PARAMS, "git.commit 参数无效");
      }
      return options.git.commit(params.data.message);
    },
    "git.log": async (_request) => {
      if (!options.git) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "Git 尚未接入");
      }
      return options.git.log();
    }
  };
}
