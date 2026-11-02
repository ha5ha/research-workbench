import { isAbsolute, normalize, sep } from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";

export interface GitFileChange {
  path: string;
  status: string;
  staged: boolean;
}

export interface GitStatus {
  available: boolean;
  reason?: string;
  branch?: string;
  ahead?: number;
  behind?: number;
  staged: GitFileChange[];
  working: GitFileChange[];
}

export interface GitCommitInfo {
  hash: string;
  message: string;
  date: string;
  author: string;
}

const MAX_DIFF_BYTES = 512 * 1024;

export class GitService {
  private git: SimpleGit;
  private autoCommitEnabled: boolean;
  private gitBinary: string | undefined;

  constructor(
    private readonly workspaceRoot: string,
    options: { binary?: string; autoCommit?: boolean } = {}
  ) {
    this.gitBinary = options.binary;
    this.autoCommitEnabled = options.autoCommit ?? false;
    this.git = this.createGit();
  }

  private createGit(): SimpleGit {
    const git = simpleGit({ baseDir: this.workspaceRoot });
    if (this.gitBinary) git.customBinary(this.gitBinary);
    return git;
  }

  configure(options: { binary?: string; autoCommit?: boolean }): void {
    if (options.binary !== undefined) {
      this.gitBinary = options.binary.trim() || undefined;
      this.git = this.createGit();
    }
    if (options.autoCommit !== undefined) {
      this.autoCommitEnabled = options.autoCommit;
    }
  }

  isAutoCommitEnabled(): boolean {
    return this.autoCommitEnabled;
  }

  async version(): Promise<string> {
    return (await this.git.raw(["--version"])).trim();
  }

  async autoCommit(message = "chore: agent changes"): Promise<{
    commit: string;
  } | null> {
    const status = await this.status();
    if (!status.available) return null;
    const paths = [
      ...status.staged.map((file) => file.path),
      ...status.working.map((file) => file.path)
    ];
    const unique = [...new Set(paths)];
    if (unique.length === 0) return null;
    await this.git.add(unique);
    return this.commit(message);
  }

  async status(): Promise<GitStatus> {
    try {
      if (!(await this.git.checkIsRepo())) {
        return {
          available: false,
          reason: "工作区不是 Git 仓库",
          staged: [],
          working: []
        };
      }
      const status = await this.git.status();
      const staged: GitFileChange[] = [];
      const working: GitFileChange[] = [];
      for (const file of status.files) {
        if (isIgnoredPath(file.path)) continue;
        if (file.index && file.index !== " " && file.index !== "?") {
          staged.push({
            path: file.path,
            status: file.index,
            staged: true
          });
        }
        if (file.working_dir && file.working_dir !== " ") {
          working.push({
            path: file.path,
            status: file.working_dir,
            staged: false
          });
        }
      }
      return {
        available: true,
        branch: status.current ?? undefined,
        ahead: status.ahead,
        behind: status.behind,
        staged,
        working
      };
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : "Git 不可用",
        staged: [],
        working: []
      };
    }
  }

  async diff(path: string, staged: boolean): Promise<string> {
    const safePath = assertPath(path, true);
    const args = staged
      ? ["--cached", "--", safePath]
      : ["--", safePath];
    const diff = await this.git.diff(args);
    return diff.length > MAX_DIFF_BYTES
      ? `${diff.slice(0, MAX_DIFF_BYTES)}\n… diff truncated`
      : diff;
  }

  async stage(paths: string[]): Promise<void> {
    await this.git.add(paths.map((path) => assertPath(path, true)));
  }

  async unstage(paths: string[]): Promise<void> {
    await this.git.reset(["--", ...paths.map((path) => assertPath(path, true))]);
  }

  async commit(message: string): Promise<{ commit: string }> {
    if (!message.trim()) throw new Error("Commit message 不能为空");
    const status = await this.status();
    if (!status.available) throw new Error(status.reason ?? "Git 不可用");
    if (status.staged.length === 0) throw new Error("没有暂存变更可提交");
    const result = await this.git.commit(message.trim());
    return { commit: result.commit };
  }

  async log(limit = 20): Promise<GitCommitInfo[]> {
    try {
      const log = await this.git.log({ maxCount: limit });
      return log.all.map((entry) => ({
        hash: entry.hash,
        message: entry.message,
        date: entry.date,
        author: entry.author_name
      }));
    } catch {
      return [];
    }
  }

  async head(): Promise<string | null> {
    try {
      return (await this.git.revparse(["HEAD"])).trim() || null;
    } catch {
      return null;
    }
  }
}

function assertPath(path: string, rejectIgnored = false): string {
  if (!path || isAbsolute(path)) {
    throw new Error("Git 路径必须是工作区相对路径");
  }
  const normalized = normalize(path);
  if (
    normalized === ".." ||
    normalized.startsWith(`..${sep}`) ||
    normalized.split(/[\\/]/).includes("..")
  ) {
    throw new Error("Git 路径越出工作区");
  }
  if (rejectIgnored && isIgnoredPath(path)) {
    throw new Error("应用内部记录不纳入 Git");
  }
  return path;
}

function isIgnoredPath(path: string): boolean {
  const normalized = path.split("\\").join("/");
  return (
    normalized === ".research" ||
    normalized.startsWith(".research/") ||
    normalized === ".agent" ||
    normalized.startsWith(".agent/") ||
    normalized === "uploads" ||
    normalized.startsWith("uploads/") ||
    normalized === "node_modules" ||
    normalized.startsWith("node_modules/") ||
    normalized === "release" ||
    normalized.startsWith("release/")
  );
}
