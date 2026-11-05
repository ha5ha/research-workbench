/**
 * Structured cards the Core emits into the conversation stream.
 *
 * The chat is the control plane: research objects (task books, archives, facts)
 * must appear where the conversation happens instead of only in a separate
 * records page. Cards carry a small payload; the authoritative state still lives
 * in SQLite.
 */

export interface TaskbookCard {
  kind: "taskbook";
  experimentId: string;
  title: string;
  goal: string;
  hypothesis: string;
  design: string;
  metrics: string;
  seeds: number;
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

export type AgentCard = TaskbookCard | ArchiveCard;
