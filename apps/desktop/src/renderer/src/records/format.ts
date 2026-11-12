import type { ExperimentSummary } from "@research-workbench/contracts";
export function statusLabel(status: ExperimentSummary["status"]): string {
  if (status === "pending") return "待决策";
  if (status === "failed") return "失败";
  return "已归档";
}

export function formatDuration(
  record: Pick<ExperimentSummary, "startedAt" | "finishedAt">
): string {
  const end = record.finishedAt ? Date.parse(record.finishedAt) : Date.now();
  const start = Date.parse(record.startedAt);
  const ms = end - start;
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
