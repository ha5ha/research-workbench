import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { expect, it } from "vitest";
import {
  ExperimentStore,
  PermissionService,
  RunService,
  RunStore
} from "@research-workbench/core";
import type { RunProposal } from "@research-workbench/contracts";
import { executionEnvironment } from "../../apps/core/src/execution-env.js";
import {
  launchLocalSupervisor,
  SupervisorLaunchUncertainError
} from "../../apps/core/src/local-launcher.js";

const git =
  process.platform === "win32" ? "C:/Program Files/Git/cmd/git.exe" : "git";
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
async function until(check: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await wait(50);
  }
  throw new Error(label);
}
async function removeFixture(root: string) {
  if (
    !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
    !root.includes("rw-launcher-")
  )
    throw new Error("unsafe fixture cleanup");
  await rm(root, { recursive: true, force: true });
}

it("acknowledges a live supervisor without waiting and preserves quoted Unicode paths and the environment boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "rw-launcher-中文 ' with spaces-"));
  const supervisor = join(root, "supervisor 中文 ' with spaces.cjs");
  const gate = join(root, "finish");
  const started = join(root, "started.json");
  const finished = join(root, "finished");
  await writeFile(
    supervisor,
    `const fs=require('node:fs');const path=require('node:path');const directory=process.argv[2];fs.writeFileSync(path.join(directory,'started.json'),JSON.stringify({pid:process.pid,directory,credential:process.env.OPENAI_API_KEY??null}));const deadline=Date.now()+8000;const poll=setInterval(()=>{if(fs.existsSync(path.join(directory,'finish'))||Date.now()>deadline){clearInterval(poll);fs.writeFileSync(path.join(directory,'finished'),'done');}},25);`
  );
  let launched = false;
  try {
    const pid = await launchLocalSupervisor(
      process.execPath,
      supervisor,
      root,
      executionEnvironment(root, {
        ...process.env,
        OPENAI_API_KEY: "fixture-credential-must-not-reach-supervisor"
      })
    );
    launched = true;
    await until(
      () =>
        stat(started).then(
          () => true,
          () => false
        ),
      "supervisor did not start"
    );
    expect(JSON.parse(await readFile(started, "utf8"))).toEqual({
      pid,
      directory: root,
      credential: null
    });
    expect(
      await stat(finished).then(
        () => true,
        () => false
      )
    ).toBe(false);
    expect(() => process.kill(pid, 0)).not.toThrow();
  } finally {
    await writeFile(gate, "finish");
    if (launched)
      await until(
        () =>
          stat(finished).then(
            () => true,
            () => false
          ),
        "owned supervisor did not finish"
      );
    await removeFixture(root);
  }
});

async function fixture(launchSupervisor: typeof launchLocalSupervisor) {
  const root = await mkdtemp(join(tmpdir(), "rw-launcher-recovery-"));
  execFileSync(git, ["init", "-q", root], { windowsHide: true });
  await writeFile(join(root, "experiment.cjs"), "// frozen fixture\n");
  for (const args of [
    ["add", "experiment.cjs"],
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-qm",
      "fixture"
    ]
  ])
    execFileSync(git, ["-C", root, ...args], { windowsHide: true });
  const store = new ExperimentStore(root);
  const experiment = store.create({
    title: "launch acknowledgement",
    goal: "same Job recovery",
    hypothesis: "acknowledgement loss does not resubmit",
    design: "fault injection",
    metrics: "score",
    seeds: 2
  });
  const permissions = new PermissionService("workspace-write");
  const runStore = new RunStore(store.database);
  const service = new RunService(
    root,
    runStore,
    store,
    permissions,
    undefined,
    git,
    undefined,
    launchSupervisor
  );
  const proposal: RunProposal = {
    experimentId: experiment.id,
    command: "node experiment.cjs",
    timeoutSeconds: 15,
    maxOutputBytes: 65536,
    inputs: [],
    backend: "local",
    protocol: {
      name: "paired",
      metric: "score",
      direction: "maximize",
      unit: "",
      dataset: "fixed",
      environment: "fixture",
      seeds: [0, 1],
      metricsPath: "results/metrics.json",
      requiredArtifacts: []
    }
  };
  const plan = await service.propose(proposal);
  await service.approve(plan.id, plan.digest);
  return { root, store, runStore, service, plan, permissions };
}

it("recovers an uncertain local acknowledgement from the same persisted Job without relaunching", async () => {
  let submissions = 0;
  const launch: typeof launchLocalSupervisor = async (
    _executable,
    _supervisor,
    directory
  ) => {
    submissions++;
    const config = JSON.parse(
      await readFile(join(directory, "job.json"), "utf8")
    );
    const now = new Date().toISOString();
    await writeFile(
      join(directory, "status.json"),
      JSON.stringify({
        runId: config.runId,
        token: config.token,
        state: "running",
        pid: 42424,
        startedAt: now,
        heartbeatAt: now,
        finishedAt: null,
        exitCode: null,
        reason: null
      })
    );
    throw new SupervisorLaunchUncertainError("injected acknowledgement loss");
  };
  const f = await fixture(launch);
  let store = f.store;
  try {
    const first = await f.service.start(f.plan.id, "one-launch");
    expect(first.state).toBe("unknown");
    expect(f.runStore.events(first.id).map((event) => event.type)).toEqual([
      "preparing",
      "unknown"
    ]);
    expect((await f.service.start(f.plan.id, "one-launch")).id).toBe(first.id);
    expect(submissions).toBe(1);
    await expect(f.service.start(f.plan.id, "different-key")).rejects.toThrow(
      "活动或未知运行"
    );
    store.close();
    store = new ExperimentStore(f.root);
    const runStore = new RunStore(store.database);
    const recovered = new RunService(
      f.root,
      runStore,
      store,
      f.permissions,
      undefined,
      git,
      undefined,
      launch
    );
    expect((await recovered.refresh(first.id)).state).toBe("running");
    const directory = join(f.root, ".research", "jobs", first.id);
    await mkdir(join(directory, "source", "results"));
    await writeFile(
      join(directory, "source", "results", "metrics.json"),
      JSON.stringify([
        { seed: 0, score: 6 },
        { seed: 1, score: 6 }
      ])
    );
    const status = JSON.parse(
      await readFile(join(directory, "status.json"), "utf8")
    );
    await writeFile(
      join(directory, "status.json"),
      JSON.stringify({
        ...status,
        state: "completed",
        exitCode: 0,
        finishedAt: new Date().toISOString()
      })
    );
    const final = await recovered.refresh(first.id);
    expect(final.state, final.reason ?? "").toBe("succeeded");
    expect(final.metrics).toMatchObject({
      score: 6,
      "score.n": 2,
      "score.sd": 0
    });
    expect((await recovered.start(f.plan.id, "one-launch")).id).toBe(first.id);
    expect(recovered.overview().runs).toHaveLength(1);
    expect(submissions).toBe(1);
  } finally {
    store.close();
    await removeFixture(f.root);
  }
});

it("records a definite local launcher creation failure as failed", async () => {
  const f = await fixture(async () => {
    throw Object.assign(new Error("launcher unavailable"), { code: "ENOENT" });
  });
  try {
    const run = await f.service.start(f.plan.id, "definite-failure");
    expect(run.state).toBe("failed");
    expect(run.reason).toBe("launcher unavailable");
    expect(f.runStore.events(run.id).map((event) => event.type)).toEqual([
      "preparing",
      "failed"
    ]);
  } finally {
    f.store.close();
    await removeFixture(f.root);
  }
});
