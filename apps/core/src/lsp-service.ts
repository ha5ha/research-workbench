import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";

export interface LspEndpoint {
  url: string;
  server: string;
}

/**
 * Bridges a stdio language server to the renderer through a localhost
 * WebSocket. Only loopback clients are accepted.
 */
export class LspService {
  private child: ChildProcessWithoutNullStreams | null = null;
  private wsServer: WebSocketServer | null = null;
  private endpoint: LspEndpoint | null = null;
  private buffer = Buffer.alloc(0);
  private lastError = "";

  constructor(private readonly workspaceRoot: string) {}

  async start(): Promise<LspEndpoint | null> {
    if (this.endpoint) return this.endpoint;
    const serverPath = process.env.RW_LSP_SERVER;
    if (!serverPath || !existsSync(serverPath)) return null;

    this.child = spawn(process.execPath, [serverPath, "--stdio"], {
      cwd: dirname(serverPath),
      env: {
        ...process.env,
        NODE_PATH: join(dirname(serverPath), "vendor"),
        ...(process.versions.electron
          ? { ELECTRON_RUN_AS_NODE: "1" }
          : {})
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    this.child.stdout.on("data", (chunk: Buffer) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.lastError = chunk.toString("utf8").slice(-2000);
    });
    this.child.on("exit", () => {
      this.endpoint = null;
      this.wsServer?.close();
      this.wsServer = null;
      this.child = null;
    });

    const wsServer = new WebSocketServer({
      host: "127.0.0.1",
      port: 0
    });
    await new Promise<void>((resolve, reject) => {
      wsServer.once("listening", resolve);
      wsServer.once("error", reject);
    });
    wsServer.on("connection", (socket) => {
      socket.on("message", (data) => this.toLanguageServer(data.toString()));
      socket.on("close", () => {
        if (this.wsServer && this.wsServer.clients.size === 0) {
          this.stop();
        }
      });
    });
    this.wsServer = wsServer;
    const address = wsServer.address();
    if (!address || typeof address === "string") {
      throw new Error("无法分配 LSP 端口");
    }
    this.endpoint = {
      url: `ws://127.0.0.1:${address.port}`,
      server: "typescript"
    };
    return this.endpoint;
  }

  status(): {
    running: boolean;
    url: string | null;
    workspace: string;
    error: string | null;
  } {
    return {
      running: Boolean(this.endpoint),
      url: this.endpoint?.url ?? null,
      workspace: this.workspaceRoot,
      error: this.lastError || null
    };
  }

  stop(): void {
    this.wsServer?.close();
    this.wsServer = null;
    this.endpoint = null;
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }

  private toLanguageServer(message: string): void {
    if (!this.child || !message.trim()) return;
    const length = Buffer.byteLength(message);
    this.child.stdin.write(`Content-Length: ${length}\r\n\r\n${message}`);
  }

  private onStdout(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = this.buffer.subarray(0, headerEnd).toString("ascii");
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (this.buffer.length < start + length) return;
      const body = this.buffer.subarray(start, start + length).toString("utf8");
      this.buffer = this.buffer.subarray(start + length);
      this.broadcast(body);
    }
  }

  private broadcast(message: string): void {
    if (!this.wsServer) return;
    for (const client of this.wsServer.clients as Set<WebSocket>) {
      if (client.readyState === 1) client.send(message);
    }
  }
}
