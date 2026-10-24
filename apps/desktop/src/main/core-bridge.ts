import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { RpcEvent } from "@research-workbench/contracts";

export type CoreState = "starting" | "online" | "stopped" | "error";

export interface CoreStatus {
  state: CoreState;
  message: string;
}

interface CoreLaunch {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}

interface CoreBridgeOptions {
  repoRoot: string;
  workspace: string;
  launch?: CoreLaunch;
  onEvent: (event: RpcEvent) => void;
  onStatus: (status: CoreStatus) => void;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class CoreBridge {
  private child: ChildProcessWithoutNullStreams | undefined;
  private pending = new Map<string, Pending>();
  private seq = 0;
  private status: CoreStatus = { state: "stopped", message: "未连接" };

  constructor(private readonly options: CoreBridgeOptions) {}

  getStatus(): CoreStatus {
    return { ...this.status };
  }

  start(): void {
    if (this.child) return;
    const coreCli = `${this.options.repoRoot}/apps/core/src/cli.ts`;
    const launch =
      this.options.launch ??
      {
        command: process.env.RW_NODE_BIN ?? "node",
        args: [
          "--import",
          "tsx",
          coreCli,
          "--workspace",
          this.options.workspace
        ],
        cwd: this.options.repoRoot
      };
    this.setStatus({ state: "starting", message: "正在启动 Core" });

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(launch.command, launch.args, {
        cwd: launch.cwd,
        windowsHide: true,
        env: {
          ...process.env,
          ...launch.env,
          RW_WORKSPACE: this.options.workspace
        }
      });
    } catch (error) {
      this.setStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Core 启动失败"
      });
      return;
    }

    this.child = child;
    const lines = createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
      terminal: false
    });

    lines.on("line", (line) => this.handleLine(line));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      const text = chunk.trim();
      if (text) process.stderr.write(`[core] ${text}\n`);
    });
    child.on("spawn", () => {
      this.setStatus({ state: "online", message: "Core 已连接" });
    });
    child.on("error", (error) => {
      this.setStatus({ state: "error", message: error.message });
      this.failPending(error);
    });
    child.on("exit", (code, signal) => {
      this.child = undefined;
      this.failPending(
        new Error(`Core 已退出（code=${code ?? "null"}, signal=${signal ?? "null"}）`)
      );
      this.setStatus({
        state: code === 0 ? "stopped" : "error",
        message: code === 0 ? "Core 已停止" : `Core 异常退出（${code ?? "unknown"}）`
      });
    });
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    if (!this.child || this.status.state !== "online") {
      throw new Error(this.status.message || "Core 未连接");
    }
    const id = String(++this.seq);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Core 请求超时：${method}`));
      }, 20_000);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer
      });
      this.child?.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`
      );
    });
  }

  stop(): void {
    if (!this.child) return;
    this.setStatus({ state: "stopped", message: "正在停止 Core" });
    this.child.kill();
    this.child = undefined;
    this.failPending(new Error("Core 已停止"));
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message: unknown;
    try {
      message = JSON.parse(trimmed);
    } catch {
      process.stderr.write(`[core] 无法解析输出：${trimmed.slice(0, 200)}\n`);
      return;
    }

    if (
      message !== null &&
      typeof message === "object" &&
      "method" in message &&
      message.method === "event"
    ) {
      this.options.onEvent(message as RpcEvent);
      return;
    }

    if (
      message === null ||
      typeof message !== "object" ||
      !("id" in message) ||
      (typeof message.id !== "string" && typeof message.id !== "number")
    ) {
      return;
    }

    const pending = this.pending.get(String(message.id));
    if (!pending) return;
    this.pending.delete(String(message.id));
    clearTimeout(pending.timer);

    if ("error" in message && message.error) {
      const error = message.error as { message?: string; code?: number };
      pending.reject(
        new Error(error.message ?? `Core 错误 ${error.code ?? "unknown"}`)
      );
      return;
    }
    pending.resolve(
      "result" in message ? (message as { result: unknown }).result : undefined
    );
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private setStatus(status: CoreStatus): void {
    this.status = status;
    this.options.onStatus(status);
  }
}
