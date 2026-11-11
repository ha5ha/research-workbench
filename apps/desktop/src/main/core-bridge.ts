import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import {
  SSH_ERROR_MESSAGES,
  SshHostKeySchema,
  type RpcEvent
} from "@research-workbench/contracts";

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
  timer?: ReturnType<typeof setTimeout>;
  privateRequest?: boolean;
  method: string;
}

type PrivateSshMethod =
  "$private.ssh.configure" | "$private.ssh.probe" | "$private.ssh.test";

const DEFAULT_TIMEOUT_MS = 20_000;
/** Core waits up to 120s for a user approval; leave headroom beyond that. */
const APPROVAL_TIMEOUT_MS = 180_000;
/**
 * Agent turns stream progress through events and resolve only when the whole
 * turn is done, so a fixed request timeout would cut legitimate work. The turn
 * still ends through the event stream and `agent.reset`.
 */
const NO_TIMEOUT = 0;
const METHOD_TIMEOUTS: Record<string, number> = {
  "runs.propose": 180_000,
  "runs.start": 180_000,
  "runs.get": 90_000,
  "loop.overview": 180_000,
  "agent.chat": NO_TIMEOUT,
  "workspace.write": APPROVAL_TIMEOUT_MS,
  "terminal.run": APPROVAL_TIMEOUT_MS,
  "git.commit": APPROVAL_TIMEOUT_MS
};

function timeoutFor(method: string): number {
  return METHOD_TIMEOUTS[method] ?? DEFAULT_TIMEOUT_MS;
}

export class CoreBridge {
  private child: ChildProcessWithoutNullStreams | undefined;
  private pending = new Map<string, Pending>();
  private seq = 0;
  private status: CoreStatus = { state: "stopped", message: "未连接" };
  private secrets = new Set<string>();
  private suppressDiagnostics = false;

  constructor(private readonly options: CoreBridgeOptions) {}

  getStatus(): CoreStatus {
    return { ...this.status };
  }

  start(): void {
    if (this.child) return;
    const coreCli = `${this.options.repoRoot}/apps/core/src/cli.ts`;
    const launch = this.options.launch ?? {
      command: process.env.RW_NODE_BIN ?? "node",
      args: ["--import", "tsx", coreCli, "--workspace", this.options.workspace],
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

    lines.on("line", (line) => {
      if (this.child === child) this.handleLine(line);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (this.child !== child) return;
      // A password may be split across stderr chunks; never forward those bytes.
      const text = this.suppressDiagnostics
        ? "Core 诊断输出已隐藏（凭据已配置）"
        : chunk.trim();
      if (text) process.stderr.write(`[core] ${text}\n`);
    });
    child.on("spawn", () => {
      if (this.child !== child) return;
      this.setStatus({ state: "online", message: "Core 已连接" });
    });
    child.on("error", (error) => {
      if (this.child !== child) return;
      this.setStatus({ state: "error", message: error.message });
      this.failPending(error);
    });
    child.on("exit", (code, signal) => {
      lines.close();
      this.closePipes(child);
      if (this.child !== child) return;
      this.secrets.clear();
      this.child = undefined;
      this.failPending(
        new Error(
          `Core 已退出（code=${code ?? "null"}, signal=${signal ?? "null"}）`
        )
      );
      this.setStatus({
        state: code === 0 ? "stopped" : "error",
        message:
          code === 0 ? "Core 已停止" : `Core 异常退出（${code ?? "unknown"}）`
      });
    });
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    if (method.startsWith("$private.")) throw new Error("SSH_ACCESS_DENIED");
    return this.send<T>(method, params, false);
  }

  /** Main-only control: never expose this through generic Renderer IPC. */
  async requestPrivate<T>(
    method: PrivateSshMethod,
    params: unknown
  ): Promise<T> {
    if (
      ![
        "$private.ssh.configure",
        "$private.ssh.probe",
        "$private.ssh.test"
      ].includes(method)
    ) {
      throw new Error("SSH_ACCESS_DENIED");
    }
    if (
      method === "$private.ssh.configure" &&
      params &&
      typeof params === "object" &&
      "profiles" in params &&
      Array.isArray(params.profiles)
    ) {
      this.secrets.clear();
      for (const entry of params.profiles) {
        if (
          entry &&
          typeof entry === "object" &&
          "password" in entry &&
          typeof entry.password === "string" &&
          entry.password
        ) {
          this.secrets.add(entry.password);
          this.suppressDiagnostics = true;
        }
      }
    }
    return this.send<T>(method, params, true);
  }

  private async send<T>(
    method: string,
    params: unknown,
    privateRequest: boolean
  ): Promise<T> {
    if (!this.child || this.status.state !== "online") {
      throw new Error(
        privateRequest
          ? "SSH_CONNECT_FAILED"
          : this.status.message || "Core 未连接"
      );
    }
    const id = String(++this.seq);
    const timeoutMs = timeoutFor(method);
    return new Promise<T>((resolve, reject) => {
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              this.pending.delete(id);
              reject(
                new Error(
                  privateRequest ? "SSH_TIMEOUT" : `Core 请求超时：${method}`
                )
              );
            }, timeoutMs)
          : undefined;
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
        privateRequest,
        method
      });
      this.child?.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`
      );
    });
  }

  stop(): void {
    this.secrets.clear();
    const child = this.child;
    if (!child) return;
    this.setStatus({ state: "stopped", message: "正在停止 Core" });
    this.child = undefined;
    this.closePipes(child);
    child.kill();
    this.failPending(new Error("Core 已停止"));
  }

  private closePipes(child: ChildProcessWithoutNullStreams): void {
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
  }

  private handleLine(line: string): void {
    if (this.status.state !== "online") return;
    const trimmed = line.trim();
    if (!trimmed) return;
    let message: unknown;
    try {
      message = JSON.parse(trimmed);
    } catch {
      process.stderr.write("[core] 无法解析输出\n");
      return;
    }

    if (
      message !== null &&
      typeof message === "object" &&
      "method" in message &&
      message.method === "event"
    ) {
      const event = message as RpcEvent;
      // Private control replies are never Renderer events, even on protocol errors.
      if (!event.params?.type?.startsWith("$private."))
        this.options.onEvent(this.redactValue(event) as RpcEvent);
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
    if (pending.timer) clearTimeout(pending.timer);

    if ("error" in message && message.error) {
      const error = message.error as { message?: string; code?: number };
      if (pending.privateRequest) {
        const code =
          typeof error.message === "string" &&
          error.message in SSH_ERROR_MESSAGES
            ? error.message
            : "SSH_PROTOCOL_FAILED";
        pending.reject(new Error(code));
        return;
      }
      pending.reject(
        new Error(
          this.redact(error.message ?? `Core 错误 ${error.code ?? "unknown"}`)
        )
      );
      return;
    }
    const result =
      "result" in message ? (message as { result: unknown }).result : undefined;
    if (pending.privateRequest) {
      const input =
        result && typeof result === "object"
          ? (result as Record<string, unknown>)
          : {};
      if (
        pending.method === "$private.ssh.configure" &&
        input.configured === true
      )
        pending.resolve({ configured: true });
      else if (
        pending.method === "$private.ssh.test" &&
        input.connected === true
      )
        pending.resolve({ connected: true });
      else if (
        pending.method === "$private.ssh.probe" &&
        SshHostKeySchema.safeParse(input.hostKeySha256).success
      ) {
        pending.resolve({ hostKeySha256: input.hostKeySha256 });
      } else pending.reject(new Error("SSH_PROTOCOL_FAILED"));
      return;
    }
    pending.resolve(this.redactValue(result));
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(
        pending.privateRequest ? new Error("SSH_CONNECT_FAILED") : error
      );
    }
    this.pending.clear();
  }

  private setStatus(status: CoreStatus): void {
    this.status = status;
    this.options.onStatus(status);
  }

  private redact(value: string): string {
    let result = value;
    for (const secret of this.secrets)
      result = result.split(secret).join("[redacted]");
    return result;
  }

  private redactValue(value: unknown): unknown {
    if (typeof value === "string") return this.redact(value);
    if (Array.isArray(value))
      return value.map((item) => this.redactValue(item));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          this.redact(key),
          this.redactValue(item)
        ])
      );
    return value;
  }
}
