/**
 * Working set: the small, freshly rebuilt state block injected on every turn.
 *
 * Rationale (industry practice): long-running agents do not rely on the raw
 * transcript for "where are we". They re-project a compact task state each turn
 * (Claude Code / Aider repo-map style), score memories by importance and
 * recency (Generative Agents), and page detail in from structured stores
 * (MemGPT core/archival memory). This keeps direction stable even when the
 * conversation itself is long or has been compacted.
 *
 * Everything here is bounded: fixed section sizes and per-line truncation, so
 * the block stays a few hundred tokens no matter how much happened.
 */

export interface WorkingSetTopic {
  id: string;
  title: string;
  description?: string;
}

export interface WorkingSetQuestion {
  id: string;
  title: string;
  status?: string;
}

export interface WorkingSetTask {
  id: string;
  title: string;
  status: string;
}

export interface WorkingSetLiterature {
  title: string;
  url?: string;
  note?: string;
}

export interface WorkingSetFact {
  statement: string;
  kind: string;
  importance: number;
  status: string;
}

export interface WorkingSetRun {
  id: string;
  title: string;
  status: string;
  metrics?: string | null;
  conclusion?: string | null;
  startedAt?: string;
}

export interface WorkingSetInput {
  topic?: WorkingSetTopic | null;
  question?: WorkingSetQuestion | null;
  task?: WorkingSetTask | null;
  literature?: WorkingSetLiterature[];
  facts?: WorkingSetFact[];
  runs?: WorkingSetRun[];
  openTasks?: WorkingSetTask[];
}

const MAX_LITERATURE = 8;
const MAX_FACTS = 6;
const MAX_RUNS = 4;
const MAX_OPEN_TASKS = 5;
const MAX_LINE = 160;

function clip(text: string, max = MAX_LINE): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function bullet(lines: string[], fallback = "- none"): string[] {
  return lines.length === 0 ? [fallback] : lines.map((line) => `- ${clip(line)}`);
}

/** Facts are ranked the way a researcher would: confirmed first, then weight. */
function rankFacts(facts: WorkingSetFact[]): WorkingSetFact[] {
  const weight = (fact: WorkingSetFact): number => {
    const status = fact.status === "confirmed" ? 3 : fact.status === "refuted" ? 2 : 1;
    return status * 10 + fact.importance;
  };
  return [...facts].sort((a, b) => weight(b) - weight(a)).slice(0, MAX_FACTS);
}

export function buildWorkingSet(input: WorkingSetInput): string {
  const {
    topic = null,
    question = null,
    task = null,
    literature = [],
    facts = [],
    runs = [],
    openTasks = []
  } = input;

  const goalParts = [
    topic ? `${topic.id} ${topic.title}` : null,
    question ? `${question.id} ${question.title}` : null,
    task ? `${task.id} ${task.title} (${task.status})` : null
  ].filter(Boolean);

  const lines: string[] = [];
  lines.push("[Working set]");
  lines.push(`Goal: ${goalParts.length > 0 ? goalParts.join(" / ") : "no topic selected"}`);
  if (topic?.description) {
    lines.push(`Topic note: ${clip(topic.description, 200)}`);
  }

  lines.push("Facts:");
  lines.push(
    ...bullet(
      rankFacts(facts).map(
        (fact) =>
          `[${fact.status}] ${clip(fact.statement)} (${fact.kind}, w${fact.importance})`
      )
    )
  );

  lines.push("Recent runs:");
  lines.push(
    ...bullet(
      [...runs]
        .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""))
        .slice(0, MAX_RUNS)
        .map((run) => {
          const metrics = run.metrics ? ` metrics=${clip(run.metrics, 60)}` : "";
          const conclusion = run.conclusion
            ? ` → ${clip(run.conclusion, 90)}`
            : "";
          return `${run.id} ${clip(run.title, 80)} [${run.status}]${metrics}${conclusion}`;
        })
    )
  );

  lines.push("Literature:");
  lines.push(
    ...bullet(
      literature.slice(0, MAX_LITERATURE).map((item) => {
        const url = item.url ? ` <${clip(item.url, 80)}>` : "";
        const note = item.note ? ` — ${clip(item.note, 80)}` : "";
        return `${clip(item.title, 100)}${url}${note}`;
      })
    )
  );

  lines.push("Open tasks:");
  lines.push(
    ...bullet(
      openTasks
        .filter((item) => item.status !== "done")
        .slice(0, MAX_OPEN_TASKS)
        .map((item) => `${item.id} ${clip(item.title, 100)} (${item.status})`)
    )
  );

  return lines.join("\n");
}
