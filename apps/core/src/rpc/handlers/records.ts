import { ErrorCode } from "@research-workbench/contracts";
import {
  FactsListSchema,
  FactUpdateParamsSchema,
  MilestonesListSchema,
  ScheduleUpdateSchema,
  ScheduleIdSchema
} from "@research-workbench/contracts";
import { RpcError, type RpcContext, type RpcHandler } from "../context.js";
export function recordsHandlers(
  context: RpcContext
): Record<string, RpcHandler> {
  const { options } = context;
  return {
    "facts.list": async (request) => {
      const params = FactsListSchema.safeParse(request.params ?? {});
      if (!params.success) {
        throw new RpcError(ErrorCode.INVALID_PARAMS, "facts.list 参数无效");
      }
      return {
        facts: options.facts?.list({ topicId: params.data.topicId }) ?? []
      };
    },
    "facts.update": async (request) => {
      if (!options.facts) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "事实存储尚未接入");
      }
      const params = FactUpdateParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(ErrorCode.INVALID_PARAMS, "facts.update 参数无效");
      }
      return options.facts.setStatus(params.data.id, params.data.status);
    },
    "schedules.list": async (_request) => {
      return { schedules: options.schedules?.list() ?? [] };
    },
    "schedules.update": async (request) => {
      if (!options.schedules) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "调度尚未接入");
      }
      const params = ScheduleUpdateSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "schedules.update 参数无效"
        );
      }
      let schedule = options.schedules.get(params.data.id);
      if (!schedule) {
        throw new RpcError(ErrorCode.INVALID_PARAMS, "定时任务不存在");
      }
      if (params.data.enabled !== undefined) {
        schedule = options.schedules.setEnabled(
          params.data.id,
          params.data.enabled
        );
      }
      if (params.data.intervalSeconds !== undefined) {
        schedule = options.schedules.setInterval(
          params.data.id,
          params.data.intervalSeconds
        );
      }
      return schedule;
    },
    "schedules.runNow": async (request) => {
      if (!options.runSchedule) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "调度尚未接入");
      }
      const params = ScheduleIdSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "schedules.runNow 参数无效"
        );
      }
      await options.runSchedule(params.data.id);
      // Manual runs must book-keep like scheduled ones, otherwise the digest's
      // "since last run" window never advances.
      const schedule =
        options.schedules?.markRun(params.data.id, new Date()) ?? null;
      return { ran: true, schedule };
    },
    "milestones.list": async (request) => {
      const params = MilestonesListSchema.safeParse(request.params ?? {});
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "milestones.list 参数无效"
        );
      }
      return {
        milestones:
          options.milestones?.list({
            taskId: params.data.taskId,
            limit: params.data.limit
          }) ?? []
      };
    }
  };
}
