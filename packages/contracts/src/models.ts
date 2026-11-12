import { z } from "zod";
import { ResearchScopeSchema } from "./kernel.js";
export const ResearchTaskStatusSchema = z.union([
  z.literal("todo"),
  z.literal("active"),
  z.literal("done")
]);
export type ResearchTaskStatus = z.infer<typeof ResearchTaskStatusSchema>;
export const ResearchQuestionStatusSchema = z.union([
  z.literal("planned"),
  z.literal("active"),
  z.literal("done")
]);
export type ResearchQuestionStatus = z.infer<
  typeof ResearchQuestionStatusSchema
>;
export const ResearchTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.lazy(() => ResearchTaskStatusSchema)
});
export type ResearchTask = z.infer<typeof ResearchTaskSchema>;
export const LiteratureItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  path: z.string().optional(),
  url: z.string().optional(),
  note: z.string().optional(),
  addedAt: z.string()
});
export type LiteratureItem = z.infer<typeof LiteratureItemSchema>;
export const ResearchProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string().optional(),
  createdAt: z.string()
});
export type ResearchProject = z.infer<typeof ResearchProjectSchema>;
export const KnowledgeItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  tags: z.array(z.string()),
  updatedAt: z.string()
});
export type KnowledgeItem = z.infer<typeof KnowledgeItemSchema>;
export const ResearchQuestionSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.lazy(() => ResearchQuestionStatusSchema),
  tasks: z.array(z.lazy(() => ResearchTaskSchema))
});
export type ResearchQuestion = z.infer<typeof ResearchQuestionSchema>;
export const ResearchTopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  projects: z.array(z.lazy(() => ResearchProjectSchema)),
  literature: z.array(z.lazy(() => LiteratureItemSchema)),
  knowledge: z.array(z.lazy(() => KnowledgeItemSchema)),
  questions: z.array(z.lazy(() => ResearchQuestionSchema))
});
export type ResearchTopic = z.infer<typeof ResearchTopicSchema>;
export const ExperimentFileDiffSchema = z.object({
  path: z.string(),
  status: z.union([
    z.literal("added"),
    z.literal("modified"),
    z.literal("deleted")
  ]),
  additions: z.number(),
  deletions: z.number(),
  diff: z.string(),
  before: z.string(),
  after: z.string()
});
export type ExperimentFileDiff = z.infer<typeof ExperimentFileDiffSchema>;
export const ExperimentStatusSchema = z.union([
  z.literal("pending"),
  z.literal("archived"),
  z.literal("failed")
]);
export type ExperimentStatus = z.infer<typeof ExperimentStatusSchema>;
export const TaskbookStatusSchema = z.union([
  z.literal("draft"),
  z.literal("confirmed")
]);
export type TaskbookStatus = z.infer<typeof TaskbookStatusSchema>;
export const TaskBookSchema = z.object({
  id: z.string(),
  version: z.number(),
  goal: z.string(),
  hypothesis: z.string(),
  design: z.string(),
  metrics: z.string(),
  seeds: z.number(),
  config: z.record(z.unknown()).optional()
});
export type TaskBook = z.infer<typeof TaskBookSchema>;
export const SeedResultSchema = z.object({
  seed: z.union([z.number(), z.string()]),
  metrics: z.record(z.union([z.string(), z.number()])),
  note: z.string().optional()
});
export type SeedResult = z.infer<typeof SeedResultSchema>;
export const ExperimentReusableSchema = z.object({
  kind: z.string(),
  description: z.string(),
  path: z.string().optional()
});
export type ExperimentReusable = z.infer<typeof ExperimentReusableSchema>;
export const StoredExperimentSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.lazy(() => ExperimentStatusSchema),
  taskBook: z.lazy(() => TaskBookSchema),
  taskbookStatus: z.lazy(() => TaskbookStatusSchema),
  taskbookConfirmedAt: z.union([z.string(), z.null()]),
  metrics: z.union([z.string(), z.null()]),
  seeds: z.union([z.number(), z.null()]),
  conclusion: z.union([z.string(), z.null()]),
  scope: ResearchScopeSchema.partial().nullable(),
  files: z.array(z.lazy(() => ExperimentFileDiffSchema)),
  artifacts: z.array(
    z.object({
      path: z.string(),
      kind: z.string()
    })
  ),
  seedResults: z.array(z.lazy(() => SeedResultSchema)),
  reusable: z.union([z.lazy(() => ExperimentReusableSchema), z.null()]),
  confirmedAt: z.union([z.string(), z.null()]),
  startedAt: z.string(),
  finishedAt: z.union([z.string(), z.null()])
});
export type StoredExperiment = z.infer<typeof StoredExperimentSchema>;
export const ExperimentSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.lazy(() => ExperimentStatusSchema),
  taskBook: z.lazy(() => TaskBookSchema),
  taskbookStatus: z.lazy(() => TaskbookStatusSchema),
  taskbookConfirmedAt: z.union([z.string(), z.null()]),
  metrics: z.union([z.string(), z.null()]),
  seeds: z.union([z.number(), z.null()]),
  conclusion: z.union([z.string(), z.null()]),
  scope: ResearchScopeSchema.partial().nullable(),
  seedResults: z.array(z.lazy(() => SeedResultSchema)),
  reusable: z.union([z.lazy(() => ExperimentReusableSchema), z.null()]),
  confirmedAt: z.union([z.string(), z.null()]),
  startedAt: z.string(),
  finishedAt: z.union([z.string(), z.null()]),
  fileCount: z.number(),
  additions: z.number(),
  deletions: z.number()
});
export type ExperimentSummary = z.infer<typeof ExperimentSummarySchema>;
export const FactStatusSchema = z.union([
  z.literal("proposed"),
  z.literal("supported"),
  z.literal("confirmed"),
  z.literal("refuted")
]);
export type FactStatus = z.infer<typeof FactStatusSchema>;
export const FactKindSchema = z.union([
  z.literal("finding"),
  z.literal("negative"),
  z.literal("method"),
  z.literal("constraint")
]);
export type FactKind = z.infer<typeof FactKindSchema>;
export const FactSchema = z.object({
  id: z.string(),
  topicId: z.union([z.string(), z.null()]),
  questionId: z.union([z.string(), z.null()]),
  taskId: z.union([z.string(), z.null()]),
  runId: z.union([z.string(), z.null()]),
  statement: z.string(),
  kind: z.lazy(() => FactKindSchema),
  importance: z.number(),
  status: z.lazy(() => FactStatusSchema),
  createdAt: z.string(),
  confirmedAt: z.union([z.string(), z.null()])
});
export type Fact = z.infer<typeof FactSchema>;
export const MilestoneSchema = z.object({
  id: z.string(),
  taskId: z.union([z.string(), z.null()]),
  kind: z.string(),
  title: z.string(),
  experimentId: z.union([z.string(), z.null()]),
  at: z.string()
});
export type Milestone = z.infer<typeof MilestoneSchema>;
export const ScheduleKindSchema = z.literal("digest");
export type ScheduleKind = z.infer<typeof ScheduleKindSchema>;
export const ScheduleSchema = z.object({
  id: z.string(),
  kind: z.lazy(() => ScheduleKindSchema),
  intervalSeconds: z.number(),
  enabled: z.boolean(),
  lastRunAt: z.union([z.string(), z.null()]),
  nextRunAt: z.string(),
  createdAt: z.string()
});
export type Schedule = z.infer<typeof ScheduleSchema>;
export const SimilarEvidenceSchema = z.object({
  id: z.string(),
  text: z.string(),
  kind: z.string().optional(),
  score: z.number()
});
export type SimilarEvidence = z.infer<typeof SimilarEvidenceSchema>;
export const TaskbookCardSchema = z.object({
  kind: z.literal("taskbook"),
  experimentId: z.string(),
  title: z.string(),
  goal: z.string(),
  hypothesis: z.string(),
  design: z.string(),
  metrics: z.string(),
  seeds: z.number(),
  status: z.union([z.literal("draft"), z.literal("confirmed")]),
  similar: z.array(z.lazy(() => SimilarEvidenceSchema))
});
export type TaskbookCard = z.infer<typeof TaskbookCardSchema>;
export const ArchiveFactSummarySchema = z.object({
  id: z.string(),
  statement: z.string(),
  kind: z.string(),
  importance: z.number()
});
export type ArchiveFactSummary = z.infer<typeof ArchiveFactSummarySchema>;
export const ArchiveCardSchema = z.object({
  kind: z.literal("archive"),
  experimentId: z.string(),
  title: z.string(),
  status: z.string(),
  metrics: z.union([z.string(), z.null()]),
  conclusion: z.union([z.string(), z.null()]),
  artifactCount: z.number(),
  seedCount: z.number(),
  reusable: z.union([
    z.object({
      kind: z.string(),
      description: z.string(),
      path: z.string().optional()
    }),
    z.null()
  ]),
  facts: z.array(z.lazy(() => ArchiveFactSummarySchema)),
  discarded: z.array(
    z.object({
      what: z.string(),
      reason: z.string()
    })
  )
});
export type ArchiveCard = z.infer<typeof ArchiveCardSchema>;
export const RunPlanCardSchema = z.object({
  kind: z.literal("run_plan"),
  planId: z.string(),
  experimentId: z.string(),
  title: z.string()
});
export type RunPlanCard = z.infer<typeof RunPlanCardSchema>;
export const AgentCardSchema = z.union([
  z.lazy(() => TaskbookCardSchema),
  z.lazy(() => ArchiveCardSchema),
  z.lazy(() => RunPlanCardSchema)
]);
export type AgentCard = z.infer<typeof AgentCardSchema>;
