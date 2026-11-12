import { type WorkspaceTransaction } from "./workspace-mutations.js";
import {
  ErrorCode,
  RpcRequestSchema,
  parseRpcEvent,
  type RpcEventType,
  type RpcId,
  type RpcRequest
} from "@research-workbench/contracts";
import { WorkspaceAccessError, WorkspaceConflictError } from "./workspace.js";
import {
  RpcError,
  type RpcServerOptions,
  type RpcContext
} from "./rpc/context.js";
import { RpcMethodRegistry } from "./rpc/registry.js";
import { systemHandlers } from "./rpc/handlers/system.js";
import { workspaceHandlers } from "./rpc/handlers/workspace.js";
import { experimentsHandlers } from "./rpc/handlers/experiments.js";
import { researchHandlers } from "./rpc/handlers/research.js";
import { gitHandlers } from "./rpc/handlers/git.js";
import { chatHandlers } from "./rpc/handlers/chat.js";
import { recordsHandlers } from "./rpc/handlers/records.js";
import { runsHandlers } from "./rpc/handlers/runs.js";
export class RpcServer {
  private seq = 0;

  private readonly registry: RpcMethodRegistry;
  constructor(private readonly options: RpcServerOptions) {
    const context: RpcContext = {
      options,
      emit: (type, payload) => this.emit(type, payload),
      maybeAutoCommit: (message, before, transaction) =>
        this.maybeAutoCommit(message, before, transaction)
    };
    this.registry = new RpcMethodRegistry([
      systemHandlers(context),
      workspaceHandlers(context),
      experimentsHandlers(context),
      researchHandlers(context),
      gitHandlers(context),
      chatHandlers(context),
      recordsHandlers(context),
      runsHandlers(context)
    ]);
  }

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
      if (error instanceof WorkspaceConflictError) {
        return this.failure(
          request.id ?? null,
          ErrorCode.FILE_CONFLICT,
          error.message,
          {
            code: error.code,
            path: error.path,
            actualSha256: error.actualSha256
          }
        );
      }
      if (error instanceof RpcError) {
        return this.failure(
          request.id ?? null,
          error.code,
          error.message,
          error.data
        );
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
    return this.registry.dispatch(request);
  }

  emitEvent(type: RpcEventType, payload: unknown): void {
    this.emit(type, payload);
  }

  private async maybeAutoCommit(
    message: string,
    before: import("./git-service.js").GitStatus,
    transaction: WorkspaceTransaction
  ): Promise<void> {
    if (!this.options.git?.isAutoCommitEnabled()) return;
    try {
      const result = await this.options.git.autoCommit(message, {
        before,
        transaction
      });
      if (result) this.emit("git.committed", result);
    } catch (error) {
      this.emit("git.auto-commit-failed", {
        message: error instanceof Error ? error.message : "自动提交失败"
      });
    }
  }

  private emit(type: RpcEventType, payload: unknown): void {
    this.seq += 1;
    const event = parseRpcEvent({
      jsonrpc: "2.0",
      method: "event",
      params: {
        seq: this.seq,
        type,
        at: new Date().toISOString(),
        payload
      }
    });
    this.options.emit?.(event);
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
