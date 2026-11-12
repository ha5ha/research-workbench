import { z } from "zod";
import { ArtifactRefSchema, ResearchScopeSchema } from "./kernel.js";

export const SessionIdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/);
export const AgentSpikeResultSchema = z.object({
  text: z.string(),
  toolNames: z.array(z.string()),
  toolCallAttempts: z.array(z.string()),
  blockedTools: z.array(z.string()),
  artifacts: z.array(ArtifactRefSchema),
  sessionFile: SessionIdSchema.nullable(),
  systemPrompts: z.array(z.string()),
  eventTypes: z.array(z.string())
});
export type AgentSpikeResult = z.infer<typeof AgentSpikeResultSchema>;

export const AgentChatResultSchema = z.object({
  text: z.string(),
  mode: z.enum(["faux", "deepseek", "openai"]),
  sessionFile: SessionIdSchema.nullable()
});
export type AgentChatResult = z.infer<typeof AgentChatResultSchema>;
export const ContextUsageSchema = z.object({
  tokens: z.number().nullable(),
  percent: z.number().nullable(),
  contextWindow: z.number()
});
export type ContextUsage = z.infer<typeof ContextUsageSchema>;
export const CoreStatusSchema = z.object({
  state: z.enum(["starting", "online", "stopped", "error"]),
  message: z.string()
});
export type CoreStatus = z.infer<typeof CoreStatusSchema>;
export const HelloSchema = z.object({
  name: z.string(),
  version: z.string(),
  workspaceRoot: z.string(),
  projectId: z.string(),
  capabilities: z.array(z.string())
});
export type Hello = z.infer<typeof HelloSchema>;
export const SessionSummarySchema = z.object({
  file: SessionIdSchema,
  id: SessionIdSchema,
  title: z.string(),
  startedAt: z.string(),
  size: z.number(),
  messages: z.number()
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;
export const TranscriptMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string()
});
export type TranscriptMessage = z.infer<typeof TranscriptMessageSchema>;
export const ApprovalInputSchema = z.object({
  toolName: z.string(),
  title: z.string(),
  detail: z.string(),
  consequence: z.string().optional(),
  scope: ResearchScopeSchema.optional()
});
export type ApprovalInput = z.infer<typeof ApprovalInputSchema>;
export const ApprovalRequestSchema = ApprovalInputSchema.extend({
  id: z.string()
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
export const UploadedFileSchema = z.object({
  path: z.string(),
  name: z.string(),
  size: z.number(),
  modifiedAt: z.string()
});
export type UploadedFile = z.infer<typeof UploadedFileSchema>;
