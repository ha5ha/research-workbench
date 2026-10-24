import { spawn } from "node:child_process";
import { readdir, realpath } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { WorkspaceToolGateway } from "./workspace.js";

export interface WorkspaceEntry {
  path: string;
  name: string;
  type: "file" | "directory";
  depth: number;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
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
const MAX_ENTRIES = 400;
const MAX_OUTPUT = 64 * 1024;

export class WorkspaceService {
  private readonly gateway: WorkspaceToolGateway;

  constructor(private readonly workspaceRoot: string) {
    this.gateway = new WorkspaceToolGateway(workspaceRoot);
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
        if (SKIP.has(child.name) || child.name.startsWith(".")) continue;
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
          if (depth < 3) await walk(full, depth + 1);
        } else if (child.isFile()) {
          entries.push({ path, name: child.name, type: "file", depth });
        }
      }
    };

    await walk(root, 0);
    return entries;
  }

  async read(path: string): Promise<{ path: string; content: string }> {
    return { path, content: await this.gateway.readText(path) };
  }

  async write(
    path: string,
    content: string
  ): Promise<{ path: string; size: number; sha256: string }> {
    return this.gateway.writeText(path, content);
  }

  async run(command: string, timeoutMs = 30_000): Promise<CommandResult> {
    const root = await realpath(this.workspaceRoot);
    return new Promise<CommandResult>((resolve) => {
      const child = spawn(command, {
        cwd: root,
        shell: true,
        windowsHide: true,
        env: { ...process.env, RW_WORKSPACE: root }
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout = appendLimited(stdout, chunk);
      });
      child.stderr.on("data", (chunk: string) => {
        stderr = appendLimited(stderr, chunk);
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr: `${stderr}\n${error.message}`.trim(),
          exitCode: null,
          timedOut
        });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: code, timedOut });
      });
    });
  }
}

function appendLimited(current: string, chunk: string): string {
  const next = current + chunk;
  if (next.length <= MAX_OUTPUT) return next;
  return `${next.slice(0, MAX_OUTPUT)}\n… output truncated at ${MAX_OUTPUT} chars`;
}
