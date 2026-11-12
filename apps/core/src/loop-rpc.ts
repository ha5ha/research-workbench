import type { RunService } from "./run-service.js";
import { parseRpcParams } from "@research-workbench/contracts";

export const LOOP_METHODS = [
  "loop.overview",
  "loop.compass.update",
  "loop.claim.propose",
  "loop.claim.confirm",
  "loop.decision.create",
  "loop.export",
  "runs.propose",
  "plans.dismiss",
  "plans.readFrozenFile",
  "runs.approve",
  "runs.start",
  "runs.get",
  "runs.cancel",
  "runs.logs",
  "runs.compare"
] as const;
export async function loopRequest(
  service: RunService,
  method: string,
  params: unknown
): Promise<unknown> {
  switch (method) {
    case "loop.overview":
      await service.refreshAll();
      return service.overview();
    case "loop.compass.update":
      return service.updateCompass(params);
    case "loop.claim.propose":
      return service.proposeClaim(params);
    case "loop.claim.confirm":
      return service.confirmClaim(
        parseRpcParams("loop.claim.confirm", params).id
      );
    case "loop.decision.create":
      return service.recordDecision(params);
    case "loop.export":
      return service.exportReport();
    case "runs.propose":
      return service.propose(params);
    case "plans.readFrozenFile": {
      const input = parseRpcParams("plans.readFrozenFile", params);
      return service.readFrozenFile(input.id, input.path);
    }
    case "plans.dismiss": {
      const input = parseRpcParams("plans.dismiss", params);
      return service.dismissPlan(input.id, input.reason);
    }
    case "runs.approve": {
      const input = parseRpcParams("runs.approve", params);
      return service.approve(input.id, input.digest);
    }
    case "runs.start": {
      const input = parseRpcParams("runs.start", params);
      return service.start(input.id, input.idempotencyKey);
    }
    case "runs.get":
      return service.detail(parseRpcParams("runs.get", params).id);
    case "runs.cancel":
      return service.cancel(parseRpcParams("runs.cancel", params).id);
    case "runs.logs":
      return service.logs(parseRpcParams("runs.logs", params).id);
    case "runs.compare": {
      const input = parseRpcParams("runs.compare", params);
      return service.compare(input.leftId, input.rightId);
    }
    default:
      throw new Error("未知科研闭环请求");
  }
}
