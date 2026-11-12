import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type {
  LoopOverview,
  ManagedPlan,
  ManagedRun,
  RunDetail
} from "@research-workbench/contracts";
import { CoreBridge } from "../../apps/desktop/src/main/core-bridge.js";

const roots: string[] = [];
const bridges: CoreBridge[] = [];
const repo = process.cwd();
const command = (file: string) =>
  process.platform === "win32"
    ? `& '${process.execPath.replaceAll("'", "''")}' ${file}`
    : `'${process.execPath.replaceAll("'", "'\\''")}' ${file}`;
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
afterEach(async () => {
  for (const bridge of bridges) {
    if (bridge.getStatus().state !== "online") continue;
    const overview = await bridge.request<LoopOverview>("loop.overview");
    for (const run of overview.runs) {
      if (["succeeded", "failed", "canceled"].includes(run.state)) continue;
      await bridge.request("runs.cancel", { id: run.id });
      await vi.waitFor(
        async () =>
          expect(
            (await bridge.request<RunDetail>("runs.get", { id: run.id })).run
              .state
          ).toBe("canceled"),
        { timeout: 20_000 }
      );
    }
  }
  await Promise.all(bridges.splice(0).map((bridge) => bridge.stop()));
  for (const root of roots.splice(0)) {
    if (
      !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
      !root.includes("rw-core-shutdown-")
    )
      throw new Error("unsafe fixture cleanup");
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 50
    });
  }
});
async function start(root: string) {
  const bridge = new CoreBridge({
    repoRoot: repo,
    workspace: root,
    launch: {
      command: process.execPath,
      args: [
        "--import",
        "tsx",
        resolve("apps/core/src/cli.ts"),
        "--workspace",
        root
      ],
      cwd: repo,
      env: {
        RW_API_KEY: "",
        DEEPSEEK_API_KEY: "",
        OPENAI_API_KEY: "",
        RW_LSP_SERVER: "",
        RW_PERMISSION_LEVEL: "workspace-write"
      }
    },
    onEvent: () => {},
    onStatus: () => {}
  });
  bridges.push(bridge);
  bridge.start();
  await vi.waitFor(() => expect(bridge.getStatus().state).toBe("online"));
  await bridge.request("system.hello");
  return bridge;
}

it("waits for Core EOF cleanup, terminates interactive descendants and releases the workspace lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "rw-core-shutdown-"));
  roots.push(root);
  await writeFile(
    join(root, "family.cjs"),
    `const {spawn}=require('node:child_process');const fs=require('node:fs');const grand=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync('pids.json',JSON.stringify([process.pid,grand.pid]));setInterval(()=>{},1000);`
  );
  const bridge = await start(root);
  const core = Reflect.get(bridge, "child") as ChildProcess;
  const terminal = bridge
    .request("terminal.run", { command: command("family.cjs") })
    .catch((error: Error) => error);
  let pids: number[] = [];
  await vi.waitFor(
    async () => {
      pids = JSON.parse(
        await readFile(join(root, "pids.json"), "utf8")
      ) as number[];
      expect(pids).toHaveLength(2);
    },
    { timeout: 5000 }
  );
  expect(pids.every(alive)).toBe(true);
  await bridge.stop();
  expect(core.exitCode).toBe(0);
  expect(await terminal).toBeInstanceOf(Error);
  await vi.waitFor(() => expect(pids.some(alive)).toBe(false));
  const logs = await readdir(join(root, ".research", "terminal"));
  expect(
    await readFile(join(root, ".research", "terminal", logs[0]!), "utf8")
  ).toContain("canceled=true");
  const reopened = await start(root);
  await expect(reopened.request("system.hello")).resolves.toMatchObject({
    workspaceRoot: root
  });
}, 30_000);

it("keeps an approved managed Job alive across graceful Core shutdown and recovers that same run", async () => {
  const root = await mkdtemp(join(tmpdir(), "rw-core-shutdown-"));
  roots.push(root);
  const git = (args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      stdio: "ignore",
      windowsHide: true
    });
  git(["init"]);
  await writeFile(
    join(root, "experiment.cjs"),
    `setTimeout(()=>{require('fs').mkdirSync('results',{recursive:true});require('fs').writeFileSync('results/metrics.json',JSON.stringify([{seed:0,score:3},{seed:1,score:5}]));},3500);`
  );
  git(["add", "experiment.cjs"]);
  git([
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "fixture"
  ]);
  const bridge = await start(root);
  const experiment = await bridge.request<{ id: string }>(
    "experiments.propose",
    {
      title: "recover managed job",
      goal: "verify cleanup boundary",
      hypothesis: "managed execution outlives Core",
      design: "two fixed values",
      metrics: "score",
      seeds: 2
    }
  );
  const plan = await bridge.request<ManagedPlan>("runs.propose", {
    experimentId: experiment.id,
    command: command("experiment.cjs"),
    timeoutSeconds: 15,
    inputs: [],
    backend: "local",
    protocol: {
      name: "shutdown",
      metric: "score",
      direction: "maximize",
      unit: "",
      dataset: "fixture",
      environment: "test-node",
      seeds: [0, 1],
      metricsPath: "results/metrics.json",
      requiredArtifacts: []
    }
  });
  await bridge.request("runs.approve", { id: plan.id, digest: plan.digest });
  const run = await bridge.request<ManagedRun>("runs.start", {
    id: plan.id,
    idempotencyKey: "one-owned-job"
  });
  await bridge.stop();
  const reopened = await start(root);
  let detail: RunDetail | undefined;
  await vi.waitFor(
    async () => {
      detail = await reopened.request<RunDetail>("runs.get", { id: run.id });
      expect(detail.run.state).toBe("succeeded");
    },
    { timeout: 20_000, interval: 150 }
  );
  expect(detail!.run.metrics.score).toBe(4);
  const same = await reopened.request<ManagedRun>("runs.start", {
    id: plan.id,
    idempotencyKey: "one-owned-job"
  });
  expect(same.id).toBe(run.id);
}, 40_000);
