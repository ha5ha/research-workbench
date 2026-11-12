import { expect, it } from "vitest";
import {
  ErrorCode,
  RpcMethods,
  isRendererRpcMethod,
  parseRpcEvent,
  parseRpcParams,
  parseRpcResult
} from "@research-workbench/contracts";
import { RpcMethodRegistry } from "../../apps/core/src/rpc/registry.js";
import type { RpcHandler } from "../../apps/core/src/rpc/context.js";

const handlers = (): Record<string, RpcHandler> =>
  Object.fromEntries(
    Object.keys(RpcMethods).map((method) => [method, async () => ({})])
  );
it("rejects missing, duplicate, and unregistered RPC handlers at startup", () => {
  expect(() => new RpcMethodRegistry([])).toThrow("缺少 RPC handler");
  expect(
    () =>
      new RpcMethodRegistry([handlers(), { "system.hello": async () => ({}) }])
  ).toThrow("重复");
  expect(
    () => new RpcMethodRegistry([handlers(), { future: async () => ({}) }])
  ).toThrow("未登记");
});
it("validates both directions before allowing malformed service results across RPC", async () => {
  const registry = new RpcMethodRegistry([handlers()]);
  await expect(
    registry.dispatch({
      jsonrpc: "2.0",
      method: "workspace.write",
      params: { path: "a", content: "b" }
    })
  ).rejects.toMatchObject({ code: ErrorCode.INVALID_PARAMS });
  await expect(
    registry.dispatch({ jsonrpc: "2.0", method: "system.hello" })
  ).rejects.toMatchObject({ code: ErrorCode.PROTOCOL_ERROR });
  expect(() => parseRpcResult("git.status", { available: true })).toThrow(
    "PROTOCOL_ERROR"
  );
  expect(parseRpcParams("git.diff", { path: "a" })).toEqual({
    path: "a",
    staged: false
  });
});
it("requires conversation, turn and tool-call identities for stream events", () => {
  const event = (payload: unknown) => ({
    jsonrpc: "2.0",
    method: "event",
    params: {
      seq: 1,
      type: "agent.tool-end",
      at: new Date().toISOString(),
      payload
    }
  });
  const payload = {
    type: "tool-end",
    toolName: "read_file",
    toolCallId: "one",
    conversationId: "A",
    turnId: "turn-1",
    isError: false
  };
  expect(parseRpcEvent(event(payload)).params.payload).toEqual(payload);
  for (const field of ["conversationId", "turnId", "toolCallId"]) {
    const invalid: Record<string, unknown> = { ...payload };
    delete invalid[field];
    expect(() => parseRpcEvent(event(invalid))).toThrow("PROTOCOL_ERROR");
  }
});
it("derives renderer exposure from shared methods while keeping configuration in Main", () => {
  for (const method of [
    "$private.ssh.configure",
    "agent.setApiKey",
    "agent.configureProvider",
    "permissions.configure",
    "git.configure",
    "toString"
  ])
    expect(isRendererRpcMethod(method)).toBe(false);
  expect(isRendererRpcMethod("workspace.write")).toBe(true);
});
