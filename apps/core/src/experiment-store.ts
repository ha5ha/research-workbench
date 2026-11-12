import type {
  ExperimentStatus,
  TaskBook,
  SeedResult,
  ExperimentReusable,
  StoredExperiment,
  ExperimentSummary
} from "@research-workbench/contracts";
import { ResearchScopeSchema } from "@research-workbench/contracts";
export type {
  ExperimentStatus,
  TaskbookStatus,
  TaskBook,
  SeedResult,
  ExperimentReusable,
  StoredExperiment,
  ExperimentSummary
} from "@research-workbench/contracts";
import { lstatSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ExperimentFileDiff } from "./experiment-service.js";

/** A task book is a proposal until a human confirms it (durable approval). */

/** What an experiment left behind that later work can reuse (Hyra-style "tool" output). */

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
  reusable?: ExperimentReusable;
}

export interface UpdateExperimentInput {
  conclusion?: string;
  reusable?: ExperimentReusable | null;
  confirmed?: boolean;
}

export class ExperimentStore {
  private readonly db: DatabaseSync;
  private readonly workspaceLock: DatabaseSync;

  constructor(workspaceRoot: string) {
    const researchRoot = join(workspaceRoot, ".research");
    const researchInfo = lstatSync(researchRoot, { throwIfNoEntry: false });
    if (
      researchInfo &&
      (researchInfo.isSymbolicLink() || !researchInfo.isDirectory())
    )
      throw new Error("研究数据库目录不能是链接或非目录");
    mkdirSync(researchRoot, { recursive: true });
    for (const name of [
      "workbench.db",
      "workbench.db-journal",
      "workbench.db-wal",
      "workbench.db-shm",
      "workbench.lock.db",
      "workbench.lock.db-journal",
      "workbench.lock.db-wal",
      "workbench.lock.db-shm"
    ]) {
      const path = join(researchRoot, name);
      const info = lstatSync(path, { throwIfNoEntry: false });
      if (info && (info.isSymbolicLink() || !info.isFile() || info.nlink > 1))
        throw new Error("研究数据库文件不能是链接或非普通文件");
    }
    this.workspaceLock = acquireWorkspaceLock(
      join(researchRoot, "workbench.lock.db")
    );
    let opened: DatabaseSync | undefined;
    try {
      this.db = opened = new DatabaseSync(join(researchRoot, "workbench.db"));
      this.initialize();
    } catch (error) {
      try {
        if (opened?.isOpen) opened.close();
      } finally {
        this.workspaceLock.close();
      }
      throw error;
    }
  }

  private initialize(): void {
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
        reusable TEXT,
        confirmed_at TEXT,
        taskbook_status TEXT NOT NULL DEFAULT 'confirmed',
        taskbook_confirmed_at TEXT,
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
    if (!columns.some((column) => column.name === "reusable")) {
      this.db.exec("ALTER TABLE experiments ADD COLUMN reusable TEXT");
    }
    if (!columns.some((column) => column.name === "confirmed_at")) {
      this.db.exec("ALTER TABLE experiments ADD COLUMN confirmed_at TEXT");
    }
    if (!columns.some((column) => column.name === "taskbook_status")) {
      // Records created before confirmation existed were already executed.
      this.db.exec(
        "ALTER TABLE experiments ADD COLUMN taskbook_status TEXT NOT NULL DEFAULT 'confirmed'"
      );
    }
    if (!columns.some((column) => column.name === "taskbook_confirmed_at")) {
      this.db.exec(
        "ALTER TABLE experiments ADD COLUMN taskbook_confirmed_at TEXT"
      );
    }
  }

  create(input: CreateExperimentInput): StoredExperiment {
    const sequence =
      (
        this.db.prepare("SELECT COUNT(*) AS n FROM experiments").get() as {
          n: number;
        }
      ).n + 1;
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
          (id, title, status, task_book, metrics, seeds, conclusion, scope, files, artifacts, seed_results, taskbook_status, started_at)
         VALUES (?, ?, 'pending', ?, NULL, NULL, NULL, ?, '[]', '[]', '[]', 'draft', ?)`
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
      taskbookStatus: "draft",
      taskbookConfirmedAt: null,
      metrics: null,
      seeds: input.seeds,
      conclusion: null,
      scope: input.scope ?? null,
      files: [],
      artifacts: [],
      seedResults: [],
      reusable: null,
      confirmedAt: null,
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
    if (existing.status !== "pending" || existing.confirmedAt)
      throw new Error("已归档/确认的实验不可覆盖，请创建新实验");
    if (existing.taskbookStatus !== "confirmed")
      throw new Error("任务书尚未确认，不能归档实验");
    const finishedAt = new Date().toISOString();
    const status = input.status ?? "archived";
    this.db
      .prepare(
        `UPDATE experiments
         SET status = ?, metrics = COALESCE(?, metrics), seeds = COALESCE(?, seeds),
             conclusion = COALESCE(?, conclusion), files = ?, artifacts = ?, seed_results = ?,
             reusable = COALESCE(?, reusable), finished_at = ?
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
        input.reusable ? JSON.stringify(input.reusable) : null,
        finishedAt,
        id
      );
    const updated = this.get(id);
    if (!updated) throw new Error(`实验记录不存在：${id}`);
    return updated;
  }

  /** Human approval of a proposed task book; the durable gate before running. */
  confirmTaskbook(id: string): StoredExperiment {
    const existing = this.get(id);
    if (!existing) throw new Error(`实验记录不存在：${id}`);
    this.db
      .prepare(
        `UPDATE experiments
         SET taskbook_status = 'confirmed', taskbook_confirmed_at = ?
         WHERE id = ?`
      )
      .run(new Date().toISOString(), id);
    const updated = this.get(id);
    if (!updated) throw new Error(`实验记录不存在：${id}`);
    return updated;
  }

  /** Open (not yet archived) experiments whose task book is still a draft. */
  pendingDraftTaskbooks(taskId?: string): StoredExperiment[] {
    return this.list()
      .filter(
        (record) =>
          record.status === "pending" && record.taskbookStatus === "draft"
      )
      .map((record) => this.get(record.id))
      .filter((record): record is StoredExperiment => Boolean(record))
      .filter((record) => {
        if (!taskId) return true;
        const scope = record.scope as { taskId?: string } | null;
        return scope?.taskId === taskId;
      });
  }

  list(): ExperimentSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, title, status, task_book, metrics, seeds, conclusion, scope,
                started_at, finished_at, files, artifacts, seed_results, reusable, confirmed_at,
                taskbook_status, taskbook_confirmed_at
         FROM experiments ORDER BY started_at DESC LIMIT 100`
      )
      .all() as unknown as ExperimentRow[];
    return rows.map((row) => this.toSummary(row));
  }

  /** Human-authored changes: conclusion, reusable output, or evidence confirmation. */
  update(id: string, input: UpdateExperimentInput): StoredExperiment {
    const existing = this.get(id);
    if (!existing) throw new Error(`实验记录不存在：${id}`);
    const contentChanged =
      (input.conclusion !== undefined &&
        input.conclusion !== existing.conclusion) ||
      (input.reusable !== undefined &&
        JSON.stringify(input.reusable) !== JSON.stringify(existing.reusable));
    if (existing.confirmedAt && contentChanged)
      throw new Error("已确认结论不可覆盖，请创建新实验保留更正来源");
    const confirmedAt =
      input.confirmed === false
        ? null
        : input.confirmed
          ? new Date().toISOString()
          : existing.confirmedAt;
    this.db
      .prepare(
        `UPDATE experiments
         SET conclusion = COALESCE(?, conclusion),
             reusable = COALESCE(?, reusable),
             confirmed_at = ?
         WHERE id = ?`
      )
      .run(
        input.conclusion ?? null,
        input.reusable === undefined
          ? null
          : input.reusable === null
            ? "null"
            : JSON.stringify(input.reusable),
        confirmedAt,
        id
      );
    const updated = this.get(id);
    if (!updated) throw new Error(`实验记录不存在：${id}`);
    return updated;
  }

  get(id: string): StoredExperiment | null {
    const row = this.db
      .prepare(
        `SELECT id, title, status, task_book, metrics, seeds, conclusion,
                scope, started_at, finished_at, files, artifacts, seed_results,
                reusable, confirmed_at, taskbook_status, taskbook_confirmed_at
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
      scope: ResearchScopeSchema.partial()
        .nullable()
        .parse(parseJson<unknown>(row.scope, null)),
      files: parseJson<ExperimentFileDiff[]>(row.files, []),
      artifacts: parseJson<Array<{ path: string; kind: string }>>(
        row.artifacts,
        []
      ),
      seedResults: parseJson<SeedResult[]>(row.seed_results, []),
      reusable: parseJson<ExperimentReusable | null>(row.reusable, null),
      confirmedAt: row.confirmed_at ?? null,
      taskbookStatus: row.taskbook_status === "draft" ? "draft" : "confirmed",
      taskbookConfirmedAt: row.taskbook_confirmed_at ?? null,
      startedAt: row.started_at,
      finishedAt: row.finished_at
    };
  }

  close(): void {
    try {
      if (this.db.isOpen) this.db.close();
    } finally {
      if (!this.db.isOpen && this.workspaceLock.isOpen)
        this.workspaceLock.close();
    }
  }

  /** Shared workbench connection so sibling stores do not open a second handle. */
  get database(): DatabaseSync {
    return this.db;
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
      scope: ResearchScopeSchema.partial()
        .nullable()
        .parse(parseJson<unknown>(row.scope, null)),
      seedResults: parseJson<SeedResult[]>(row.seed_results, []),
      reusable: parseJson<ExperimentReusable | null>(row.reusable, null),
      confirmedAt: row.confirmed_at ?? null,
      taskbookStatus: row.taskbook_status === "draft" ? "draft" : "confirmed",
      taskbookConfirmedAt: row.taskbook_confirmed_at ?? null,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      fileCount: files.length,
      additions: files.reduce((sum, file) => sum + file.additions, 0),
      deletions: files.reduce((sum, file) => sum + file.deletions, 0)
    };
  }
}

/** Keep a separate transaction so the research database can use its own transactions. */
function acquireWorkspaceLock(path: string): DatabaseSync {
  const lock = new DatabaseSync(path);
  try {
    lock.exec("PRAGMA busy_timeout=0; BEGIN EXCLUSIVE;");
    return lock;
  } catch (error) {
    lock.close();
    if (
      error !== null &&
      typeof error === "object" &&
      "errcode" in error &&
      (error.errcode === 5 || error.errcode === 6)
    ) {
      throw new Error(
        "工作区已由另一个 Core 使用，请先关闭该工作区后重试。不要删除锁文件。",
        { cause: error }
      );
    }
    throw error;
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
  reusable?: string | null;
  confirmed_at?: string | null;
  taskbook_status?: string | null;
  taskbook_confirmed_at?: string | null;
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
