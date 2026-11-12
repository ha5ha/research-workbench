import { z } from "zod";
import { ResearchScopeSchema } from "./kernel.js";
import { ApprovalRequestSchema } from "./chat.js";
import { AgentCardSchema } from "./models.js";
import { RunStateSchema } from "./research-loop.js";

const Identity = z.object({
  conversationId: z.string().min(1),
  turnId: z.string().min(1)
});
export const AgentStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("started") }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({
    type: z.literal("tool-start"),
    toolName: z.string(),
    toolCallId: z.string().min(1)
  }),
  z.object({
    type: z.literal("tool-end"),
    toolName: z.string(),
    toolCallId: z.string().min(1),
    isError: z.boolean()
  }),
  z.object({ type: z.literal("card"), card: AgentCardSchema }),
  z.object({ type: z.literal("completed"), text: z.string() }),
  z.object({ type: z.literal("failed"), message: z.string() })
]);
export type AgentStreamEvent = z.infer<typeof AgentStreamEventSchema>;
const Stream = <S extends z.ZodRawShape>(shape: S) => Identity.extend(shape);
const Lifecycle = z.object({ scope: ResearchScopeSchema }).strict();
export const RpcEventPayloads = {
  "agent.started": z.union([Stream({ type: z.literal("started") }), Lifecycle]),
  "agent.delta": Stream({ type: z.literal("delta"), text: z.string() }),
  "agent.tool-start": Stream({
    type: z.literal("tool-start"),
    toolName: z.string(),
    toolCallId: z.string().min(1)
  }),
  "agent.tool-end": Stream({
    type: z.literal("tool-end"),
    toolName: z.string(),
    toolCallId: z.string().min(1),
    isError: z.boolean()
  }),
  "agent.card": Stream({ type: z.literal("card"), card: AgentCardSchema }),
  "agent.completed": z.union([
    Stream({ type: z.literal("completed"), text: z.string() }),
    Lifecycle
  ]),
  "agent.failed": z.union([
    Stream({ type: z.literal("failed"), message: z.string() }),
    z.object({ message: z.string() }).strict()
  ]),
  "agent.approval-required": ApprovalRequestSchema,
  "agent.approval-timeout": ApprovalRequestSchema,
  "agent.approval-resolved": z.object({
    id: z.string(),
    approved: z.boolean()
  }),
  "skill.started": z.object({
    skillId: z.string(),
    scope: ResearchScopeSchema
  }),
  "skill.completed": z.object({
    skillId: z.string(),
    status: z.enum(["succeeded", "failed"]),
    warnings: z.number()
  }),
  "skill.failed": z.object({ skillId: z.string(), message: z.string() }),
  "artifact.created": z.object({
    skillId: z.string(),
    artifactId: z.string(),
    path: z.string(),
    sha256: z.string()
  }),
  "experiments.changed": z.object({ count: z.number() }),
  "runs.changed": z.object({ id: z.string(), state: RunStateSchema }),
  "git.committed": z.object({ commit: z.string() }),
  "git.auto-commit-failed": z.object({ message: z.string() }),
  "git.auto-commit-skipped": z.object({ reason: z.string() }),
  "schedule.digest": z.object({
    scheduleId: z.string(),
    title: z.string(),
    lines: z.array(z.string()),
    actionable: z.boolean()
  })
} as const;
export type RpcEventType = keyof typeof RpcEventPayloads;
export type RpcEventPayload<T extends RpcEventType> = z.infer<
  (typeof RpcEventPayloads)[T]
>;
const eventParams = <T extends RpcEventType>(type: T) =>
  z.object({
    seq: z.number().int().positive(),
    type: z.literal(type),
    at: z.string().datetime(),
    payload: RpcEventPayloads[type]
  });
const [first, second, ...rest] = (
  Object.keys(RpcEventPayloads) as RpcEventType[]
).map(eventParams);
export const RpcEventSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.literal("event"),
  params: z.union([first!, second!, ...rest])
});
// Mapped discriminated union preserves the correlation between type and payload.
export type RpcEvent = {
  [T in RpcEventType]: {
    jsonrpc: "2.0";
    method: "event";
    params: { seq: number; type: T; at: string; payload: RpcEventPayload<T> };
  };
}[RpcEventType];
export function parseRpcEvent(value: unknown): RpcEvent {
  const result = RpcEventSchema.safeParse(value);
  if (!result.success)
    throw new Error("PROTOCOL_ERROR: event does not match contracts");
  return result.data as RpcEvent;
}
