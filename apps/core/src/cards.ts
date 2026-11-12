export type {
  SimilarEvidence,
  TaskbookCard,
  ArchiveFactSummary,
  ArchiveCard,
  RunPlanCard,
  AgentCard
} from "@research-workbench/contracts";
/**
 * Structured cards the Core emits into the conversation stream.
 *
 * The chat is the control plane: research objects (task books, archives, facts)
 * must appear where the conversation happens instead of only in a separate
 * records page. Cards carry a small payload; the authoritative state still lives
 * in SQLite.
 */
