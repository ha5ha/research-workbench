import { z } from "zod";
import { SshConnectionIdentitySchema } from "./ssh.js";

export const RelativePathSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (path) =>
      !/^(\/|\\|[a-z]:)/i.test(path) &&
      !path.split(/[\\/]/).some((part) => part === "..") &&
      !path.includes("\0"),
    "必须是工作区内相对路径"
  );
export const EvaluationProtocolSchema = z.object({
  name: z.string().min(1).max(200),
  metric: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/),
  direction: z.enum(["minimize", "maximize"]),
  unit: z.string().max(40),
  dataset: z.string().min(1).max(300),
  environment: z.string().min(1).max(300),
  seeds: z
    .array(z.number().int())
    .min(1)
    .max(100)
    .refine(
      (values) => new Set(values).size === values.length,
      "seed 不可重复"
    ),
  metricsPath: RelativePathSchema,
  requiredArtifacts: z.array(RelativePathSchema).max(100).default([])
});
export type EvaluationProtocol = z.infer<typeof EvaluationProtocolSchema>;

export const RemoteDirectorySchema = z
  .string()
  .min(2)
  .max(500)
  .refine(
    (value) =>
      value.startsWith("/") &&
      !/[\\\x00-\x1f]/.test(value) &&
      value
        .slice(1)
        .split("/")
        .every((part) => part !== "" && part !== "." && part !== ".."),
    "远端目录必须是无链接跳转的绝对 POSIX 路径，不能含 .. 或末尾斜线"
  );
export const RemotePythonSchema = z.union([
  z.literal("python3"),
  RemoteDirectorySchema
]);

export const RunProposalSchema = z.object({
  experimentId: z.string().min(1).max(100),
  command: z.string().trim().min(1).max(4000),
  timeoutSeconds: z.number().int().min(1).max(86400),
  maxOutputBytes: z
    .number()
    .int()
    .min(1024)
    .max(1024 * 1024 * 1024)
    .default(64 * 1024 * 1024),
  inputs: z.array(RelativePathSchema).max(100).default([]),
  protocol: EvaluationProtocolSchema,
  backend: z.enum(["local", "ssh"]).default("local"),
  host: z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/)
    .optional(),
  remoteWorkdir: RemoteDirectorySchema.optional(),
  remotePython: RemotePythonSchema.optional(),
  baselineRunId: z.string().max(100).optional()
});
export type RunProposal = z.infer<typeof RunProposalSchema>;
export const SnapshotFileSchema = z.object({
  path: z.string(),
  sha256: z.string(),
  size: z.number(),
  executable: z.boolean().optional()
});
export type SnapshotFile = z.infer<typeof SnapshotFileSchema>;

/** Complete UTF-8 content of one manifest file, verified against its frozen identity. */
export const FrozenFileContentSchema = z.object({
  planId: z.string(),
  path: z.string(),
  sha256: z.string(),
  size: z.number(),
  content: z.string()
});
export type FrozenFileContent = z.infer<typeof FrozenFileContentSchema>;

export const ManagedPlanSchema = z.object({
  sshConnection: z.lazy(() => SshConnectionIdentitySchema).optional(),
  id: z.string(),
  version: z.number(),
  proposal: z.lazy(() => RunProposalSchema),
  taskbookHash: z.string(),
  revision: z.string(),
  codeHash: z.string(),
  inputHash: z.string(),
  environmentHash: z.string(),
  comparableGroup: z.string(),
  files: z.array(z.lazy(() => SnapshotFileSchema)),
  digest: z.string(),
  approvedAt: z.union([z.string(), z.null()]),
  closure: z.union([
    z.object({
      kind: z.union([z.literal("dismissed"), z.literal("superseded")]),
      at: z.string(),
      actor: z.union([
        z.literal("human"),
        z.literal("agent"),
        z.literal("system")
      ]),
      reason: z.string(),
      replacementPlanId: z.union([z.string(), z.null()])
    }),
    z.null()
  ]),
  createdAt: z.string()
});
export type ManagedPlan = z.infer<typeof ManagedPlanSchema>;

export const RunStateSchema = z.union([
  z.literal("preparing"),
  z.literal("running"),
  z.literal("collecting"),
  z.literal("succeeded"),
  z.literal("failed"),
  z.literal("canceled"),
  z.literal("unknown")
]);
export type RunState = z.infer<typeof RunStateSchema>;

export const RunArtifactSchema = z.object({
  path: z.string(),
  sha256: z.union([z.string(), z.null()]),
  size: z.number(),
  status: z.union([
    z.literal("present"),
    z.literal("missing"),
    z.literal("rejected")
  ]),
  reason: z.string().optional()
});
export type RunArtifact = z.infer<typeof RunArtifactSchema>;

export const ManagedRunSchema = z.object({
  id: z.string(),
  planId: z.string(),
  experimentId: z.string(),
  attempt: z.number(),
  idempotencyKey: z.string(),
  state: z.lazy(() => RunStateSchema),
  jobToken: z.string(),
  pid: z.union([z.number(), z.null()]),
  createdAt: z.string(),
  startedAt: z.union([z.string(), z.null()]),
  finishedAt: z.union([z.string(), z.null()]),
  exitCode: z.union([z.number(), z.null()]),
  reason: z.union([z.string(), z.null()]),
  metrics: z.record(z.number()),
  artifacts: z.array(z.lazy(() => RunArtifactSchema)),
  cancelRequested: z.boolean()
});
export type ManagedRun = z.infer<typeof ManagedRunSchema>;

export const RunDetailSchema = z.object({
  run: z.lazy(() => ManagedRunSchema),
  plan: z.lazy(() => ManagedPlanSchema),
  events: z.array(z.lazy(() => RunEventSchema))
});
export type RunDetail = z.infer<typeof RunDetailSchema>;

export const RunEventSchema = z.object({
  seq: z.number(),
  runId: z.string(),
  at: z.string(),
  type: z.string(),
  detail: z.string()
});
export type RunEvent = z.infer<typeof RunEventSchema>;

export const ResearchCompassSchema = z.object({
  goal: z.string(),
  constraints: z.string(),
  stopConditions: z.string(),
  nextStep: z.string(),
  nextStepReason: z.string(),
  updatedAt: z.string()
});
export type ResearchCompass = z.infer<typeof ResearchCompassSchema>;

export const CompassUpdateSchema = z.object({
  goal: z.string().max(2000),
  constraints: z.string().max(2000),
  stopConditions: z.string().max(2000),
  nextStep: z.string().max(2000),
  nextStepReason: z.string().max(2000)
});
export const EvidenceSourceSchema = z.object({
  runId: z.string(),
  artifactPath: z.string(),
  sha256: z.string(),
  relation: z.union([z.literal("supports"), z.literal("refutes")])
});
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

export const EvidenceClaimSchema = z.object({
  id: z.string(),
  statement: z.string(),
  limitations: z.string(),
  status: z.union([
    z.literal("proposed"),
    z.literal("confirmed"),
    z.literal("refuted")
  ]),
  sources: z.array(z.lazy(() => EvidenceSourceSchema)),
  createdAt: z.string(),
  confirmedAt: z.union([z.string(), z.null()])
});
export type EvidenceClaim = z.infer<typeof EvidenceClaimSchema>;

export const ClaimProposalSchema = z.object({
  statement: z.string().trim().min(1).max(4000),
  limitations: z.string().max(4000),
  sources: z
    .array(
      z.object({
        runId: z.string().min(1),
        artifactPath: RelativePathSchema,
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        relation: z.enum(["supports", "refutes"])
      })
    )
    .min(1)
    .max(100)
});
export const ResearchDecisionSchema = z.object({
  id: z.string(),
  action: z.union([
    z.literal("continue"),
    z.literal("repair"),
    z.literal("stop"),
    z.literal("reject")
  ]),
  reason: z.string(),
  claimIds: z.array(z.string()),
  createdAt: z.string()
});
export type ResearchDecision = z.infer<typeof ResearchDecisionSchema>;

export const DecisionSchema = z.object({
  action: z.enum(["continue", "repair", "stop", "reject"]),
  reason: z.string().trim().min(1).max(4000),
  claimIds: z.array(z.string().min(1)).max(100)
});
export const LoopOverviewSchema = z.object({
  compass: z.lazy(() => ResearchCompassSchema),
  plans: z.array(z.lazy(() => ManagedPlanSchema)),
  runs: z.array(z.lazy(() => ManagedRunSchema)),
  claims: z.array(z.lazy(() => EvidenceClaimSchema)),
  decisions: z.array(z.lazy(() => ResearchDecisionSchema))
});
export type LoopOverview = z.infer<typeof LoopOverviewSchema>;

/** Research data exposed to models and Skills excludes executor control tokens. */
export type ResearchStateView = Omit<LoopOverview, "runs"> & {
  runs: Array<Omit<ManagedRun, "jobToken">>;
};
