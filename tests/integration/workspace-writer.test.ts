import { spawn, type ChildProcess } from "node:child_process";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { ExperimentStore } from "@research-workbench/core";

const roots: string[] = [];
const workers: ChildProcess[] = [];
const stores: ExperimentStore[] = [];
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const moduleUrl = new URL(
  "../../apps/core/src/experiment-store.ts",
  import.meta.url
).href;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "rw-writer-"));
  roots.push(root);
  return root;
}

async function exit(worker: ChildProcess, action: "close" | "crash") {
  if (worker.exitCode !== null || worker.signalCode !== null) return;
  await new Promise<void>((done, reject) => {
    const timer = setTimeout(() => {
      worker.kill("SIGKILL");
      reject(new Error("writer did not exit"));
    }, 5000);
    worker.once("exit", () => {
      clearTimeout(timer);
      done();
    });
    if (action === "close") worker.send("close");
    else worker.kill("SIGKILL");
  });
}

afterEach(async () => {
  for (const store of stores.splice(0)) store.close();
  for (const worker of workers.splice(0)) await exit(worker, "crash");
  for (const root of roots.splice(0)) {
    if (
      !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
      !root.includes("rw-writer-")
    )
      throw new Error("unsafe fixture cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

async function writer(root: string) {
  const script = `
    import { ExperimentStore } from ${JSON.stringify(moduleUrl)};
    try {
      const store = new ExperimentStore(process.argv[1]);
      store.create({title:'worker-record',goal:'g',hypothesis:'h',design:'d',metrics:'score',seeds:1});
      process.on('message', message => {
        if (message === 'close') { store.close(); process.disconnect(); }
      });
      process.send({status:'acquired'});
    } catch (error) {
      process.send({status:'rejected',message:error.message}, () => process.disconnect());
      process.exitCode=2;
    }
  `;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script, root],
    {
      cwd: repoRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe", "ipc"]
    }
  );
  workers.push(child);
  let stderr = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk) => {
    stderr += chunk;
  });
  const result = await new Promise<{
    status: "acquired" | "rejected";
    message?: string;
  }>((done, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("writer did not report readiness"));
    }, 5000);
    child.once("message", (message) => {
      clearTimeout(timer);
      done(message as { status: "acquired" | "rejected"; message?: string });
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`writer exited before readiness (${code}): ${stderr}`));
    });
  });
  return { child, result };
}

it("rejects a second connection in the same process and reopens after an idempotent close", async () => {
  const root = await fixture();
  const first = new ExperimentStore(root);
  stores.push(first);
  expect(() => new ExperimentStore(root)).toThrow("另一个 Core");
  first.close();
  first.close();
  const reopened = new ExperimentStore(root);
  stores.push(reopened);
  expect(reopened.list()).toEqual([]);
});

it("rejects a real second process while allowing a different workspace and explicit-close recovery", async () => {
  const root = await fixture();
  const owner = await writer(root);
  expect(owner.result.status).toBe("acquired");
  const contender = await writer(root);
  expect(contender.result).toMatchObject({
    status: "rejected",
    message: expect.stringContaining("另一个 Core")
  });
  const independent = await writer(await fixture());
  expect(independent.result.status).toBe("acquired");
  await exit(owner.child, "close");
  const reopened = new ExperimentStore(root);
  stores.push(reopened);
  expect(reopened.list().map((record) => record.title)).toEqual([
    "worker-record"
  ]);
});

it("recovers a crashed writer without removing its lock file or losing committed records", async () => {
  const root = await fixture();
  const owner = await writer(root);
  expect(owner.result.status).toBe("acquired");
  await exit(owner.child, "crash");
  const reopened = new ExperimentStore(root);
  stores.push(reopened);
  expect(reopened.list()).toHaveLength(1);
  reopened.create({
    title: "after-crash",
    goal: "g",
    hypothesis: "h",
    design: "d",
    metrics: "score",
    seeds: 1
  });
  expect(reopened.list()).toHaveLength(2);
});

it("releases ownership when opening the research database fails", async () => {
  const root = await fixture();
  await mkdir(join(root, ".research"));
  const path = join(root, ".research", "workbench.db");
  await writeFile(path, "invalid-sqlite-fixture");
  expect(() => new ExperimentStore(root)).toThrow();
  expect(await readFile(path, "utf8")).toBe("invalid-sqlite-fixture");
  await writeFile(path, new Uint8Array());
  const recovered = new ExperimentStore(root);
  stores.push(recovered);
  expect(recovered.list()).toEqual([]);
});

it.each(["workbench.lock.db", "workbench.lock.db-journal"])(
  "rejects a hardlinked lock file without changing the external sentinel: %s",
  async (name) => {
    const root = await fixture();
    const outside = await fixture();
    await mkdir(join(root, ".research"));
    const sentinel = join(outside, "sentinel");
    await writeFile(sentinel, "unchanged");
    await link(sentinel, join(root, ".research", name));
    expect(() => new ExperimentStore(root)).toThrow("不能是链接");
    expect(await readFile(sentinel, "utf8")).toBe("unchanged");
  }
);
