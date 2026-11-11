import { createHash } from "node:crypto";
import { Client, type ConnectConfig } from "ssh2";
import {
  SSH_ERROR_MESSAGES,
  SshConnectionIdentitySchema,
  SshConnectionProfileSchema,
  SshPrivateConfigurationSchema,
  type SshConnectionIdentity,
  type SshConnectionProfile,
  type SshErrorCode
} from "@research-workbench/contracts";
import type { SshRequestTransport } from "./ssh-executor.js";

export class SshConnectionError extends Error {
  constructor(readonly code: SshErrorCode) {
    super(SSH_ERROR_MESSAGES[code]);
  }
}
const failure = (code: SshErrorCode) => new SshConnectionError(code);
const fingerprint = (key: Buffer) =>
  `SHA256:${createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;

/** Only this adapter imports ssh2. Secrets are replaced atomically, never serialized. */
export class SshConnections {
  private entries = new Map<
    string,
    { profile: SshConnectionProfile; password?: string }
  >();
  private readonly clients = new Set<Client>();

  configure(raw: unknown): void {
    const parsed = SshPrivateConfigurationSchema.safeParse(raw);
    if (
      !parsed.success ||
      new Set(parsed.data.profiles.map((entry) => entry.profile.id)).size !==
        parsed.data.profiles.length
    ) {
      throw failure("SSH_INVALID_INPUT");
    }
    this.dispose();
    this.entries = new Map(
      parsed.data.profiles.map((entry) => [entry.profile.id, entry])
    );
  }

  identity(host: string): SshConnectionIdentity | undefined {
    const entry = this.entries.get(host);
    if (!entry) return undefined;
    if (!entry.profile.hostKeySha256) throw failure("SSH_HOST_KEY_UNCONFIRMED");
    const { label: _label, ...identity } = entry.profile;
    return SshConnectionIdentitySchema.parse(identity);
  }

  readonly transport: SshRequestTransport = async (host, command, payload) => {
    const entry = this.entries.get(host);
    if (!entry) throw failure("SSH_PROFILE_MISSING");
    this.identity(host);
    if (!entry.password) throw failure("SSH_CREDENTIAL_MISSING");
    return this.execute(entry.profile, entry.password, command, payload);
  };

  async test(id: string): Promise<{ connected: true }> {
    const entry = this.entries.get(id);
    if (!entry) throw failure("SSH_PROFILE_MISSING");
    this.identity(id);
    if (!entry.password) throw failure("SSH_CREDENTIAL_MISSING");
    await this.connect(entry.profile, entry.password, () => ({
      connected: true
    }));
    return { connected: true };
  }

  async probe(raw: unknown): Promise<{ hostKeySha256: string }> {
    const parsed = SshConnectionProfileSchema.safeParse(raw);
    if (!parsed.success) throw failure("SSH_INVALID_INPUT");
    // Probe deliberately rejects the key before any authentication is attempted.
    const client = new Client();
    this.clients.add(client);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (result?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.clients.delete(client);
        client.destroy();
        if (result) resolve({ hostKeySha256: result });
        else reject(failure("SSH_CONNECT_FAILED"));
      };
      const timer = setTimeout(() => finish(), 10_000);
      client.once("error", () => finish());
      client.once("close", () => finish());
      try {
        client.connect({
          host: parsed.data.hostname,
          port: parsed.data.port,
          username: parsed.data.username,
          readyTimeout: 10_000,
          authHandler: [],
          hostVerifier: (key: Buffer) => {
            const value = fingerprint(key);
            finish(value);
            return false;
          }
        });
      } catch {
        finish();
      }
    });
  }

  dispose(): void {
    for (const client of this.clients) client.destroy();
    this.clients.clear();
    this.entries.clear();
  }

  private connect<T>(
    profile: SshConnectionProfile,
    password: string,
    ready: (client: Client) => T | Promise<T>
  ): Promise<T> {
    if (!profile.hostKeySha256)
      return Promise.reject(failure("SSH_HOST_KEY_UNCONFIRMED"));
    const client = new Client();
    this.clients.add(client);
    return new Promise((resolve, reject) => {
      let settled = false,
        verified = false,
        authenticated = false,
        keyChanged = false;
      const finish = (error?: SshConnectionError, result?: T) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.clients.delete(client);
        client.destroy();
        if (error) reject(error);
        else resolve(result!);
      };
      const timer = setTimeout(() => finish(failure("SSH_TIMEOUT")), 30_000);
      client.once("error", (error: Error & { level?: string }) => {
        finish(
          failure(
            keyChanged
              ? "SSH_HOST_KEY_CHANGED"
              : error.level === "client-authentication" ||
                  (verified && !authenticated)
                ? "SSH_AUTH_FAILED"
                : "SSH_CONNECT_FAILED"
          )
        );
      });
      client.once("close", () => {
        if (!settled)
          finish(
            failure(keyChanged ? "SSH_HOST_KEY_CHANGED" : "SSH_CONNECT_FAILED")
          );
      });
      client.once("ready", () => {
        authenticated = true;
        Promise.resolve()
          .then(() => ready(client))
          .then(
            (result) => finish(undefined, result),
            (error) => {
              finish(
                error instanceof SshConnectionError
                  ? error
                  : failure("SSH_PROTOCOL_FAILED")
              );
            }
          );
      });
      const config: ConnectConfig = {
        host: profile.hostname,
        port: profile.port,
        username: profile.username,
        password,
        readyTimeout: 10_000,
        authHandler: ["password"],
        tryKeyboard: false,
        hostVerifier: (key: Buffer) => {
          verified = fingerprint(key) === profile.hostKeySha256;
          keyChanged = !verified;
          return verified;
        }
      };
      try {
        client.connect(config);
      } catch {
        finish(failure("SSH_CONNECT_FAILED"));
      }
    });
  }

  private execute(
    profile: SshConnectionProfile,
    password: string,
    command: string,
    payload: unknown
  ): Promise<unknown> {
    return this.connect(
      profile,
      password,
      (client) =>
        new Promise((resolve, reject) => {
          client.exec(command, { pty: false }, (error, stream) => {
            if (error) {
              reject(failure("SSH_PROTOCOL_FAILED"));
              return;
            }
            const output: Buffer[] = [];
            let size = 0;
            stream.on("data", (chunk: Buffer) => {
              size += chunk.length;
              if (size > 384 * 1024 * 1024) {
                reject(failure("SSH_OUTPUT_LIMIT"));
                client.destroy();
              } else output.push(chunk);
            });
            // Remote stderr is untrusted and may echo authentication material; never propagate it.
            stream.stderr.on("data", () => {});
            stream.once("error", () => reject(failure("SSH_PROTOCOL_FAILED")));
            stream.once("close", (code: number | undefined) => {
              if (code !== 0) {
                reject(failure("SSH_PROTOCOL_FAILED"));
                return;
              }
              try {
                const result: unknown = JSON.parse(
                  Buffer.concat(output).toString("utf8")
                );
                assertNoSecret(result, password);
                resolve(result);
              } catch {
                reject(failure("SSH_PROTOCOL_FAILED"));
              }
            });
            stream.end(JSON.stringify(payload));
          });
        })
    );
  }
}

/** Do not persist a hostile server's echo of its authentication password. */
function assertNoSecret(value: unknown, password: string): void {
  if (typeof value === "string" && value.includes(password))
    throw failure("SSH_PROTOCOL_FAILED");
  if (Array.isArray(value)) {
    for (const item of value) assertNoSecret(item, password);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (
        key === "content" &&
        typeof item === "string" &&
        Buffer.from(item, "base64").includes(Buffer.from(password))
      )
        throw failure("SSH_PROTOCOL_FAILED");
      assertNoSecret(item, password);
    }
  }
}

/** Dedicated parent pipe control; deliberately absent from public RpcServer/tool routing. */
export async function handleSshPrivateLine(
  line: string,
  connections: SshConnections
): Promise<string | null> {
  let input: unknown;
  try {
    input = JSON.parse(line);
  } catch {
    return null;
  }
  if (
    !input ||
    typeof input !== "object" ||
    !("method" in input) ||
    typeof input.method !== "string" ||
    !input.method.startsWith("$private.ssh.")
  )
    return null;
  const raw = input as { id?: unknown; method: string; params?: unknown };
  const id =
    typeof raw.id === "string" || typeof raw.id === "number" ? raw.id : null;
  try {
    let result: unknown;
    const params = raw.params as Record<string, unknown> | undefined;
    switch (raw.method) {
      case "$private.ssh.configure":
        connections.configure(raw.params);
        result = { configured: true };
        break;
      case "$private.ssh.probe":
        result = await connections.probe(params?.profile);
        break;
      case "$private.ssh.test":
        if (typeof params?.id !== "string") throw failure("SSH_INVALID_INPUT");
        result = await connections.test(params.id);
        break;
      default:
        throw failure("SSH_ACCESS_DENIED");
    }
    return JSON.stringify({ jsonrpc: "2.0", id, result });
  } catch (error) {
    return JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32050,
        message:
          error instanceof SshConnectionError ? error.code : "SSH_INVALID_INPUT"
      }
    });
  }
}
