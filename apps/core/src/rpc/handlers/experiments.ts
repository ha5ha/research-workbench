import { ErrorCode } from "@research-workbench/contracts";
import {
  ResearchIdSchema,
  ExperimentCreateSchema,
  ExperimentUpdateSchema,
  ExperimentGetParamsSchema
} from "@research-workbench/contracts";
import { RpcError, type RpcContext, type RpcHandler } from "../context.js";
export function experimentsHandlers(
  context: RpcContext
): Record<string, RpcHandler> {
  const { options, emit } = context;
  return {
    "experiments.list": async (_request) => {
      if (!options.experiments) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "实验记录尚未接入");
      }
      return options.experiments.list();
    },
    "experiments.get": async (request) => {
      if (!options.experiments) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "实验记录尚未接入");
      }
      const params = ExperimentGetParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "experiments.get 参数无效"
        );
      }
      const record = options.experiments.get(params.data.id);
      if (!record) {
        throw new RpcError(ErrorCode.INVALID_PARAMS, "实验记录不存在");
      }
      return record;
    },
    "experiments.propose": async (request) => {
      if (!options.experiments)
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "实验记录尚未接入");
      const input = ExperimentCreateSchema.parse(request.params);
      const record = options.experiments.create({
        ...input,
        metrics: input.metrics ?? ""
      });
      emit("experiments.changed", { count: options.experiments.list().length });
      return record;
    },
    "experiments.create": async (request) => {
      if (!options.experiments) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "实验记录尚未接入");
      }
      const params = ExperimentCreateSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "experiments.create 参数无效"
        );
      }
      const created = options.experiments.create({
        title: params.data.title,
        goal: params.data.goal,
        hypothesis: params.data.hypothesis,
        design: params.data.design,
        metrics: params.data.metrics ?? "",
        seeds: params.data.seeds,
        scope: params.data.scope
      });
      options.experiments.confirmTaskbook(created.id);
      const record = options.experiments.finish(
        created.id,
        {
          metrics: params.data.metrics,
          conclusion: params.data.conclusion,
          reusable: params.data.reusable,
          status: "archived"
        },
        []
      );
      emit("experiments.changed", {
        count: options.experiments.list().length
      });
      return record;
    },
    "experiments.confirmTaskbook": async (request) => {
      if (!options.experiments) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "实验记录尚未接入");
      }
      const params = ResearchIdSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "experiments.confirmTaskbook 参数无效"
        );
      }
      const record = options.experiments.confirmTaskbook(params.data.id);
      const recordScope = record.scope as { taskId?: string } | null;
      options.milestones?.record({
        taskId: recordScope?.taskId,
        kind: "confirm",
        title: `确认任务书：${record.title}`,
        experimentId: record.id
      });
      emit("experiments.changed", {
        count: options.experiments.list().length
      });
      return record;
    },
    "experiments.update": async (request) => {
      if (!options.experiments) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "实验记录尚未接入");
      }
      const params = ExperimentUpdateSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "experiments.update 参数无效"
        );
      }
      const record = options.experiments.update(params.data.id, {
        conclusion: params.data.conclusion,
        reusable: params.data.reusable,
        confirmed: params.data.confirmed
      });
      emit("experiments.changed", {
        count: options.experiments.list().length
      });
      return record;
    }
  };
}
