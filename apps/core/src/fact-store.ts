import type { FactStatus, FactKind, Fact } from "@research-workbench/contracts";
export type { FactStatus, FactKind, Fact } from "@research-workbench/contracts";
import type { DatabaseSync } from "node:sqlite";

/**
 * Facts are the sediment of a research topic: what we believe, what failed, and
 * what is reusable. They are produced by the agent while finishing a run and can
 * only be *confirmed* by a human — the model proposes, the researcher signs off.
 */

export interface CreateFactInput {
  statement: string;
  kind?: FactKind;
  importance?: number;
  status?: FactStatus;
  topicId?: string;
  questionId?: string;
  taskId?: string;
  runId?: string;
}

interface FactRow {
  id: string;
  topic_id: string | null;
  question_id: string | null;
  task_id: string | null;
  run_id: string | null;
  statement: string;
  kind: string;
  importance: number;
  status: string;
  created_at: string;
  confirmed_at: string | null;
}

const STATUSES: FactStatus[] = [
  "proposed",
  "supported",
  "confirmed",
  "refuted"
];
const KINDS: FactKind[] = ["finding", "negative", "method", "constraint"];

export function isFactStatus(value: unknown): value is FactStatus {
  return STATUSES.includes(value as FactStatus);
}

export function isFactKind(value: unknown): value is FactKind {
  return KINDS.includes(value as FactKind);
}

export class FactStore {
  constructor(private readonly db: DatabaseSync) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS facts (
        id TEXT PRIMARY KEY,
        topic_id TEXT,
        question_id TEXT,
        task_id TEXT,
        run_id TEXT,
        statement TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'finding',
        importance INTEGER NOT NULL DEFAULT 3,
        status TEXT NOT NULL DEFAULT 'proposed',
        created_at TEXT NOT NULL,
        confirmed_at TEXT
      );
    `);
  }

  create(input: CreateFactInput): Fact {
    const statement = input.statement.trim();
    if (!statement) throw new Error("事实内容不能为空");
    const sequence =
      (
        this.db.prepare("SELECT COUNT(*) AS n FROM facts").get() as {
          n: number;
        }
      ).n + 1;
    const id = `F-${String(sequence).padStart(3, "0")}`;
    const createdAt = new Date().toISOString();
    const status = input.status ?? "proposed";
    this.db
      .prepare(
        `INSERT INTO facts
          (id, topic_id, question_id, task_id, run_id, statement, kind, importance, status, created_at, confirmed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .run(
        id,
        input.topicId ?? null,
        input.questionId ?? null,
        input.taskId ?? null,
        input.runId ?? null,
        statement,
        input.kind ?? "finding",
        Math.min(5, Math.max(1, Math.round(input.importance ?? 3))),
        status,
        createdAt
      );
    const created = this.get(id);
    if (!created) throw new Error("事实写入失败");
    return created;
  }

  get(id: string): Fact | null {
    const row = this.db.prepare("SELECT * FROM facts WHERE id = ?").get(id) as
      FactRow | undefined;
    return row ? toFact(row) : null;
  }

  list(filter: { topicId?: string } = {}): Fact[] {
    const rows = filter.topicId
      ? (this.db
          .prepare(
            "SELECT * FROM facts WHERE topic_id = ? ORDER BY importance DESC, created_at DESC LIMIT 200"
          )
          .all(filter.topicId) as unknown as FactRow[])
      : (this.db
          .prepare(
            "SELECT * FROM facts ORDER BY importance DESC, created_at DESC LIMIT 200"
          )
          .all() as unknown as FactRow[]);
    return rows.map(toFact);
  }

  setStatus(id: string, status: FactStatus): Fact {
    if (!isFactStatus(status)) throw new Error("事实状态无效");
    const existing = this.get(id);
    if (!existing) throw new Error(`事实不存在：${id}`);
    this.db
      .prepare("UPDATE facts SET status = ?, confirmed_at = ? WHERE id = ?")
      .run(
        status,
        status === "confirmed"
          ? new Date().toISOString()
          : existing.confirmedAt,
        id
      );
    const updated = this.get(id);
    if (!updated) throw new Error(`事实不存在：${id}`);
    return updated;
  }
}

function toFact(row: FactRow): Fact {
  return {
    id: row.id,
    topicId: row.topic_id,
    questionId: row.question_id,
    taskId: row.task_id,
    runId: row.run_id,
    statement: row.statement,
    kind: isFactKind(row.kind) ? row.kind : "finding",
    importance: row.importance,
    status: isFactStatus(row.status) ? row.status : "proposed",
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at
  };
}
