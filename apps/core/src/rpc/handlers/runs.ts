import { z } from "zod";
import { ErrorCode } from "@research-workbench/contracts";
import { LOOP_METHODS, loopRequest } from "../../loop-rpc.js";
import { RpcError, type RpcContext, type RpcHandler } from "../context.js";

export function runsHandlers({
  options
}: RpcContext): Record<string, RpcHandler> {
  return Object.fromEntries(
    LOOP_METHODS.map((method) => [
      method,
      async (request) => {
        if (!options.loop)
          throw new RpcError(
            ErrorCode.METHOD_NOT_FOUND,
            "科研运行服务尚未接入"
          );
        try {
          return await loopRequest(options.loop, method, request.params);
        } catch (error) {
          if (error instanceof z.ZodError)
            throw new RpcError(
              ErrorCode.INVALID_PARAMS,
              "科研闭环参数无效",
              error.issues
            );
          throw error;
        }
      }
    ])
  );
}
