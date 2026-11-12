import { z } from "zod";
import { ResearchScopeSchema, SkillRunInputSchema } from "./kernel.js";
export const SkillsRunParamsSchema = z.object({
  skillId: z.string().min(1),
  input: SkillRunInputSchema
});
export const DomainParamsSchema = z.object({
  scope: ResearchScopeSchema
});
export const DomainApplyParamsSchema = z.object({
  scope: ResearchScopeSchema,
  actionId: z.string().min(1)
});
export const AgentChatParamsSchema = z.object({
  prompt: z.string().min(1).max(20_000),
  scope: ResearchScopeSchema,
  conversationId: z.string().min(1).optional(),
  turnId: z.string().min(1).optional()
});
export const AgentApiKeyParamsSchema = z.object({
  apiKey: z.string().max(500)
});
export const AgentProviderParamsSchema = z.object({
  provider: z.enum(["deepseek", "openai-compatible"]),
  baseUrl: z.string().max(500),
  model: z.string().min(1).max(200),
  apiKey: z.string().max(500).optional()
});
export const GitConfigureParamsSchema = z.object({
  binary: z.string().max(1000).optional(),
  autoCommit: z.boolean().optional()
});
export const ResearchTopicCreateSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional()
});
export const ResearchTopicUpdateSchema = z.object({
  topicId: z.string().min(1),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional()
});
export const ResearchLiteratureAddSchema = z.object({
  topicId: z.string().min(1),
  title: z.string().min(1).max(500),
  path: z.string().max(2000).optional(),
  url: z.string().max(2000).optional(),
  note: z.string().max(2000).optional()
});
export const ResearchLiteratureRemoveSchema = z.object({
  topicId: z.string().min(1),
  literatureId: z.string().min(1)
});
export const ResearchRouteCreateSchema = z.object({
  topicId: z.string().min(1),
  title: z.string().min(1).max(500)
});
export const ResearchRouteStatusSchema = z.object({
  routeId: z.string().min(1),
  status: z.enum(["planned", "active", "done"])
});
export const ResearchProjectCreateSchema = z.object({
  topicId: z.string().min(1),
  name: z.string().min(1).max(200),
  path: z.string().max(1000).optional()
});
export const ResearchProjectDeleteSchema = z.object({
  topicId: z.string().min(1),
  projectId: z.string().min(1)
});
export const ResearchKnowledgeCreateSchema = z.object({
  topicId: z.string().min(1),
  title: z.string().min(1).max(300),
  body: z.string().max(20000).default(""),
  tags: z.array(z.string().max(60)).max(20).optional()
});
export const ResearchKnowledgeUpdateSchema = z.object({
  topicId: z.string().min(1),
  knowledgeId: z.string().min(1),
  title: z.string().max(300).optional(),
  body: z.string().max(20000).optional(),
  tags: z.array(z.string().max(60)).max(20).optional()
});
export const ResearchCreateTaskSchema = z.object({
  routeId: z.string().min(1),
  title: z.string().min(1).max(500)
});
export const ResearchTaskStatusParamsSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(["todo", "active", "done"])
});
export const ResearchIdSchema = z.object({
  id: z.string().min(1)
});
export const UploadsDeleteSchema = z.object({
  path: z.string().min(1)
});
export const ExperimentReusableInputSchema = z.object({
  kind: z.string().min(1).max(80),
  description: z.string().min(1).max(2000),
  path: z.string().max(1000).optional()
});
export const ExperimentCreateSchema = z.object({
  title: z.string().min(1).max(300),
  goal: z.string().max(2000).default(""),
  hypothesis: z.string().max(2000).default(""),
  design: z.string().max(2000).default(""),
  metrics: z.string().max(2000).optional(),
  seeds: z.number().int().min(0).max(1000).default(1),
  conclusion: z.string().max(4000).optional(),
  reusable: ExperimentReusableInputSchema.optional(),
  scope: ResearchScopeSchema.optional()
});
export const ExperimentUpdateSchema = z.object({
  id: z.string().min(1),
  conclusion: z.string().max(4000).optional(),
  reusable: ExperimentReusableInputSchema.nullable().optional(),
  confirmed: z.boolean().optional()
});
export const SessionFileSchema = z.object({
  file: z.string().min(1).max(2000)
});
export const FactsListSchema = z.object({
  topicId: z.string().min(1).optional()
});
export const FactUpdateParamsSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["proposed", "supported", "confirmed", "refuted"])
});
export const CompactSchema = z.object({
  instructions: z.string().max(4000).optional()
});
export const MilestonesListSchema = z.object({
  taskId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(200).optional()
});
export const ScheduleUpdateSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().optional(),
  intervalSeconds: z.number().int().min(60).max(86_400).optional()
});
export const ScheduleIdSchema = z.object({
  id: z.string().min(1)
});
export const PermissionsParamsSchema = z.object({
  level: z.enum(["read-only", "workspace-write", "full-access"])
});
export const AgentRestoreParamsSchema = z.object({
  sessionFile: z.string().max(2000).nullable().optional()
});
export const ApprovalRespondParamsSchema = z.object({
  id: z.string().min(1),
  approved: z.boolean()
});
export const TerminalRunParamsSchema = z.object({
  command: z.string().min(1).max(8_000)
});
export const ExperimentGetParamsSchema = z.object({
  id: z.string().min(1)
});
export const GitDiffParamsSchema = z.object({
  path: z.string().min(1),
  staged: z.boolean().default(false)
});
export const GitPathsParamsSchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(200)
});
export const GitCommitParamsSchema = z.object({
  message: z.string().min(1).max(2_000)
});
