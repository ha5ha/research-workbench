import { z } from "zod";

export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const WorkspaceReadParamsSchema = z.object({ path: z.string().min(1) });
export const WorkspaceWriteParamsSchema = WorkspaceReadParamsSchema.extend({
  content: z.string().max(2 * 1024 * 1024),
  expectedSha256: Sha256Schema.nullable()
});
export const WorkspaceFileSchema = WorkspaceReadParamsSchema.extend({
  content: z.string(),
  sha256: Sha256Schema
});
export type WorkspaceFile = z.infer<typeof WorkspaceFileSchema>;
export const WorkspaceWriteResultSchema = z.object({
  path: z.string(),
  size: z.number().int().nonnegative(),
  sha256: Sha256Schema
});
export const WorkspaceEntrySchema = z.object({
  path: z.string(),
  name: z.string(),
  type: z.enum(["file", "directory"]),
  depth: z.number().int().nonnegative()
});
export type WorkspaceEntry = z.infer<typeof WorkspaceEntrySchema>;
export const CommandResultSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().int().nullable(),
  timedOut: z.boolean(),
  canceled: z.boolean().optional(),
  shell: z.string().optional(),
  logPath: z.string().optional()
});
export type CommandResult = z.infer<typeof CommandResultSchema>;
export const GitFileChangeSchema = z.object({
  path: z.string(),
  status: z.string(),
  staged: z.boolean()
});
export type GitFileChange = z.infer<typeof GitFileChangeSchema>;
export const GitStatusSchema = z.object({
  available: z.boolean(),
  reason: z.string().optional(),
  branch: z.string().optional(),
  ahead: z.number().optional(),
  behind: z.number().optional(),
  staged: z.array(GitFileChangeSchema),
  working: z.array(GitFileChangeSchema)
});
export type GitStatus = z.infer<typeof GitStatusSchema>;
export const GitCommitInfoSchema = z.object({
  hash: z.string(),
  message: z.string(),
  date: z.string(),
  author: z.string()
});
export type GitCommitInfo = z.infer<typeof GitCommitInfoSchema>;
