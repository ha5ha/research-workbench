import {
  ErrorCode,
  RpcMethods,
  isRpcMethod,
  parseRpcParams,
  parseRpcResult,
  type RpcRequest
} from "@research-workbench/contracts";
import { RpcError, type RpcHandler } from "./context.js";

export class RpcMethodRegistry {
  private readonly handlers = new Map<string, RpcHandler>();
  constructor(groups: Array<Record<string, RpcHandler>>) {
    for (const group of groups)
      for (const [name, handler] of Object.entries(group)) {
        if (!isRpcMethod(name))
          throw new Error(`未登记的 RPC handler：${name}`);
        if (this.handlers.has(name))
          throw new Error(`重复的 RPC handler：${name}`);
        this.handlers.set(name, handler);
      }
    const missing = Object.keys(RpcMethods).filter(
      (name) => !this.handlers.has(name)
    );
    if (missing.length)
      throw new Error(`缺少 RPC handler：${missing.join(", ")}`);
  }
  async dispatch(request: RpcRequest): Promise<unknown> {
    const handler = this.handlers.get(request.method);
    if (!handler || !isRpcMethod(request.method))
      throw new RpcError(
        ErrorCode.METHOD_NOT_FOUND,
        `未知方法：${request.method}`
      );
    let params: unknown;
    try {
      params = parseRpcParams(request.method, request.params);
    } catch {
      throw new RpcError(
        ErrorCode.INVALID_PARAMS,
        `${request.method} 参数无效`
      );
    }
    const result = await handler({ ...request, params });
    try {
      return parseRpcResult(request.method, result);
    } catch {
      throw new RpcError(
        ErrorCode.PROTOCOL_ERROR,
        `PROTOCOL_ERROR: ${request.method} 响应不符合共享契约`
      );
    }
  }
}
