import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  CoreBridge,
  type CoreStatus
} from "../../apps/desktop/src/main/core-bridge.js";
import type { RpcEvent } from "@research-workbench/contracts";

const cleanup: string[] = [];
const bridges: CoreBridge[] = [];
const fingerprint = `SHA256:${"A".repeat(43)}`;
afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.stop()));
  vi.restoreAllMocks();
  for (const root of cleanup.splice(0)) {
    if (
      !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
      !root.includes("rw-ssh-bridge-")
    )
      throw new Error("unsafe fixture cleanup");
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 25
    });
  }
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "rw-ssh-bridge-"));
  cleanup.push(root);
  const script = join(root, "fixture.cjs");
  await writeFile(
    script,
    `
const { createInterface } = require('node:readline');
let password = '';
createInterface({input:process.stdin}).on('line', line => {
  const request = JSON.parse(line);
  const reply = result => process.stdout.write(JSON.stringify({jsonrpc:'2.0', id:request.id, result})+'\\n');
  if (request.method === '$private.ssh.configure') { password = request.params.profiles[0]?.password ?? ''; reply({configured:true, unexpected:password}); }
  else if (request.method === '$private.ssh.probe') reply({hostKeySha256:${JSON.stringify(fingerprint)}, unexpected:password});
  else if (request.method === '$private.ssh.test') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{message:password}})+'\\n');
  else if (request.method === 'agent.reset') { reply({reset:true}); process.exit(0); }
  else if (request.method === 'git.diff') {
    process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'event',params:{seq:1,type:'git.auto-commit-failed',at:'2026-11-11T00:00:00.000Z',payload:{message:password,[password]:password}}})+'\\n');
    process.stdout.write(password+'\\n');
    process.stderr.write(password.slice(0,4)); process.stderr.write(password.slice(4));
    reply({path:'fixture',staged:false,diff:password});
  } else reply({canceled:0});
});`
  );
  const events: RpcEvent[] = [];
  const statuses: CoreStatus[] = [];
  const bridge = new CoreBridge({
    repoRoot: root,
    workspace: root,
    launch: { command: process.execPath, args: [script], cwd: root },
    onEvent: (event) => events.push(event),
    onStatus: (status) => statuses.push(status)
  });
  bridges.push(bridge);
  bridge.start();
  await vi.waitFor(() => expect(statuses.at(-1)?.state).toBe("online"));
  return { bridge, events };
}

it("keeps private controls off the public route and only returns known response fields", async () => {
  const { bridge, events } = await fixture();
  await expect(bridge.request("$private.ssh.configure", {})).rejects.toThrow(
    "SSH_ACCESS_DENIED"
  );
  const configuration = { profiles: [{ password: "A" }] };
  expect(
    await bridge.requestPrivate("$private.ssh.configure", configuration)
  ).toEqual({ configured: true });
  expect(await bridge.requestPrivate("$private.ssh.probe", {})).toEqual({
    hostKeySha256: fingerprint
  });
  await expect(bridge.requestPrivate("$private.ssh.test", {})).rejects.toThrow(
    /^SSH_PROTOCOL_FAILED$/
  );
  expect(events).toEqual([]);
});

it("redacts escaped secrets in events and public results and hides stderr chunks and invalid output", async () => {
  const { bridge, events } = await fixture();
  const stderr: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation(
    (chunk: string | Uint8Array) => {
      stderr.push(String(chunk));
      return true;
    }
  );
  const password = 'fixture-only-"not-a-real-password';
  await bridge.requestPrivate("$private.ssh.configure", {
    profiles: [{ password }]
  });
  const result = await bridge.request("git.diff", {});
  await vi.waitFor(() => expect(stderr.length).toBeGreaterThan(0));
  expect(result).toEqual({
    path: "fixture",
    staged: false,
    diff: "[redacted]"
  });
  expect(events[0]?.params.payload).toEqual({ message: "[redacted]" });
  expect(stderr.join("")).not.toContain(password);
  expect(stderr.join("")).not.toContain("fixture-only");
});

it("releases replaced and revoked password references and clears them on stop or exit", async () => {
  const { bridge } = await fixture();
  const retainedSecrets = () => Reflect.get(bridge, "secrets") as Set<string>;
  await bridge.requestPrivate("$private.ssh.configure", {
    profiles: [{ password: "fixture-old" }]
  });
  await bridge.requestPrivate("$private.ssh.configure", {
    profiles: [{ password: "fixture-new" }]
  });
  expect([...retainedSecrets()]).toEqual(["fixture-new"]);
  await bridge.requestPrivate("$private.ssh.configure", { profiles: [] });
  expect(retainedSecrets().size).toBe(0);
  await bridge.requestPrivate("$private.ssh.configure", {
    profiles: [{ password: "fixture-stop" }]
  });
  await bridge.stop();
  expect(retainedSecrets().size).toBe(0);
  const exited = (await fixture()).bridge;
  await exited.requestPrivate("$private.ssh.configure", {
    profiles: [{ password: "fixture-exit" }]
  });
  await exited.request("agent.reset");
  await vi.waitFor(() => expect(exited.getStatus().state).toBe("stopped"));
  expect((Reflect.get(exited, "secrets") as Set<string>).size).toBe(0);
});

it("closes stopped Core pipes and ignores exit events from an earlier process", async () => {
  const { bridge } = await fixture();
  const child = Reflect.get(bridge, "child");
  const stopping = bridge.stop();
  expect(child.stdin.writableEnded).toBe(true);
  await vi.waitFor(() => {
    for (const stream of [child.stdin, child.stdout, child.stderr])
      expect(stream.destroyed).toBe(true);
  });
  await stopping;
  bridge.start();
  await vi.waitFor(() => expect(bridge.getStatus().state).toBe("online"));
  child.emit("exit", 1, null);
  expect(bridge.getStatus().state).toBe("online");
  await expect(bridge.request("terminal.cancel")).resolves.toEqual({
    canceled: 0
  });
});
