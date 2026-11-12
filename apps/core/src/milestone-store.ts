import type { Milestone } from "@research-workbench/contracts";
export type { Milestone } from "@research-workbench/contracts";
import type { DatabaseSync } from "node:sqlite";

/**
 * Milestones are the bounded, durable record of "what actually happened" in a
 * research task. The conversation can be compacted or restarted; milestones
 * cannot be lost, and they are what a task timeline is rebuilt from.
 *
 * They are written from the structured cards the agent emits, so a milestone
 * always corresponds to a real object (task book, run, archive), never to prose.
 */

export interface RecordMilestoneInput {
  taskId?: string;
  kind: string;
  title: string;
  experimentId?: string;
  payload?: unknown;
  at?: string;
}

interface MilestoneRow {
  id: string;
  task_id: string | null;
  kind: string;
  title: string;
  experiment_id: string | null;
  payload: string | null;
  at: string;
}

export class MilestoneStore {
  constructor(private readonly db: DatabaseSync) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS milestones (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        experiment_id TEXT,
        payload TEXT,
        at TEXT NOT NULL
      );
    `);
  }

  record(input: RecordMilestoneInput): Milestone {
    const sequence =
      (
        this.db.prepare("SELECT COUNT(*) AS n FROM milestones").get() as {
          n: number;
        }
      ).n + 1;
    const id = `M-${String(sequence).padStart(4, "0")}`;
    const at = input.at ?? new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO milestones (id, task_id, kind, title, experiment_id, payload, at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.taskId ?? null,
        input.kind,
        input.title.slice(0, 300),
        input.experimentId ?? null,
        input.payload === undefined ? null : JSON.stringify(input.payload),
        at
      );
    return {
      id,
      taskId: input.taskId ?? null,
      kind: input.kind,
      title: input.title.slice(0, 300),
      experimentId: input.experimentId ?? null,
      at
    };
  }

  list(filter: { taskId?: string; limit?: number } = {}): Milestone[] {
    const limit = Math.min(200, Math.max(1, filter.limit ?? 50));
    const rows = filter.taskId
      ? (this.db
          .prepare(
            "SELECT * FROM milestones WHERE task_id = ? ORDER BY at DESC LIMIT ?"
          )
          .all(filter.taskId, limit) as unknown as MilestoneRow[])
      : (this.db
          .prepare("SELECT * FROM milestones ORDER BY at DESC LIMIT ?")
          .all(limit) as unknown as MilestoneRow[]);
    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      kind: row.kind,
      title: row.title,
      experimentId: row.experiment_id,
      at: row.at
    }));
  }
}
