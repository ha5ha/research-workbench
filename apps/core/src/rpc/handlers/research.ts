import { ErrorCode } from "@research-workbench/contracts";
import {
  ResearchTopicCreateSchema,
  ResearchTopicUpdateSchema,
  ResearchLiteratureAddSchema,
  ResearchLiteratureRemoveSchema,
  ResearchRouteCreateSchema,
  ResearchRouteStatusSchema,
  ResearchProjectCreateSchema,
  ResearchProjectDeleteSchema,
  ResearchKnowledgeCreateSchema,
  ResearchKnowledgeUpdateSchema,
  ResearchCreateTaskSchema,
  ResearchTaskStatusParamsSchema,
  ResearchIdSchema
} from "@research-workbench/contracts";
import { RpcError, type RpcContext, type RpcHandler } from "../context.js";
export function researchHandlers(
  context: RpcContext
): Record<string, RpcHandler> {
  const { options } = context;
  return {
    "research.tree": async (_request) => {
      if (!options.research) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
      }
      return options.research.tree();
    },
    "research.createTopic": async (request) => {
      if (!options.research) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
      }
      const params = ResearchTopicCreateSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "research.createTopic 参数无效"
        );
      }
      const topic = await options.research.createTopic(
        params.data.title,
        params.data.description
      );
      return { topic, topics: await options.research.tree() };
    },
    "research.updateTopic": async (request) => {
      if (!options.research) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
      }
      const params = ResearchTopicUpdateSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "research.updateTopic 参数无效"
        );
      }
      const topic = await options.research.updateTopic(params.data.topicId, {
        title: params.data.title,
        description: params.data.description
      });
      return { topic, topics: await options.research.tree() };
    },
    "research.addLiterature": async (request) => {
      if (!options.research) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
      }
      const params = ResearchLiteratureAddSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "research.addLiterature 参数无效"
        );
      }
      const literature = await options.research.addLiterature(
        params.data.topicId,
        params.data
      );
      return { literature, topics: await options.research.tree() };
    },
    "research.removeLiterature": async (request) => {
      if (!options.research) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
      }
      const params = ResearchLiteratureRemoveSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "research.removeLiterature 参数无效"
        );
      }
      const topic = await options.research.removeLiterature(
        params.data.topicId,
        params.data.literatureId
      );
      return { topic, topics: await options.research.tree() };
    },
    "research.createProject": async (request) => {
      if (!options.research) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
      }
      const params = ResearchProjectCreateSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "research.createProject 参数无效"
        );
      }
      const project = await options.research.createProject(
        params.data.topicId,
        { name: params.data.name, path: params.data.path }
      );
      return { project, topics: await options.research.tree() };
    },
    "research.deleteProject": async (request) => {
      if (!options.research) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
      }
      const params = ResearchProjectDeleteSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "research.deleteProject 参数无效"
        );
      }
      await options.research.deleteProject(
        params.data.topicId,
        params.data.projectId
      );
      return { topics: await options.research.tree() };
    },
    "research.createKnowledge": async (request) => {
      if (!options.research) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
      }
      const params = ResearchKnowledgeCreateSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "research.createKnowledge 参数无效"
        );
      }
      const entry = await options.research.createKnowledge(
        params.data.topicId,
        {
          title: params.data.title,
          body: params.data.body,
          tags: params.data.tags
        }
      );
      return { entry, topics: await options.research.tree() };
    },
    "research.updateKnowledge": async (request) => {
      if (!options.research) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
      }
      const params = ResearchKnowledgeUpdateSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "research.updateKnowledge 参数无效"
        );
      }
      const entry = await options.research.updateKnowledge(
        params.data.topicId,
        params.data.knowledgeId,
        {
          title: params.data.title,
          body: params.data.body,
          tags: params.data.tags
        }
      );
      return { entry, topics: await options.research.tree() };
    },
    "research.deleteKnowledge": async (request) => {
      if (!options.research) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
      }
      const params = ResearchKnowledgeUpdateSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "research.deleteKnowledge 参数无效"
        );
      }
      await options.research.deleteKnowledge(
        params.data.topicId,
        params.data.knowledgeId
      );
      return { topics: await options.research.tree() };
    },
    "research.createQuestion": async (request) => {
      if (!options.research) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
      }
      const params = ResearchRouteCreateSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "research.createQuestion 参数无效"
        );
      }
      const question = await options.research.createQuestion(
        params.data.topicId,
        params.data.title
      );
      return { question, topics: await options.research.tree() };
    },
    "research.setQuestionStatus": async (request) => {
      if (!options.research) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
      }
      const params = ResearchRouteStatusSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "research.setQuestionStatus 参数无效"
        );
      }
      const question = await options.research.setQuestionStatus(
        params.data.routeId,
        params.data.status
      );
      return { question, topics: await options.research.tree() };
    },
    "research.createTask": async (request) => {
      if (!options.research) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
      }
      const params = ResearchCreateTaskSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "research.createTask 参数无效"
        );
      }
      const task = await options.research.createTask(
        params.data.routeId,
        params.data.title
      );
      return { task, topics: await options.research.tree() };
    },
    "research.setTaskStatus": async (request) => {
      if (!options.research) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
      }
      const params = ResearchTaskStatusParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "research.setTaskStatus 参数无效"
        );
      }
      const task = await options.research.setTaskStatus(
        params.data.taskId,
        params.data.status
      );
      return { task, topics: await options.research.tree() };
    },
    "research.deleteTopic": async (request) => {
      if (!options.research) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
      }
      const params = ResearchIdSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "research.deleteTopic 参数无效"
        );
      }
      await options.research.deleteTopic(params.data.id);
      return { topics: await options.research.tree() };
    },
    "research.deleteQuestion": async (request) => {
      if (!options.research) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
      }
      const params = ResearchIdSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "research.deleteQuestion 参数无效"
        );
      }
      await options.research.deleteQuestion(params.data.id);
      return { topics: await options.research.tree() };
    },
    "research.deleteTask": async (request) => {
      if (!options.research) {
        throw new RpcError(ErrorCode.METHOD_NOT_FOUND, "研究结构尚未接入");
      }
      const params = ResearchIdSchema.safeParse(request.params);
      if (!params.success) {
        throw new RpcError(
          ErrorCode.INVALID_PARAMS,
          "research.deleteTask 参数无效"
        );
      }
      await options.research.deleteTask(params.data.id);
      return { topics: await options.research.tree() };
    }
  };
}
