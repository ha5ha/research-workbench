import type { ScheduleKind, Schedule } from "@research-workbench/contracts";
export type { ScheduleKind, Schedule } from "@research-workbench/contracts";
import type { DatabaseSync } from "node:sqlite";

/**
 * Durable schedules. Following the Cloudflare Agents scheduler pattern:
 * schedules live in SQLite, survive restarts, and registration is idempotent
 * (upsert by stable id) so starting the Core twice does not create duplicates.
 */

export interface UpsertScheduleInput {
  id: string;
  kind: ScheduleKind;
  intervalSeconds: number;
  enabled?: boolean;
}

interface ScheduleRow {
  id: string;
  kind: string;
  interval_seconds: number;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string;
  created_at: string;
}

function toSchedule(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    kind: row.kind === "digest" ? "digest" : "digest",
    intervalSeconds: row.interval_seconds,
    enabled: row.enabled === 1,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    createdAt: row.created_at
  };
}

export class ScheduleStore {
  constructor(private readonly db: DatabaseSync) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        interval_seconds INTEGER NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run_at TEXT,
        next_run_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  /** Idempotent: repeated calls with the same id keep the existing row. */
  upsert(input: UpsertScheduleInput): Schedule {
    const existing = this.get(input.id);
    if (existing) {
      this.db
        .prepare(
          "UPDATE schedules SET interval_seconds = ?, enabled = ? WHERE id = ?"
        )
        .run(
          input.intervalSeconds,
          (input.enabled ?? existing.enabled) ? 1 : 0,
          input.id
        );
      return this.get(input.id) as Schedule;
    }
    const now = new Date();
    const next = new Date(now.getTime() + input.intervalSeconds * 1000);
    this.db
      .prepare(
        `INSERT INTO schedules (id, kind, interval_seconds, enabled, last_run_at, next_run_at, created_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?)`
      )
      .run(
        input.id,
        input.kind,
        input.intervalSeconds,
        input.enabled === false ? 0 : 1,
        next.toISOString(),
        now.toISOString()
      );
    return this.get(input.id) as Schedule;
  }

  get(id: string): Schedule | null {
    const row = this.db
      .prepare("SELECT * FROM schedules WHERE id = ?")
      .get(id) as ScheduleRow | undefined;
    return row ? toSchedule(row) : null;
  }

  list(): Schedule[] {
    const rows = this.db
      .prepare("SELECT * FROM schedules ORDER BY created_at ASC")
      .all() as unknown as ScheduleRow[];
    return rows.map(toSchedule);
  }

  setEnabled(id: string, enabled: boolean): Schedule {
    this.db
      .prepare("UPDATE schedules SET enabled = ? WHERE id = ?")
      .run(enabled ? 1 : 0, id);
    const updated = this.get(id);
    if (!updated) throw new Error(`定时任务不存在：${id}`);
    return updated;
  }

  setInterval(id: string, intervalSeconds: number): Schedule {
    this.db
      .prepare("UPDATE schedules SET interval_seconds = ? WHERE id = ?")
      .run(intervalSeconds, id);
    const updated = this.get(id);
    if (!updated) throw new Error(`定时任务不存在：${id}`);
    return updated;
  }

  markRun(id: string, at: Date): Schedule {
    const schedule = this.get(id);
    if (!schedule) throw new Error(`定时任务不存在：${id}`);
    const next = new Date(at.getTime() + schedule.intervalSeconds * 1000);
    this.db
      .prepare(
        "UPDATE schedules SET last_run_at = ?, next_run_at = ? WHERE id = ?"
      )
      .run(at.toISOString(), next.toISOString(), id);
    return this.get(id) as Schedule;
  }
}
