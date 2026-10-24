import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { createTwoFilesPatch } from "diff";

export type ExperimentKind = "agent" | "terminal" | "experiment";
export type ExperimentStatus = "completed" | "failed";

export interface ExperimentFileDiff {
  path: string;
  status: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
  diff: string;
  before: string;
  after: string;
}

export interface ExperimentSummary {
  id: string;
  kind: ExperimentKind;
  title: string;
  status: ExperimentStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  scope?: unknown;
  fileCount: number;
  additions: number;
  deletions: number;
}

export interface ExperimentRecord extends ExperimentSummary {
  files: ExperimentFileDiff[];
  artifacts: Array<{ path: string; kind: string }>;
}

export interface ExperimentSession {
  id: string;
  kind: ExperimentKind;
  title: string;
  startedAt: string;
  scope?: unknown;
  before: Map<string, string>;
}

const SKIP = new Set([
  ".git",
  ".research",
  ".agent",
  "node_modules",
  "out",
  "dist",
  "release"
]);
const MAX_FILES = 500;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_SNAPSHOT_TEXT = 128 * 1024;
const MAX_DIFF_BYTES = 256 * 1024;
const MAX_CHANGED_FILES = 80;

export class ExperimentService {
  constructor(private readonly workspaceRoot: string) {}

  async begin(
    kind: ExperimentKind,
    title: string,
    scope?: unknown
  ): Promise<ExperimentSession> {
    return {
      id: createRunId(),
      kind,
      title,
      startedAt: new Date().toISOString(),
      scope,
      before: await this.snapshot()
    };
  }

  async finish(
    session: ExperimentSession,
    status: ExperimentStatus = "completed"
  ): Promise<ExperimentRecord> {
    const after = await this.snapshot();
    const paths = [...new Set([...session.before.keys(), ...after.keys()])]
      .sort()
      .slice(0, MAX_CHANGED_FILES);
    const files: ExperimentFileDiff[] = [];

    for (const path of paths) {
      const before = session.before.get(path);
      const current = after.get(path);
      if (before === current) continue;
      const changeStatus =
        before === undefined ? "added" : current === undefined ? "deleted" : "modified";
      const beforeText = clip(before ?? "", MAX_SNAPSHOT_TEXT);
      const afterText = clip(current ?? "", MAX_SNAPSHOT_TEXT);
      const diff = clip(
        createTwoFilesPatch(
          path,
          path,
          before ?? "",
          current ?? "",
          "before",
          "after",
          { context: 3 }
        ),
        MAX_DIFF_BYTES
      );
      const { additions, deletions } = countDiffLines(diff);
      files.push({
        path,
        status: changeStatus,
        additions,
        deletions,
        diff,
        before: beforeText,
        after: afterText
      });
    }

    const finishedAt = new Date().toISOString();
    const artifacts = [...after.keys()]
      .filter(
        (path) =>
          session.before.get(path) !== after.get(path) && isArtifactPath(path)
      )
      .map((path) => ({ path, kind: artifactKind(path) }));
    const record: ExperimentRecord = {
      id: session.id,
      kind: session.kind,
      title: session.title,
      status,
      startedAt: session.startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(session.startedAt),
      scope: session.scope,
      fileCount: files.length,
      additions: files.reduce((sum, file) => sum + file.additions, 0),
      deletions: files.reduce((sum, file) => sum + file.deletions, 0),
      files,
      artifacts
    };
    await this.writeRecord(record);
    return record;
  }

  async list(): Promise<ExperimentSummary[]> {
    const dir = this.runsDir();
    const names = await readdir(dir).catch(() => [] as string[]);
    const records = await Promise.all(
      names
        .filter((name) => name.endsWith(".json"))
        .map(async (name) => {
          const text = await readFile(join(dir, name), "utf8").catch(() => null);
          if (!text) return null;
          try {
            return JSON.parse(text) as ExperimentRecord;
          } catch {
            return null;
          }
        })
    );
    return records
      .filter((record): record is ExperimentRecord => record !== null)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 50)
      .map(({ files: _files, ...summary }) => summary);
  }

  async get(id: string): Promise<ExperimentRecord | null> {
    if (!/^[a-zA-Z0-9._-]+$/.test(id)) return null;
    const text = await readFile(join(this.runsDir(), `${id}.json`), "utf8").catch(
      () => null
    );
    if (!text) return null;
    try {
      return JSON.parse(text) as ExperimentRecord;
    } catch {
      return null;
    }
  }

  private async snapshot(): Promise<Map<string, string>> {
    const root = await realpath(this.workspaceRoot);
    const files = new Map<string, string>();
    const walk = async (dir: string): Promise<void> => {
      if (files.size >= MAX_FILES) return;
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (files.size >= MAX_FILES) return;
        if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
        if (entry.isSymbolicLink()) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }
        if (!entry.isFile()) continue;
        const info = await stat(full);
        if (info.size > MAX_FILE_BYTES) continue;
        const buffer = await readFile(full);
        if (buffer.includes(0)) continue;
        files.set(
          relative(root, full).split(sep).join("/"),
          buffer.toString("utf8")
        );
      }
    };
    await walk(root);
    return files;
  }

  private runsDir(): string {
    return join(this.workspaceRoot, ".research", "runs");
  }

  private async writeRecord(record: ExperimentRecord): Promise<void> {
    const dir = this.runsDir();
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, `${record.id}.json`),
      JSON.stringify(record, null, 2),
      "utf8"
    );
  }
}

function createRunId(): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `run-${stamp}-${randomUUID().slice(0, 8)}`;
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}\n… truncated`;
}

function countDiffLines(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
  }
  return { additions, deletions };
}

function isArtifactPath(path: string): boolean {
  const normalized = path.split("\\").join("/");
  const first = normalized.split("/")[0];
  if (
    first === "results" ||
    first === "artifacts" ||
    first === "figures" ||
    first === "plots"
  ) {
    return true;
  }
  return /\.(png|jpe?g|svg|pdf|csv|tsv|json|html|md|parquet|npy|npz)$/i.test(
    normalized
  );
}

function artifactKind(path: string): string {
  const extension = path.split(".").at(-1)?.toLowerCase();
  if (extension === "png" || extension === "jpg" || extension === "jpeg" || extension === "svg") {
    return "figure";
  }
  if (extension === "csv" || extension === "tsv" || extension === "parquet") {
    return "table";
  }
  if (extension === "json" || extension === "md" || extension === "html") {
    return "report";
  }
  return extension ?? "artifact";
}
