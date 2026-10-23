import { z } from "zod";

export const ResearchScopeSchema = z.object({
  projectId: z.string().min(1),
  questionId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional()
});
export type ResearchScope = z.infer<typeof ResearchScopeSchema>;

export const ArtifactRefSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  kind: z.string().min(1),
  mime: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().nonnegative(),
  createdAt: z.string().datetime()
});
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;

export const SkillStatusSchema = z.enum(["runnable", "planned", "disabled"]);
export type SkillStatus = z.infer<typeof SkillStatusSchema>;

export const SkillManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/),
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().min(1),
  lastReviewed: z.string().min(1),
  allowedTools: z.array(z.string().min(1)).default([]),
  status: SkillStatusSchema.default("runnable"),
  path: z.string().min(1)
});
export type SkillManifest = z.infer<typeof SkillManifestSchema>;

export const SkillRunInputSchema = z.object({
  scope: ResearchScopeSchema,
  artifacts: z.array(ArtifactRefSchema).default([]),
  params: z.record(z.unknown()).default({})
});
export type SkillRunInput = z.infer<typeof SkillRunInputSchema>;

export const SkillRunResultSchema = z.object({
  skillId: z.string().min(1),
  version: z.string().min(1),
  status: z.enum(["succeeded", "failed"]),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  artifacts: z.array(ArtifactRefSchema),
  summary: z.string(),
  warnings: z.array(z.string()),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1)
    })
    .optional()
});
export type SkillRunResult = z.infer<typeof SkillRunResultSchema>;

export interface ArtifactWriteInput {
  name: string;
  content: string | Uint8Array;
  mime: string;
  kind: string;
}

export interface SkillToolGateway {
  readText(path: string): Promise<string>;
  writeArtifact(input: ArtifactWriteInput): Promise<ArtifactRef>;
}

export interface SkillContext {
  scope: ResearchScope;
  workspaceRoot: string;
  params: Record<string, unknown>;
  tools: SkillToolGateway;
  signal?: AbortSignal;
}

export interface ResearchSkill {
  manifest: SkillManifest;
  run(input: SkillRunInput, context: SkillContext): Promise<SkillRunResult>;
}

export const ActionRiskSchema = z.enum([
  "read",
  "write",
  "execute",
  "network",
  "destructive"
]);
export type ActionRisk = z.infer<typeof ActionRiskSchema>;

export const ApprovalModeSchema = z.enum(["auto", "required", "forbidden"]);
export type ApprovalMode = z.infer<typeof ApprovalModeSchema>;

export const ActionSpecSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  risk: ActionRiskSchema,
  approval: ApprovalModeSchema
});
export type ActionSpec = z.infer<typeof ActionSpecSchema>;

export const PolicyDecisionSchema = z.object({
  allowed: z.boolean(),
  approvalRequired: z.boolean(),
  reason: z.string().min(1)
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export const ObservationSchema = z.object({
  scope: ResearchScopeSchema,
  summary: z.string(),
  facts: z.array(z.string()),
  artifactCount: z.number().int().nonnegative(),
  actions: z.array(ActionSpecSchema)
});
export type Observation = z.infer<typeof ObservationSchema>;

export const DomainEventSchema = z.object({
  type: z.string().min(1),
  at: z.string().datetime(),
  payload: z.record(z.unknown())
});
export type DomainEvent = z.infer<typeof DomainEventSchema>;

export const ActionResultSchema = z.object({
  actionId: z.string().min(1),
  status: z.enum(["applied", "approval-required", "rejected"]),
  detail: z.string(),
  events: z.array(DomainEventSchema)
});
export type ActionResult = z.infer<typeof ActionResultSchema>;

export interface ResearchEnvironment {
  observe(scope: ResearchScope): Promise<Observation>;
  listActions(scope: ResearchScope): Promise<ActionSpec[]>;
  validate(scope: ResearchScope, actionId: string): Promise<PolicyDecision>;
  apply(
    scope: ResearchScope,
    actionId: string
  ): Promise<ActionResult>;
}

export const ErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SKILL_FAILED: -32000,
  WORKSPACE_DENIED: -32001,
  APPROVAL_REQUIRED: -32002
} as const;

export type RpcId = string | number | null;

export const RpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string().min(1),
  params: z.unknown().optional()
});
export type RpcRequest = z.infer<typeof RpcRequestSchema>;

export interface RpcSuccess {
  jsonrpc: "2.0";
  id: RpcId;
  result: unknown;
}

export interface RpcFailure {
  jsonrpc: "2.0";
  id: RpcId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface RpcEvent {
  jsonrpc: "2.0";
  method: "event";
  params: {
    seq: number;
    type: string;
    at: string;
    payload: unknown;
  };
}
