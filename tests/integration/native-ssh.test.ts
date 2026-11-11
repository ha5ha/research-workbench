import { createHash, generateKeyPairSync } from "node:crypto";
import { createRequire } from "node:module";
import { afterEach, expect, it } from "vitest";
import type * as Ssh from "../../apps/core/node_modules/@types/ssh2/index.js";
import {
  RunProposalSchema,
  type ManagedPlan,
  type ManagedRun,
  type SshConnectionProfile
} from "@research-workbench/contracts";
import {
  SshConnections,
  handleSshPrivateLine
} from "../../apps/core/src/ssh2-transport.js";
import { SshExecutor } from "../../apps/core/src/ssh-executor.js";

const ssh = createRequire(
  new URL("../../apps/core/package.json", import.meta.url)
)("ssh2") as typeof Ssh;
const password = "fixture-only-password-NOT-A-REAL-CREDENTIAL";
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function fixture(reply: unknown = { acknowledged: true }) {
  const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs1", format: "pem" })
    .toString();
  const parsed = ssh.utils.parseKey(privateKey);
  if (parsed instanceof Error || Array.isArray(parsed))
    throw new Error("fixture key generation failed");
  const pin = `SHA256:${createHash("sha256").update(parsed.getPublicSSH()).digest("base64").replace(/=+$/, "")}`;
  const active = new Set<Ssh.Connection>();
  let authentications = 0,
    command = "",
    payload = "";
  const server = new ssh.Server({ hostKeys: [privateKey] }, (client) => {
    active.add(client);
    client.on("error", () => {});
    client.on("close", () => active.delete(client));
    client.on("authentication", (ctx) => {
      authentications += 1;
      if (
        ctx.method === "password" &&
        ctx.username === "researcher" &&
        ctx.password === password
      )
        ctx.accept();
      else ctx.reject(["password"]);
    });
    client.on("ready", () =>
      client.on("session", (accept) => {
        accept().on("exec", (acceptExec, _reject, info) => {
          command = info.command;
          const stream = acceptExec();
          stream.on("data", (chunk: Buffer) => {
            payload += chunk.toString();
          });
          stream.on("end", () => {
            stream.write(JSON.stringify(reply));
            stream.exit(0);
            stream.end();
          });
        });
      })
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("fixture server address missing");
  const profile: SshConnectionProfile = {
    id: "ssh-fixture",
    label: "Fixture",
    hostname: "127.0.0.1",
    port: address.port,
    username: "researcher",
    hostKeySha256: pin,
    revision: 1
  };
  const connections = new SshConnections();
  cleanups.push(async () => {
    connections.dispose();
    for (const client of active) client.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return {
    profile,
    connections,
    authentications: () => authentications,
    observed: () => ({ command, payload })
  };
}

it("probes without authentication, requires confirmation and authenticates only the pinned destination", async () => {
  const f = await fixture();
  f.connections.configure({
    profiles: [{ profile: { ...f.profile, hostKeySha256: null }, password }]
  });
  expect(() => f.connections.identity(f.profile.id)).toThrow("核对并确认");
  expect(
    await f.connections.probe({ ...f.profile, hostKeySha256: null })
  ).toEqual({ hostKeySha256: f.profile.hostKeySha256 });
  expect(f.authentications()).toBe(0);
  f.connections.configure({ profiles: [{ profile: f.profile, password }] });
  expect(await f.connections.test(f.profile.id)).toEqual({ connected: true });
  const before = f.authentications();
  f.connections.configure({
    profiles: [
      {
        profile: { ...f.profile, hostKeySha256: `SHA256:${"A".repeat(43)}` },
        password
      }
    ]
  });
  await expect(f.connections.test(f.profile.id)).rejects.toMatchObject({
    code: "SSH_HOST_KEY_CHANGED"
  });
  expect(f.authentications()).toBe(before);
});

it("transports the fixed command and JSON payload without placing the password in either", async () => {
  const f = await fixture();
  f.connections.configure({ profiles: [{ profile: f.profile, password }] });
  const transport = f.connections.transport;
  expect(
    await transport(f.profile.id, "python3 -c 'fixed-bootstrap'", {
      action: "inspect",
      id: "fixture-job",
      token: "fixture-token"
    })
  ).toEqual({ acknowledged: true });
  expect(f.observed()).toEqual({
    command: "python3 -c 'fixed-bootstrap'",
    payload: JSON.stringify({
      action: "inspect",
      id: "fixture-job",
      token: "fixture-token"
    })
  });
  expect(JSON.stringify(f.observed())).not.toContain(password);
  f.connections.configure({ profiles: [{ profile: f.profile }] });
  await expect(f.connections.test(f.profile.id)).rejects.toMatchObject({
    code: "SSH_CREDENTIAL_MISSING"
  });
});

it("returns fixed authentication errors and rejects a hostile server's password echo", async () => {
  const f = await fixture({
    files: [
      { path: "stdout.log", content: Buffer.from(password).toString("base64") }
    ]
  });
  f.connections.configure({
    profiles: [{ profile: f.profile, password: "wrong-fixture-password" }]
  });
  const denied = await handleSshPrivateLine(
    JSON.stringify({
      id: "test",
      method: "$private.ssh.test",
      params: { id: f.profile.id }
    }),
    f.connections
  );
  expect(JSON.parse(denied!).error.message).toBe("SSH_AUTH_FAILED");
  expect(denied).not.toContain(password);
  expect(denied).not.toContain("wrong-fixture");
  f.connections.configure({ profiles: [{ profile: f.profile, password }] });
  await expect(
    f.connections.transport(f.profile.id, "fixed", {})
  ).rejects.toMatchObject({ code: "SSH_PROTOCOL_FAILED" });
});

it("keeps private control out of public methods and never reflects invalid input", async () => {
  const connections = new SshConnections();
  const raw = {
    id: 1,
    method: "$private.ssh.configure",
    params: { profiles: [{ profile: { id: password }, password }] }
  };
  const output = await handleSshPrivateLine(JSON.stringify(raw), connections);
  expect(JSON.parse(output!).error.message).toBe("SSH_INVALID_INPUT");
  expect(output).not.toContain(password);
  expect(
    await handleSshPrivateLine(
      JSON.stringify({ method: "runs.propose", params: {} }),
      connections
    )
  ).toBeNull();
});

it("binds every request to the frozen public identity and rejects profile edits or removal", async () => {
  const f = await fixture();
  f.connections.configure({ profiles: [{ profile: f.profile, password }] });
  const proposal = RunProposalSchema.parse({
    experimentId: "fixture",
    backend: "ssh",
    host: f.profile.id,
    command: "python3 experiment.py",
    timeoutSeconds: 30,
    protocol: {
      name: "fixture",
      metric: "score",
      direction: "maximize",
      unit: "",
      dataset: "fixture",
      environment: "fixture",
      seeds: [1],
      metricsPath: "results/metrics.json"
    }
  });
  const plan: ManagedPlan = {
    id: "fixture",
    version: 1,
    closure: null,
    proposal,
    files: [],
    sshConnection: f.connections.identity(f.profile.id),
    taskbookHash: "a".repeat(64),
    revision: "b".repeat(40),
    codeHash: "c".repeat(64),
    inputHash: "d".repeat(64),
    environmentHash: "e".repeat(64),
    comparableGroup: "f".repeat(64),
    digest: "0".repeat(64),
    approvedAt: null,
    createdAt: new Date().toISOString()
  };
  let requests = 0;
  const executor = new SshExecutor(
    process.cwd(),
    async () => {
      requests += 1;
      return {};
    },
    (id) => f.connections.identity(id)
  );
  const run = {
    id: "fixture",
    jobToken: "fixture",
    cancelRequested: false
  } as ManagedRun;
  await executor.submit(run, plan);
  expect(requests).toBe(1);
  f.connections.configure({
    profiles: [
      {
        profile: { ...f.profile, label: "Renamed" },
        password: "rotated-fixture"
      }
    ]
  });
  await executor.submit(run, plan);
  expect(requests).toBe(2);
  expect(JSON.stringify(plan)).not.toContain(password);
  f.connections.configure({
    profiles: [
      {
        profile: { ...f.profile, revision: 2, port: f.profile.port + 1 },
        password
      }
    ]
  });
  await expect(executor.submit(run, plan)).rejects.toThrow("连接身份已改变");
  f.connections.configure({ profiles: [] });
  await expect(executor.cancel(run, plan)).rejects.toThrow("连接身份已改变");
  expect(requests).toBe(2);
});
