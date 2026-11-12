import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceService } from "@research-workbench/core";
import { InteractiveTerminal } from "../../apps/core/src/interactive-terminal.js";
import { terminateProcessTree } from "../../apps/core/src/process-tree.js";
import { SecretOutputRedactor } from "../../apps/core/src/execution-env.js";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 50
    });
});
function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function family() {
  const root = await mkdtemp(join(tmpdir(), "rw-terminal-"));
  roots.push(root);
  await writeFile(
    join(root, "family.cjs"),
    `const {spawn}=require('node:child_process');const fs=require('node:fs');const grand=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync('pids.json',JSON.stringify([process.pid,grand.pid]));setInterval(()=>{},1000);`
  );
  const executable =
    process.platform === "win32"
      ? `& '${process.execPath.replaceAll("'", "''")}'`
      : `'${process.execPath.replaceAll("'", "'\\''")}'`;
  return { root, command: `${executable} family.cjs` };
}
for (const action of ["timeout", "cancel"] as const)
  it(`terminates shell, child and grandchild on ${action}, retaining an audit log`, async () => {
    const { root, command } = await family();
    const controller = new AbortController();
    const service = new WorkspaceService(root);
    const resultPromise = service.run(
      command,
      action === "timeout" ? 1800 : 15000,
      controller.signal
    );
    let pids: number[] = [];
    for (let i = 0; i < 100; i++) {
      pids = await readFile(join(root, "pids.json"), "utf8").then(
        (raw) => JSON.parse(raw) as number[],
        () => []
      );
      if (pids.length) break;
      await new Promise((done) => setTimeout(done, 20));
    }
    expect(pids).toHaveLength(2);
    expect(pids.every(alive)).toBe(true);
    if (action === "cancel") controller.abort();
    const result = await resultPromise;
    expect(result.timedOut).toBe(action === "timeout");
    expect(result.canceled).toBe(action === "cancel");
    for (let i = 0; i < 100 && pids.some(alive); i++)
      await new Promise((done) => setTimeout(done, 20));
    expect(pids.some(alive)).toBe(false);
    expect(await readFile(join(root, result.logPath!), "utf8")).toContain(
      "terminal closed"
    );
  }, 15_000);

it("retries a failed tree termination without killing just its root", async () => {
  const { root, command } = await family();
  let attempts = 0;
  const terminal = new InteractiveTerminal(root, async (pid) => {
    attempts += 1;
    if (attempts === 1) throw new Error("controlled denial");
    await terminateProcessTree(pid);
  });
  const result = await terminal.run(command, 1200);
  expect(attempts).toBeGreaterThan(1);
  expect(result.stderr).toContain("保留根进程并重试");
  const pids = JSON.parse(
    await readFile(join(root, "pids.json"), "utf8")
  ) as number[];
  await vi.waitFor(() => expect(pids.some(alive)).toBe(false), {
    timeout: 2000,
    interval: 20
  });
}, 15_000);

it("redacts secrets across every pipe boundary and preserves ordinary prefixes", () => {
  const secret = "fake-output-secret-2468";
  const longer = `${secret}-suffix`;
  const input = `before ${longer} / ${secret} after`;
  for (let split = 0; split <= input.length; split++) {
    const redactor = new SecretOutputRedactor({
      API_KEY: secret,
      ACCESS_TOKEN: longer
    });
    expect(
      redactor.write(input.slice(0, split)) +
        redactor.write(input.slice(split)) +
        redactor.end()
    ).toBe("before [redacted] / [redacted] after");
  }
  const redactor = new SecretOutputRedactor({ API_KEY: secret });
  expect(redactor.write("safe fake-") + redactor.end()).toBe("safe fake-");
});

it("keeps split secrets out of persisted output and bounds the UTF-8 log by bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "rw-terminal-"));
  roots.push(root);
  const secret = "fake-output-secret-2468";
  vi.stubEnv("RW_TEST_LOG_TOKEN", secret);
  await writeFile(
    join(root, "output.cjs"),
    `
    process.stdout.write('fake-output-');process.stderr.write('fake-output-');
    setTimeout(()=>{
      process.stdout.write('secret-2468\\n'+String(process.env.RW_TEST_LOG_TOKEN)+'\\n');
      process.stderr.write('secret-2468\\n');
      process.stdout.write('汉🙂'.repeat(900000));
    },50);
  `
  );
  const executable =
    process.platform === "win32"
      ? `& '${process.execPath.replaceAll("'", "''")}'`
      : `'${process.execPath.replaceAll("'", "'\\''")}'`;
  const result = await new WorkspaceService(root).run(
    `${executable} output.cjs`,
    15000
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("[redacted]\nundefined");
  expect(result.stderr).toContain("[redacted]");
  expect(result.stdout + result.stderr).not.toContain(secret);
  const bytes = await readFile(join(root, result.logPath!));
  expect(bytes.length).toBeLessThanOrEqual(4 * 1024 * 1024);
  expect(bytes.length).toBeGreaterThan(4 * 1024 * 1024 - 4);
  const log = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  expect(log).not.toContain(secret);
  expect(log).toContain("[redacted]");
}, 20_000);
