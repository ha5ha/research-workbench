import { z } from "zod";
import type { SshConnectionIdentity } from "./ssh.js";

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
export interface SnapshotFile {
  path: string;
  sha256: string;
  size: number;
  executable?: boolean;
}
/** Complete UTF-8 content of one manifest file, verified against its frozen identity. */
export interface FrozenFileContent {
  planId: string;
  path: string;
  sha256: string;
  size: number;
  content: string;
}
export interface ManagedPlan {
  sshConnection?: SshConnectionIdentity;
  id: string;
  version: number;
  proposal: RunProposal;
  taskbookHash: string;
  revision: string;
  codeHash: string;
  inputHash: string;
  environmentHash: string;
  comparableGroup: string;
  files: SnapshotFile[];
  digest: string;
  approvedAt: string | null;
  closure: {
    kind: "dismissed" | "superseded";
    at: string;
    actor: "human" | "agent" | "system";
    reason: string;
    replacementPlanId: string | null;
  } | null;
  createdAt: string;
}
export type RunState =
  | "preparing"
  | "running"
  | "collecting"
  | "succeeded"
  | "failed"
  | "canceled"
  | "unknown";
export interface RunArtifact {
  path: string;
  sha256: string | null;
  size: number;
  status: "present" | "missing" | "rejected";
  reason?: string;
}
export interface ManagedRun {
  id: string;
  planId: string;
  experimentId: string;
  attempt: number;
  idempotencyKey: string;
  state: RunState;
  jobToken: string;
  pid: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  reason: string | null;
  metrics: Record<string, number>;
  artifacts: RunArtifact[];
  cancelRequested: boolean;
}
export interface RunDetail {
  run: ManagedRun;
  plan: ManagedPlan;
  events: RunEvent[];
}
export interface RunEvent {
  seq: number;
  runId: string;
  at: string;
  type: string;
  detail: string;
}
export interface ResearchCompass {
  goal: string;
  constraints: string;
  stopConditions: string;
  nextStep: string;
  nextStepReason: string;
  updatedAt: string;
}
export const CompassUpdateSchema = z.object({
  goal: z.string().max(2000),
  constraints: z.string().max(2000),
  stopConditions: z.string().max(2000),
  nextStep: z.string().max(2000),
  nextStepReason: z.string().max(2000)
});
export interface EvidenceSource {
  runId: string;
  artifactPath: string;
  sha256: string;
  relation: "supports" | "refutes";
}
export interface EvidenceClaim {
  id: string;
  statement: string;
  limitations: string;
  status: "proposed" | "confirmed" | "refuted";
  sources: EvidenceSource[];
  createdAt: string;
  confirmedAt: string | null;
}
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
export interface ResearchDecision {
  id: string;
  action: "continue" | "repair" | "stop" | "reject";
  reason: string;
  claimIds: string[];
  createdAt: string;
}
export const DecisionSchema = z.object({
  action: z.enum(["continue", "repair", "stop", "reject"]),
  reason: z.string().trim().min(1).max(4000),
  claimIds: z.array(z.string().min(1)).max(100)
});
export interface LoopOverview {
  compass: ResearchCompass;
  plans: ManagedPlan[];
  runs: ManagedRun[];
  claims: EvidenceClaim[];
  decisions: ResearchDecision[];
}
/** Research data exposed to models and Skills excludes executor control tokens. */
export type ResearchStateView = Omit<LoopOverview, "runs"> & {
  runs: Array<Omit<ManagedRun, "jobToken">>;
};
