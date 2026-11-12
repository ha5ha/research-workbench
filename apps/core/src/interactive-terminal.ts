import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import type { CommandResult } from "@research-workbench/contracts";
import { executionEnvironment, SecretOutputRedactor } from "./execution-env.js";
import { workspacePath } from "./workspace.js";
import { terminateProcessTree } from "./process-tree.js";

const MAX_OUTPUT = 64 * 1024;
const MAX_LOG = 4 * 1024 * 1024;
export class InteractiveTerminal {
  private readonly controllers = new Set<AbortController>();
  constructor(
    private readonly workspaceRoot: string,
    private readonly terminate = terminateProcessTree
  ) {}
  cancel(): number {
    const count = this.controllers.size;
    for (const controller of this.controllers) controller.abort();
    return count;
  }
  async run(
    command: string,
    timeoutMs = 30_000,
    signal?: AbortSignal
  ): Promise<CommandResult> {
    const root = await realpath(this.workspaceRoot);
    const logPath = `.research/terminal/${randomUUID()}.log`;
    const logFile = await workspacePath(root, logPath, true);
    await mkdir(join(root, ".research", "terminal"), { recursive: true });
    const controller = new AbortController();
    this.controllers.add(controller);
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      return await new Promise<CommandResult>((resolve, reject) => {
        const windows = process.platform === "win32";
        const shell = windows ? "powershell.exe" : "/bin/sh";
        const args = windows
          ? ["-NoProfile", "-NonInteractive", "-Command", command]
          : ["-c", command];
        const child = spawn(shell, args, {
          cwd: root,
          windowsHide: true,
          detached: !windows,
          env: executionEnvironment(root)
        });
        let stdout = "",
          stderr = "";
        let timedOut = false,
          canceled = false,
          closed = false,
          stopping = false;
        let pendingLog: Promise<unknown> = Promise.resolve(),
          loggedBytes = 0;
        let logFailure: unknown;
        const log = (text: string) => {
          const available = Math.max(0, MAX_LOG - loggedBytes);
          const bytes = Buffer.from(text, "utf8");
          let end = Math.min(bytes.length, available);
          // Do not split a UTF-8 character at the byte quota boundary.
          while (end > 0 && end < bytes.length && (bytes[end]! & 0xc0) === 0x80)
            end -= 1;
          const data = bytes.subarray(0, end);
          loggedBytes += data.length;
          if (data.length)
            pendingLog = pendingLog.then(async () => {
              if (logFailure) return;
              try {
                await appendFile(logFile, data, { mode: 0o600 });
              } catch (error) {
                logFailure = error;
              }
            });
        };
        let retry: ReturnType<typeof setTimeout> | undefined;
        const stop = async (reason: "timeout" | "canceled") => {
          if (closed || stopping || !child.pid) return;
          timedOut ||= reason === "timeout";
          canceled ||= reason === "canceled";
          stopping = true;
          log(
            `\n[terminal ${reason}: terminating owned process tree ${child.pid}]\n`
          );
          try {
            await this.terminate(child.pid);
          } catch {
            const message = "进程树终止失败，保留根进程并重试";
            stderr = limited(stderr, `\n${message}`);
            log(`\n[${message}]\n`);
            // Never orphan grandchildren by falling back to child.kill().
            if (!closed) retry = setTimeout(() => void stop(reason), 1000);
          } finally {
            stopping = false;
          }
        };
        const onAbort = () => void stop("canceled");
        controller.signal.addEventListener("abort", onAbort);
        const timer = setTimeout(() => void stop("timeout"), timeoutMs);
        child.once("spawn", () => {
          if (controller.signal.aborted) onAbort();
        });
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        const stdoutRedactor = new SecretOutputRedactor();
        const stderrRedactor = new SecretOutputRedactor();
        child.stdout.on("data", (chunk: string) => {
          const text = stdoutRedactor.write(chunk);
          stdout = limited(stdout, text);
          log(text);
        });
        child.stderr.on("data", (chunk: string) => {
          const text = stderrRedactor.write(chunk);
          stderr = limited(stderr, text);
          log(text);
        });
        child.on("error", (error) => {
          const text = stderrRedactor.write(error.message);
          stderr = limited(stderr, text);
          log(text);
        });
        child.once("close", (exitCode) => {
          closed = true;
          clearTimeout(timer);
          if (retry) clearTimeout(retry);
          controller.signal.removeEventListener("abort", onAbort);
          const stdoutTail = stdoutRedactor.end();
          const stderrTail = stderrRedactor.end();
          stdout = limited(stdout, stdoutTail);
          stderr = limited(stderr, stderrTail);
          log(stdoutTail);
          log(stderrTail);
          log(
            `\n[terminal closed: code=${exitCode}, timeout=${timedOut}, canceled=${canceled}]\n`
          );
          pendingLog.then(() => {
            if (logFailure) {
              reject(logFailure);
              return;
            }
            resolve({
              stdout,
              stderr,
              exitCode,
              timedOut,
              canceled,
              shell: windows ? "PowerShell" : "sh",
              logPath
            });
          }, reject);
        });
      });
    } finally {
      this.controllers.delete(controller);
      signal?.removeEventListener("abort", cancel);
    }
  }
}
function limited(current: string, text: string): string {
  if (current.length >= MAX_OUTPUT) return current;
  const next = current + text;
  return next.length > MAX_OUTPUT
    ? `${next.slice(0, MAX_OUTPUT)}\n… output truncated; see terminal log`
    : next;
}
