/**
 * Structured cards the Core emits into the conversation stream.
 *
 * The chat is the control plane: research objects (task books, archives, facts)
 * must appear where the conversation happens instead of only in a separate
 * records page. Cards carry a small payload; the authoritative state still lives
 * in SQLite.
 */

export interface SimilarEvidence {
  id: string;
  text: string;
  kind?: string;
  score: number;
}

export interface TaskbookCard {
  kind: "taskbook";
  experimentId: string;
  title: string;
  goal: string;
  hypothesis: string;
  design: string;
  metrics: string;
  seeds: number;
  /** A task book is a proposal until a human confirms it. */
  status: "draft" | "confirmed";
  /** Prior evidence that looks like the same experiment (dedupe aid). */
  similar: SimilarEvidence[];
}

export interface ArchiveFactSummary {
  id: string;
  statement: string;
  kind: string;
  importance: number;
}

export interface ArchiveCard {
  kind: "archive";
  experimentId: string;
  title: string;
  status: string;
  metrics: string | null;
  conclusion: string | null;
  artifactCount: number;
  seedCount: number;
  reusable: { kind: string; description: string; path?: string } | null;
  facts: ArchiveFactSummary[];
  discarded: Array<{ what: string; reason: string }>;
}

export interface RunPlanCard {
  kind: "run_plan";
  planId: string;
  experimentId: string;
  title: string;
}

export type AgentCard = TaskbookCard | ArchiveCard | RunPlanCard;
