import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ExperimentFileDiff } from "./experiment-service.js";

export type ExperimentStatus = "pending" | "archived" | "failed";

export interface TaskBook {
  id: string;
  version: number;
  goal: string;
  hypothesis: string;
  design: string;
  metrics: string;
  seeds: number;
  config?: Record<string, unknown>;
}

export interface SeedResult {
  seed: number | string;
  metrics: Record<string, string | number>;
  note?: string;
}

export interface StoredExperiment {
  id: string;
  title: string;
  status: ExperimentStatus;
  taskBook: TaskBook;
  metrics: string | null;
  seeds: number | null;
  conclusion: string | null;
  scope: unknown;
  files: ExperimentFileDiff[];
  artifacts: Array<{ path: string; kind: string }>;
  seedResults: SeedResult[];
  startedAt: string;
  finishedAt: string | null;
}

export interface ExperimentSummary {
  id: string;
  title: string;
  status: ExperimentStatus;
  taskBook: TaskBook;
  metrics: string | null;
  seeds: number | null;
  conclusion: string | null;
  /** Research scope the record belongs to (projectId / questionId / taskId). */
  scope: unknown;
  seedResults: SeedResult[];
  startedAt: string;
  finishedAt: string | null;
  fileCount: number;
  additions: number;
  deletions: number;
}

export interface CreateExperimentInput {
  title: string;
  goal: string;
  hypothesis: string;
  design: string;
  metrics: string;
  seeds: number;
  config?: Record<string, unknown>;
  scope?: unknown;
}

export interface FinishExperimentInput {
  metrics?: string;
  seeds?: number;
  conclusion?: string;
  status?: "archived" | "failed";
  artifacts?: Array<{ path: string; kind: string }>;
  seedResults?: SeedResult[];
}

export class ExperimentStore {
  private readonly db: DatabaseSync;

  constructor(workspaceRoot: string) {
    mkdirSync(join(workspaceRoot, ".research"), { recursive: true });
    this.db = new DatabaseSync(join(workspaceRoot, ".research", "workbench.db"));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS experiments (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        task_book TEXT NOT NULL,
        metrics TEXT,
        seeds INTEGER,
        conclusion TEXT,
        scope TEXT,
        files TEXT NOT NULL DEFAULT '[]',
        artifacts TEXT NOT NULL DEFAULT '[]',
        seed_results TEXT NOT NULL DEFAULT '[]',
        started_at TEXT NOT NULL,
        finished_at TEXT
      );
    `);
    const columns = this.db
      .prepare("PRAGMA table_info(experiments)")
      .all() as unknown as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "seed_results")) {
      this.db.exec(
        "ALTER TABLE experiments ADD COLUMN seed_results TEXT NOT NULL DEFAULT '[]'"
      );
    }
  }

  create(input: CreateExperimentInput): StoredExperiment {
    const sequence =
      (this.db.prepare("SELECT COUNT(*) AS n FROM experiments").get() as {
        n: number;
      }).n + 1;
    const id = `RUN-${String(sequence).padStart(3, "0")}`;
    const taskBook: TaskBook = {
      id: `PLAN-${String(sequence).padStart(3, "0")}`,
      version: 1,
      goal: input.goal,
      hypothesis: input.hypothesis,
      design: input.design,
      metrics: input.metrics,
      seeds: input.seeds,
      config: input.config
    };
    const startedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO experiments
          (id, title, status, task_book, metrics, seeds, conclusion, scope, files, artifacts, seed_results, started_at)
         VALUES (?, ?, 'pending', ?, NULL, NULL, NULL, ?, '[]', '[]', '[]', ?)`
      )
      .run(
        id,
        input.title,
        JSON.stringify(taskBook),
        input.scope === undefined ? null : JSON.stringify(input.scope),
        startedAt
      );
    return {
      id,
      title: input.title,
      status: "pending",
      taskBook,
      metrics: null,
      seeds: input.seeds,
      conclusion: null,
      scope: input.scope ?? null,
      files: [],
      artifacts: [],
      seedResults: [],
      startedAt,
      finishedAt: null
    };
  }

  finish(
    id: string,
    input: FinishExperimentInput,
    files: ExperimentFileDiff[]
  ): StoredExperiment {
    const existing = this.get(id);
    if (!existing) throw new Error(`实验记录不存在：${id}`);
    const finishedAt = new Date().toISOString();
    const status = input.status ?? "archived";
    this.db
      .prepare(
        `UPDATE experiments
         SET status = ?, metrics = COALESCE(?, metrics), seeds = COALESCE(?, seeds),
             conclusion = COALESCE(?, conclusion), files = ?, artifacts = ?, seed_results = ?, finished_at = ?
         WHERE id = ?`
      )
      .run(
        status,
        input.metrics ?? null,
        input.seeds ?? null,
        input.conclusion ?? null,
        JSON.stringify(files),
        JSON.stringify(input.artifacts ?? existing.artifacts),
        JSON.stringify(input.seedResults ?? existing.seedResults),
        finishedAt,
        id
      );
    const updated = this.get(id);
    if (!updated) throw new Error(`实验记录不存在：${id}`);
    return updated;
  }

  list(): ExperimentSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, title, status, task_book, metrics, seeds, conclusion, scope,
                started_at, finished_at, files, artifacts, seed_results
         FROM experiments ORDER BY started_at DESC LIMIT 100`
      )
      .all() as unknown as ExperimentRow[];
    return rows.map((row) => this.toSummary(row));
  }

  get(id: string): StoredExperiment | null {
    const row = this.db
      .prepare(
        `SELECT id, title, status, task_book, metrics, seeds, conclusion,
                scope, started_at, finished_at, files, artifacts, seed_results
         FROM experiments WHERE id = ?`
      )
      .get(id) as ExperimentRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      status: row.status as ExperimentStatus,
      taskBook: parseJson<TaskBook>(row.task_book, {
        id: "PLAN-?",
        version: 1,
        goal: "",
        hypothesis: "",
        design: "",
        metrics: "",
        seeds: 0
      }),
      metrics: row.metrics,
      seeds: row.seeds,
      conclusion: row.conclusion,
      scope: parseJson<unknown>(row.scope, null),
      files: parseJson<ExperimentFileDiff[]>(row.files, []),
      artifacts: parseJson<Array<{ path: string; kind: string }>>(
        row.artifacts,
        []
      ),
      seedResults: parseJson<SeedResult[]>(row.seed_results, []),
      startedAt: row.started_at,
      finishedAt: row.finished_at
    };
  }

  close(): void {
    this.db.close();
  }

  private toSummary(row: ExperimentRow): ExperimentSummary {
    const files = parseJson<ExperimentFileDiff[]>(row.files, []);
    return {
      id: row.id,
      title: row.title,
      status: row.status as ExperimentStatus,
      taskBook: parseJson<TaskBook>(row.task_book, {
        id: "PLAN-?",
        version: 1,
        goal: "",
        hypothesis: "",
        design: "",
        metrics: "",
        seeds: 0
      }),
      metrics: row.metrics,
      seeds: row.seeds,
      conclusion: row.conclusion,
      scope: parseJson<unknown>(row.scope, null),
      seedResults: parseJson<SeedResult[]>(row.seed_results, []),
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      fileCount: files.length,
      additions: files.reduce((sum, file) => sum + file.additions, 0),
      deletions: files.reduce((sum, file) => sum + file.deletions, 0)
    };
  }
}

interface ExperimentRow {
  id: string;
  title: string;
  status: string;
  task_book: string;
  metrics: string | null;
  seeds: number | null;
  conclusion: string | null;
  scope?: string | null;
  files: string;
  artifacts: string;
  seed_results: string;
  started_at: string;
  finished_at: string | null;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
