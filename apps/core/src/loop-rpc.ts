import { z } from "zod";
import type { RunService } from "./run-service.js";
import { RelativePathSchema } from "@research-workbench/contracts";

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
const Id = z.object({ id: z.string().min(1).max(100) });
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
      return service.confirmClaim(Id.parse(params).id);
    case "loop.decision.create":
      return service.recordDecision(params);
    case "loop.export":
      return service.exportReport();
    case "runs.propose":
      return service.propose(params);
    case "plans.readFrozenFile": {
      const input = z
        .object({ id: z.string().min(1).max(100), path: RelativePathSchema })
        .parse(params);
      return service.readFrozenFile(input.id, input.path);
    }
    case "plans.dismiss": {
      const input = z
        .object({
          id: z.string().min(1).max(100),
          reason: z.string().trim().min(1).max(2000)
        })
        .parse(params);
      return service.dismissPlan(input.id, input.reason);
    }
    case "runs.approve": {
      const input = z
        .object({
          id: z.string().min(1),
          digest: z.string().regex(/^[a-f0-9]{64}$/)
        })
        .parse(params);
      return service.approve(input.id, input.digest);
    }
    case "runs.start": {
      const input = z
        .object({
          id: z.string().min(1),
          idempotencyKey: z.string().min(1).max(200)
        })
        .parse(params);
      return service.start(input.id, input.idempotencyKey);
    }
    case "runs.get":
      return service.detail(Id.parse(params).id);
    case "runs.cancel":
      return service.cancel(Id.parse(params).id);
    case "runs.logs":
      return service.logs(Id.parse(params).id);
    case "runs.compare": {
      const input = z
        .object({ leftId: z.string().min(1), rightId: z.string().min(1) })
        .parse(params);
      return service.compare(input.leftId, input.rightId);
    }
    default:
      throw new Error("未知科研闭环请求");
  }
}
