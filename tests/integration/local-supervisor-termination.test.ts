import { execFile, spawn, type ChildProcess } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  unlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { executionEnvironment } from "@research-workbench/core";
import { LOCAL_SUPERVISOR } from "../../apps/core/src/local-supervisor.js";

const exec = promisify(execFile);
const roots: string[] = [];
const children: ChildProcess[] = [];
interface Status {
  state: string;
  reason: string | null;
  terminationError?: string | null;
}

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null && child.pid) {
      const stopped = new Promise<void>((done) =>
        child.once("exit", () => done())
      );
      await exec("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        timeout: 5000
      });
      await stopped;
    }
  }
  for (const root of roots.splice(0)) {
    if (
      !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
      !root.includes("rw-termination-")
    )
      throw new Error("unsafe fixture cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

async function waitFor(
  root: string,
  predicate: (status: Status) => boolean
): Promise<Status> {
  const deadline = Date.now() + 6000;
  do {
    const status = await readFile(join(root, "status.json"), "utf8")
      .then((text) => JSON.parse(text) as Status)
      .catch(() => null);
    if (status && predicate(status)) return status;
    await new Promise((done) => setTimeout(done, 50));
  } while (Date.now() < deadline);
  throw new Error("supervisor did not reach the expected termination state");
}

it.skipIf(process.platform !== "win32")(
  "retains the Windows process tree when taskkill fails and retries cancellation after recovery",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "rw-termination-"));
    roots.push(root);
    const binaries = join(root, "bin");
    await mkdir(binaries);
    await mkdir(join(root, "source"));
    // An invalid executable causes a deterministic tree-kill launch failure.
    const unavailable = join(binaries, "taskkill.exe");
    await writeFile(unavailable, "not-an-executable-fixture");
    await writeFile(
      join(root, "source", "loop.cjs"),
      "setInterval(() => {}, 100);\n"
    );
    await writeFile(
      join(root, "job.json"),
      JSON.stringify({
        runId: "termination-fixture",
        token: "fixture",
        revision: "fixture",
        timeoutSeconds: 30,
        maxOutputBytes: 65536,
        command: `& '${process.execPath.replaceAll("'", "''")}' loop.cjs`
      })
    );
    await writeFile(join(root, "supervisor.mjs"), LOCAL_SUPERVISOR);
    const env = executionEnvironment(root);
    const originalPath =
      Object.entries(env).find(([key]) => key.toUpperCase() === "PATH")?.[1] ??
      "";
    for (const key of Object.keys(env))
      if (key.toUpperCase() === "PATH") delete env[key];
    env.PATH = `${binaries}${delimiter}${originalPath}`;
    const child = spawn(
      process.execPath,
      [join(root, "supervisor.mjs"), root],
      { env, windowsHide: true, stdio: "ignore" }
    );
    children.push(child);
    await waitFor(root, (status) => status.state === "running");
    await writeFile(join(root, "cancel.json"), "{}");
    const blocked = await waitFor(root, (status) =>
      Boolean(status.terminationError)
    );
    expect(blocked).toMatchObject({
      state: "running",
      reason: "canceled",
      terminationError: "进程树终止失败，保留根进程并重试"
    });
    expect(child.exitCode).toBeNull();

    await unlink(unavailable);
    const canceled = await waitFor(
      root,
      (status) => status.state === "canceled"
    );
    expect(canceled).toMatchObject({
      reason: "canceled",
      terminationError: null
    });
    // The final status rename precedes supervisor exit. Await the owned process
    // before teardown so cleanup cannot race taskkill against an exited PID.
    await new Promise<void>((done, reject) => {
      if (child.exitCode !== null || child.signalCode !== null) return done();
      const timer = setTimeout(
        () => reject(new Error("canceled supervisor did not exit")),
        3000
      );
      child.once("exit", () => {
        clearTimeout(timer);
        done();
      });
    });
  },
  15_000
);
