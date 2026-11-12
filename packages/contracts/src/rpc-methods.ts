import { z } from "zod";
import * as p from "./rpc-params.js";
import * as m from "./models.js";
import * as w from "./workspace.js";
import * as c from "./chat.js";
import * as k from "./kernel.js";
import * as r from "./research-loop.js";

const NoParamsSchema = z.object({}).strict().optional();
const OkSchema = z.object({ ok: z.literal(true) });
const CommitSchema = z.object({ commit: z.string() });
const IdSchema = z.object({ id: z.string().min(1).max(100) });
const method = <P extends z.ZodTypeAny, R extends z.ZodTypeAny>(
  params: P,
  result: R
) => ({ params, result });
export const RpcMethods = {
  "system.hello": method(NoParamsSchema, c.HelloSchema),
  "skills.list": method(
    NoParamsSchema,
    z.object({ skills: z.array(k.SkillManifestSchema.omit({ path: true })) })
  ),
  "skills.run": method(p.SkillsRunParamsSchema, k.SkillRunResultSchema),
  "domain.observe": method(p.DomainParamsSchema, k.ObservationSchema),
  "domain.actions": method(
    p.DomainParamsSchema,
    z.object({ actions: z.array(k.ActionSpecSchema) })
  ),
  "domain.apply": method(p.DomainApplyParamsSchema, k.ActionResultSchema),
  "workspace.tree": method(NoParamsSchema, z.array(w.WorkspaceEntrySchema)),
  "workspace.read": method(w.WorkspaceReadParamsSchema, w.WorkspaceFileSchema),
  "workspace.write": method(
    w.WorkspaceWriteParamsSchema,
    w.WorkspaceWriteResultSchema
  ),
  "terminal.cancel": method(NoParamsSchema, z.object({ canceled: z.number() })),
  "terminal.run": method(p.TerminalRunParamsSchema, w.CommandResultSchema),
  "workspace.uploads": method(
    NoParamsSchema,
    z.object({ uploads: z.array(c.UploadedFileSchema) })
  ),
  "workspace.deleteUpload": method(
    p.UploadsDeleteSchema,
    z.object({ uploads: z.array(c.UploadedFileSchema) })
  ),
  "experiments.list": method(
    NoParamsSchema,
    z.array(m.ExperimentSummarySchema)
  ),
  "experiments.get": method(
    p.ExperimentGetParamsSchema,
    m.StoredExperimentSchema
  ),
  "experiments.propose": method(
    p.ExperimentCreateSchema,
    m.StoredExperimentSchema
  ),
  "experiments.create": method(
    p.ExperimentCreateSchema,
    m.StoredExperimentSchema
  ),
  "experiments.confirmTaskbook": method(
    p.ResearchIdSchema,
    m.StoredExperimentSchema
  ),
  "experiments.update": method(
    p.ExperimentUpdateSchema,
    m.StoredExperimentSchema
  ),
  "research.tree": method(NoParamsSchema, z.array(m.ResearchTopicSchema)),
  "research.createTopic": method(
    p.ResearchTopicCreateSchema,
    z.object({
      topic: m.ResearchTopicSchema,
      topics: z.array(m.ResearchTopicSchema)
    })
  ),
  "research.updateTopic": method(
    p.ResearchTopicUpdateSchema,
    z.object({
      topic: m.ResearchTopicSchema,
      topics: z.array(m.ResearchTopicSchema)
    })
  ),
  "research.addLiterature": method(
    p.ResearchLiteratureAddSchema,
    z.object({
      literature: m.LiteratureItemSchema,
      topics: z.array(m.ResearchTopicSchema)
    })
  ),
  "research.removeLiterature": method(
    p.ResearchLiteratureRemoveSchema,
    z.object({
      topic: m.ResearchTopicSchema,
      topics: z.array(m.ResearchTopicSchema)
    })
  ),
  "research.createProject": method(
    p.ResearchProjectCreateSchema,
    z.object({
      project: m.ResearchProjectSchema,
      topics: z.array(m.ResearchTopicSchema)
    })
  ),
  "research.deleteProject": method(
    p.ResearchProjectDeleteSchema,
    z.object({ topics: z.array(m.ResearchTopicSchema) })
  ),
  "research.createKnowledge": method(
    p.ResearchKnowledgeCreateSchema,
    z.object({
      entry: m.KnowledgeItemSchema,
      topics: z.array(m.ResearchTopicSchema)
    })
  ),
  "research.updateKnowledge": method(
    p.ResearchKnowledgeUpdateSchema,
    z.object({
      entry: m.KnowledgeItemSchema,
      topics: z.array(m.ResearchTopicSchema)
    })
  ),
  "research.deleteKnowledge": method(
    p.ResearchKnowledgeUpdateSchema,
    z.object({ topics: z.array(m.ResearchTopicSchema) })
  ),
  "research.createQuestion": method(
    p.ResearchRouteCreateSchema,
    z.object({
      question: m.ResearchQuestionSchema,
      topics: z.array(m.ResearchTopicSchema)
    })
  ),
  "research.setQuestionStatus": method(
    p.ResearchRouteStatusSchema,
    z.object({
      question: m.ResearchQuestionSchema,
      topics: z.array(m.ResearchTopicSchema)
    })
  ),
  "research.createTask": method(
    p.ResearchCreateTaskSchema,
    z.object({
      task: m.ResearchTaskSchema,
      topics: z.array(m.ResearchTopicSchema)
    })
  ),
  "research.setTaskStatus": method(
    p.ResearchTaskStatusParamsSchema,
    z.object({
      task: m.ResearchTaskSchema,
      topics: z.array(m.ResearchTopicSchema)
    })
  ),
  "research.deleteTopic": method(
    p.ResearchIdSchema,
    z.object({ topics: z.array(m.ResearchTopicSchema) })
  ),
  "research.deleteQuestion": method(
    p.ResearchIdSchema,
    z.object({ topics: z.array(m.ResearchTopicSchema) })
  ),
  "research.deleteTask": method(
    p.ResearchIdSchema,
    z.object({ topics: z.array(m.ResearchTopicSchema) })
  ),
  "lsp.start": method(
    NoParamsSchema,
    z.object({ url: z.string(), server: z.string() }).nullable()
  ),
  "lsp.status": method(
    NoParamsSchema,
    z.object({
      running: z.boolean(),
      url: z.string().nullable(),
      workspace: z.string(),
      error: z.string().nullable()
    })
  ),
  "git.configure": method(
    p.GitConfigureParamsSchema,
    z.object({
      configured: z.boolean(),
      autoCommit: z.boolean(),
      version: z.string().nullable()
    })
  ),
  "git.status": method(NoParamsSchema, w.GitStatusSchema),
  "git.diff": method(
    p.GitDiffParamsSchema,
    z.object({ path: z.string(), staged: z.boolean(), diff: z.string() })
  ),
  "git.stage": method(p.GitPathsParamsSchema, OkSchema),
  "git.unstage": method(p.GitPathsParamsSchema, OkSchema),
  "git.commit": method(p.GitCommitParamsSchema, CommitSchema),
  "git.log": method(NoParamsSchema, z.array(w.GitCommitInfoSchema)),
  "agent.spike": method(p.DomainParamsSchema, c.AgentSpikeResultSchema),
  "agent.setApiKey": method(
    p.AgentApiKeyParamsSchema,
    z.object({ configured: z.boolean() })
  ),
  "agent.reset": method(NoParamsSchema, z.object({ reset: z.boolean() })),
  "agent.restoreSession": method(
    p.AgentRestoreParamsSchema,
    z.object({ restored: z.boolean() })
  ),
  "agent.abort": method(NoParamsSchema, z.object({ aborted: z.boolean() })),
  "agent.contextUsage": method(NoParamsSchema, c.ContextUsageSchema.nullable()),
  "agent.compact": method(
    p.CompactSchema,
    z.object({ compacted: z.boolean() })
  ),
  "facts.list": method(
    p.FactsListSchema.default({}),
    z.object({ facts: z.array(m.FactSchema) })
  ),
  "facts.update": method(p.FactUpdateParamsSchema, m.FactSchema),
  "agent.sessions": method(
    NoParamsSchema,
    z.object({ sessions: z.array(c.SessionSummarySchema) })
  ),
  "schedules.list": method(
    NoParamsSchema,
    z.object({ schedules: z.array(m.ScheduleSchema) })
  ),
  "schedules.update": method(p.ScheduleUpdateSchema, m.ScheduleSchema),
  "schedules.runNow": method(
    p.ScheduleIdSchema,
    z.object({ ran: z.boolean(), schedule: m.ScheduleSchema.nullable() })
  ),
  "milestones.list": method(
    p.MilestonesListSchema.default({}),
    z.object({ milestones: z.array(m.MilestoneSchema) })
  ),
  "agent.sessionMessages": method(
    p.SessionFileSchema,
    z.object({ messages: z.array(c.TranscriptMessageSchema) })
  ),
  "permissions.get": method(NoParamsSchema, p.PermissionsParamsSchema),
  "permissions.configure": method(
    p.PermissionsParamsSchema,
    p.PermissionsParamsSchema
  ),
  "agent.configureProvider": method(
    p.AgentProviderParamsSchema,
    z.object({
      configured: z.boolean(),
      provider: z.enum(["deepseek", "openai-compatible"]),
      model: z.string()
    })
  ),
  "agent.chat": method(p.AgentChatParamsSchema, c.AgentChatResultSchema),
  "approval.respond": method(p.ApprovalRespondParamsSchema, OkSchema),
  "loop.overview": method(NoParamsSchema, r.LoopOverviewSchema),
  "loop.compass.update": method(r.CompassUpdateSchema, r.ResearchCompassSchema),
  "loop.claim.propose": method(r.ClaimProposalSchema, r.EvidenceClaimSchema),
  "loop.claim.confirm": method(IdSchema, r.EvidenceClaimSchema),
  "loop.decision.create": method(r.DecisionSchema, r.ResearchDecisionSchema),
  "loop.export": method(NoParamsSchema, z.object({ path: z.string() })),
  "runs.propose": method(r.RunProposalSchema, r.ManagedPlanSchema),
  "plans.dismiss": method(
    IdSchema.extend({ reason: z.string().trim().min(1).max(2000) }),
    r.ManagedPlanSchema
  ),
  "plans.readFrozenFile": method(
    IdSchema.extend({ path: r.RelativePathSchema }),
    r.FrozenFileContentSchema
  ),
  "runs.approve": method(
    IdSchema.extend({ digest: w.Sha256Schema }),
    r.ManagedPlanSchema
  ),
  "runs.start": method(
    IdSchema.extend({ idempotencyKey: z.string().min(1).max(200) }),
    r.ManagedRunSchema
  ),
  "runs.get": method(IdSchema, r.RunDetailSchema),
  "runs.cancel": method(IdSchema, r.ManagedRunSchema),
  "runs.logs": method(
    IdSchema,
    z.object({ stdout: z.string(), stderr: z.string(), truncated: z.boolean() })
  ),
  "runs.compare": method(
    z.object({ leftId: z.string().min(1), rightId: z.string().min(1) }),
    z.object({
      comparable: z.boolean(),
      reason: z.string(),
      metric: z.string(),
      delta: z.number().nullable(),
      better: z.boolean().nullable()
    })
  )
} as const;
export type RpcMethodName = keyof typeof RpcMethods;
export type RpcMethodMap = {
  [M in RpcMethodName]: {
    params: z.input<(typeof RpcMethods)[M]["params"]>;
    result: z.output<(typeof RpcMethods)[M]["result"]>;
  };
};
export type RpcResult<M extends RpcMethodName> = RpcMethodMap[M]["result"];
export type RpcParams<M extends RpcMethodName> = RpcMethodMap[M]["params"];
export type ParsedRpcParams<M extends RpcMethodName> = z.output<
  (typeof RpcMethods)[M]["params"]
>;
export function isRpcMethod(method: string): method is RpcMethodName {
  return Object.hasOwn(RpcMethods, method);
}
export function parseRpcParams<M extends RpcMethodName>(
  method: M,
  value: unknown
): ParsedRpcParams<M> {
  return RpcMethods[method].params.parse(value) as ParsedRpcParams<M>;
}
export function parseRpcResult<M extends RpcMethodName>(
  method: M,
  value: unknown
): RpcResult<M> {
  const result = RpcMethods[method].result.safeParse(value);
  if (!result.success)
    throw new Error(
      `PROTOCOL_ERROR: ${method} response does not match contracts`
    );
  return result.data as RpcResult<M>;
}
export type RpcRequestFunction = <M extends RpcMethodName>(
  method: M,
  ...args: undefined extends RpcParams<M>
    ? [params?: RpcParams<M>]
    : [params: RpcParams<M>]
) => Promise<RpcResult<M>>;

// Credential and permission configuration belongs to dedicated Main IPC handlers.
const MAIN_ONLY_METHODS: ReadonlySet<RpcMethodName> = new Set([
  "agent.setApiKey",
  "agent.configureProvider",
  "permissions.configure",
  "git.configure"
]);
export function isRendererRpcMethod(method: string): method is RpcMethodName {
  return isRpcMethod(method) && !MAIN_ONLY_METHODS.has(method);
}
