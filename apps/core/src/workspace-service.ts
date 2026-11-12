import type { UploadedFile } from "@research-workbench/contracts";
export type { UploadedFile } from "@research-workbench/contracts";
import { readdir, realpath, stat, unlink } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { WorkspaceToolGateway } from "./workspace.js";
import { InteractiveTerminal } from "./interactive-terminal.js";
import {
  recordWorkspaceWrite,
  recordWorkspaceCommand
} from "./workspace-mutations.js";
import type {
  CommandResult,
  WorkspaceEntry
} from "@research-workbench/contracts";
export type {
  CommandResult,
  WorkspaceEntry
} from "@research-workbench/contracts";

/** Hidden entries that belong to the app or to tooling; never shown in the IDE tree. */
const SKIP = new Set([
  ".git",
  ".research",
  ".agent",
  ".DS_Store",
  "node_modules",
  "out",
  "dist",
  "release"
]);
const MAX_ENTRIES = 1000;

export class WorkspaceService {
  private readonly gateway: WorkspaceToolGateway;
  private readonly terminal: InteractiveTerminal;

  constructor(private readonly workspaceRoot: string) {
    this.gateway = new WorkspaceToolGateway(workspaceRoot);
    this.terminal = new InteractiveTerminal(workspaceRoot);
  }

  async tree(): Promise<WorkspaceEntry[]> {
    const root = await realpath(this.workspaceRoot);
    const entries: WorkspaceEntry[] = [];

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (entries.length >= MAX_ENTRIES) return;
      const children = await readdir(dir, { withFileTypes: true });
      children.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      for (const child of children) {
        if (entries.length >= MAX_ENTRIES) return;
        if (SKIP.has(child.name)) continue;
        if (child.isSymbolicLink()) continue;
        const full = join(dir, child.name);
        const path = relative(root, full).split(sep).join("/");
        if (child.isDirectory()) {
          entries.push({
            path,
            name: child.name,
            type: "directory",
            depth
          });
          if (depth < 6) await walk(full, depth + 1);
        } else if (child.isFile()) {
          entries.push({ path, name: child.name, type: "file", depth });
        }
      }
    };

    await walk(root, 0);
    return entries;
  }

  async read(
    path: string
  ): Promise<{ path: string; content: string; sha256: string }> {
    return { path, ...(await this.gateway.readVersion(path)) };
  }

  async write(
    path: string,
    content: string,
    expectedSha256?: string | null
  ): Promise<{ path: string; size: number; sha256: string }> {
    const result = await this.gateway.writeText(path, content, expectedSha256);
    recordWorkspaceWrite(result);
    return result;
  }

  /** Attachments copied into `<workspace>/uploads` by the desktop shell. */
  async listUploads(): Promise<UploadedFile[]> {
    const root = await realpath(this.workspaceRoot);
    const dir = join(root, "uploads");
    const entries = await readdir(dir, { withFileTypes: true }).catch(
      () => null
    );
    if (!entries) return [];
    const files: UploadedFile[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const full = join(dir, entry.name);
      const info = await stat(full).catch(() => null);
      if (!info) continue;
      files.push({
        path: `uploads/${entry.name}`,
        name: entry.name,
        size: info.size,
        modifiedAt: info.mtime.toISOString()
      });
    }
    return files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  async deleteUpload(path: string): Promise<void> {
    const normalized = path.replace(/\\/g, "/");
    if (!normalized.startsWith("uploads/") || normalized.includes("..")) {
      throw new Error("只允许删除 uploads/ 下的附件");
    }
    const root = await realpath(this.workspaceRoot);
    const uploadsDir = await realpath(join(root, "uploads"));
    const target = await realpath(join(root, normalized));
    if (!target.startsWith(`${uploadsDir}${sep}`)) {
      throw new Error("附件路径越界");
    }
    await unlink(target);
  }

  run(
    command: string,
    timeoutMs = 30_000,
    signal?: AbortSignal
  ): Promise<CommandResult> {
    recordWorkspaceCommand();
    return this.terminal.run(command, timeoutMs, signal);
  }
  cancelCommands(): number {
    return this.terminal.cancel();
  }
}
