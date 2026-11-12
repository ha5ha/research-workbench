import type {
  GitFileChange,
  GitStatus,
  GitCommitInfo
} from "@research-workbench/contracts";
export type {
  GitFileChange,
  GitStatus,
  GitCommitInfo
} from "@research-workbench/contracts";
import {
  basename,
  isAbsolute,
  normalize,
  sep,
  relative,
  resolve
} from "node:path";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { atomicWorkspaceWrite, workspacePath } from "./workspace.js";
import type { WorkspaceTransaction } from "./workspace-mutations.js";
import { statSync } from "node:fs";
import { simpleGit, type SimpleGit } from "simple-git";
import { executionEnvironment } from "./execution-env.js";

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
    const fileBinary = this.gitBinary && isAbsolute(this.gitBinary);
    if (
      fileBinary &&
      (!/^git(?:\.exe)?$/i.test(basename(this.gitBinary!)) ||
        /[\x00-\x1f]/.test(this.gitBinary!) ||
        !statSync(this.gitBinary!).isFile())
    )
      throw new Error("Git 路径必须指向 git 可执行文件");
    const git = simpleGit({
      baseDir: this.workspaceRoot,
      unsafe: { allowUnsafeCustomBinary: Boolean(fileBinary) }
    });
    git.env(executionEnvironment(this.workspaceRoot) as Record<string, string>);
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

  /** Local-only Git metadata; never edit a research project's tracked ignore file. */
  async ensureInternalExcludes(): Promise<{
    configured: boolean;
    reason?: string;
  }> {
    if (!(await this.status()).available)
      return { configured: false, reason: "非 Git 工作区，无需修改忽略规则" };
    const gitPath = (
      await this.git.raw(["rev-parse", "--git-path", "info/exclude"])
    ).trim();
    const target = resolve(this.workspaceRoot, gitPath);
    const path = relative(resolve(this.workspaceRoot), target);
    // Linked worktrees may share metadata outside the selected workspace. Leave it alone.
    if (
      !path ||
      isAbsolute(path) ||
      path === ".." ||
      path.startsWith(`..${sep}`)
    )
      return {
        configured: false,
        reason: "Git 排除文件位于工作区外；由 Core 的 Git 路径策略保护内部文件"
      };
    await workspacePath(this.workspaceRoot, path);
    const info = await lstat(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (info && (!info.isFile() || info.nlink !== 1 || info.isSymbolicLink()))
      throw new Error("Git 排除文件不是独立普通文件");
    const text = info ? await readFile(target, "utf8") : "";
    const lines = text.split(/\r?\n/).map((line) => line.trim());
    const missing = ["/.research/", "/.agent/", "/uploads/"].filter(
      (entry) => !lines.includes(entry)
    );
    if (missing.length)
      await atomicWorkspaceWrite(
        this.workspaceRoot,
        path,
        `${text}${text && !text.endsWith("\n") ? "\n" : ""}# Research Workbench local records\n${missing.join("\n")}\n`
      );
    return { configured: true };
  }

  async autoCommit(
    message = "chore: agent changes",
    ownership?: {
      before: GitStatus;
      transaction: WorkspaceTransaction;
    }
  ): Promise<{
    commit: string;
  } | null> {
    if (
      !ownership ||
      ownership.transaction.commandsRan ||
      !ownership.before.available
    )
      return null;
    const status = await this.status();
    if (!status.available) return null;
    const preexisting = new Set(
      [...ownership.before.staged, ...ownership.before.working].map(
        (file) => file.path
      )
    );
    const staged = new Set(status.staged.map((file) => file.path));
    const owned = new Map(
      ownership.transaction.writes.map((write) => [write.path, write.sha256])
    );
    const unique: string[] = [];
    for (const [path, sha256] of owned) {
      assertPath(path, true);
      if (preexisting.has(path) || staged.has(path)) continue;
      const target = await workspacePath(this.workspaceRoot, path);
      const actual = createHash("sha256")
        .update(await readFile(target))
        .digest("hex");
      if (actual === sha256) unique.push(path);
    }
    if (unique.length === 0) return null;
    // --only is Git's native path-limited commit: unrelated staged files stay staged.
    // Intent-to-add permits owned new files without staging their current content.
    await this.git.add(["--intent-to-add", "--", ...unique]);
    const result = await this.git.commit(message, unique, { "--only": null });
    return { commit: result.commit };
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
    const args = staged ? ["--cached", "--", safePath] : ["--", safePath];
    const diff = await this.git.diff(args);
    return diff.length > MAX_DIFF_BYTES
      ? `${diff.slice(0, MAX_DIFF_BYTES)}\n… diff truncated`
      : diff;
  }

  async stage(paths: string[]): Promise<void> {
    await this.git.add(paths.map((path) => assertPath(path, true)));
  }

  async unstage(paths: string[]): Promise<void> {
    await this.git.reset([
      "--",
      ...paths.map((path) => assertPath(path, true))
    ]);
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
