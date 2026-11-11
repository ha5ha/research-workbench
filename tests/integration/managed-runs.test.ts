import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  ExperimentStore,
  RunStore,
  RunService,
  PermissionService
} from "@research-workbench/core";
import type { ManagedRun, RunProposal } from "@research-workbench/contracts";
import { atomicWorkspaceWrite } from "../../apps/core/src/workspace.js";
import type { RemoteExecutor } from "../../apps/core/src/ssh-executor.js";

const fixtures: Array<{
  root: string;
  store: ExperimentStore;
  service: RunService;
}> = [];
const git =
  process.platform === "win32" ? "C:/Program Files/Git/cmd/git.exe" : "git";
afterEach(async () => {
  for (const item of fixtures.splice(0)) {
    for (const run of item.service.overview().runs)
      if (!["succeeded", "failed", "canceled"].includes(run.state)) {
        await item.service.cancel(run.id);
        await settle(item.service, run.id);
      }
    item.store.close();
    if (
      !resolve(item.root).startsWith(resolve(tmpdir()) + sep) ||
      !item.root.includes("rw-managed-")
    )
      throw new Error("unsafe fixture cleanup");
    await rm(item.root, { recursive: true, force: true });
  }
});
async function setup(
  script = `require('fs').mkdirSync('results',{recursive:true});require('fs').writeFileSync('results/metrics.json',JSON.stringify([{seed:0,score:2},{seed:1,score:4}]));`
) {
  const root = await mkdtemp(join(tmpdir(), "rw-managed-"));
  const commit = () => {
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
  };
  execFileSync(git, ["init", root], { windowsHide: true, stdio: "ignore" });
  await writeFile(join(root, "experiment.cjs"), script);
  commit();
  const store = new ExperimentStore(root);
  const experiment = store.create({
    title: "baseline",
    goal: "measure",
    hypothesis: "repeatable",
    design: "two seeds",
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
    () => {},
    git
  );
  fixtures.push({ root, store, service });
  const command =
    process.platform === "win32"
      ? `& '${process.execPath.replaceAll("'", "''")}' experiment.cjs`
      : `'${process.execPath}' experiment.cjs`;
  const proposal: RunProposal = {
    experimentId: experiment.id,
    command,
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
      environment: "test-node",
      seeds: [0, 1],
      metricsPath: "results/metrics.json",
      requiredArtifacts: []
    }
  };
  return { root, store, runStore, service, permissions, proposal, commit };
}
async function settle(service: RunService, id: string) {
  const deadline = Date.now() + 18000;
  let run: ManagedRun;
  do {
    run = await service.refresh(id);
    if (["succeeded", "failed", "canceled"].includes(run.state)) return run;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw new Error(`run did not settle: ${JSON.stringify(run)}`);
}
it("requires human approval, deduplicates concurrent launches, recovers and compares frozen rounds", async () => {
  const f = await setup();
  f.permissions.configure({ level: "read-only" });
  await expect(f.service.propose(f.proposal, "agent")).rejects.toThrow(
    "权限拒绝"
  );
  f.permissions.configure({ level: "workspace-write" });
  const plan = await f.service.propose(f.proposal);
  await expect(f.service.start(plan.id, "first")).rejects.toThrow("尚未批准");
  await expect(f.service.approve(plan.id, "0".repeat(64))).rejects.toThrow(
    "身份"
  );
  expect(f.store.get(f.proposal.experimentId)?.taskbookStatus).toBe("draft");
  await f.service.approve(plan.id, plan.digest);
  const pair = await Promise.all([
    f.service.start(plan.id, "first"),
    f.service.start(plan.id, "first")
  ]);
  expect(pair[0].id).toBe(pair[1].id);
  expect(f.service.overview().runs).toHaveLength(1);
  // Close the owning database, reopen it and recover without any process handle.
  f.store.close();
  const reopened = new ExperimentStore(f.root);
  const recovered = new RunService(
    f.root,
    new RunStore(reopened.database),
    reopened,
    f.permissions,
    () => {},
    git
  );
  fixtures[fixtures.length - 1] = {
    root: f.root,
    store: reopened,
    service: recovered
  };
  const first = await settle(recovered, pair[0].id);
  expect(first.state, first.reason ?? "").toBe("succeeded");
  expect(first.metrics.score).toBe(3);
  expect(first.metrics["score.n"]).toBe(2);
  await writeFile(
    join(f.root, "experiment.cjs"),
    `require('fs').mkdirSync('results',{recursive:true});require('fs').writeFileSync('results/metrics.json',JSON.stringify([{seed:0,score:4},{seed:1,score:6}]));`
  );
  f.commit();
  const secondPlan = await recovered.propose(f.proposal);
  expect(secondPlan.revision).not.toBe(plan.revision);
  await recovered.approve(secondPlan.id, secondPlan.digest);
  const second = await settle(
    recovered,
    (await recovered.start(secondPlan.id, "second")).id
  );
  expect(await recovered.compare(first.id, second.id)).toMatchObject({
    comparable: true,
    delta: 2,
    better: true
  });
  const different = await recovered.propose({
    ...f.proposal,
    protocol: { ...f.proposal.protocol, dataset: "different-split" }
  });
  await recovered.approve(different.id, different.digest);
  const third = await settle(
    recovered,
    (await recovered.start(different.id, "third")).id
  );
  expect(await recovered.compare(first.id, third.id)).toMatchObject({
    comparable: false,
    delta: null,
    better: null
  });
  const source = {
    runId: first.id,
    artifactPath: first.artifacts[0]!.path,
    sha256: first.artifacts[0]!.sha256!,
    relation: "supports"
  };
  const claim = await recovered.proposeClaim({
    statement: "round two improved",
    limitations: "tiny fixture",
    sources: [source]
  });
  await writeFile(
    join(f.root, ".research/jobs", first.id, "artifacts/results/metrics.json"),
    "tampered"
  );
  await expect(recovered.confirmClaim(claim.id)).rejects.toThrow("改变");
  await expect(recovered.compare(first.id, second.id)).rejects.toThrow("改变");
});
it("records missing artifacts as failed, preserves logs, and never upgrades invalid metrics", async () => {
  const f = await setup(`console.log('completed without evidence');`);
  const plan = await f.service.propose(f.proposal);
  await f.service.approve(plan.id, plan.digest);
  const run = await settle(
    f.service,
    (await f.service.start(plan.id, "missing")).id
  );
  expect(run.state).toBe("failed");
  expect(run.artifacts[0]?.status).toBe("missing");
  expect((await f.service.logs(run.id)).stdout).toContain(
    "completed without evidence"
  );
  await expect(
    f.service.proposeClaim({
      statement: "no evidence",
      limitations: "",
      sources: [
        {
          runId: run.id,
          artifactPath: "results/metrics.json",
          sha256: "a".repeat(64),
          relation: "supports"
        }
      ]
    })
  ).rejects.toThrow("成功");
});
it("enforces wall-clock budgets and user cancellation", async () => {
  const f = await setup(`setInterval(()=>console.log('alive'),100);`);
  const plan = await f.service.propose({ ...f.proposal, timeoutSeconds: 1 });
  await f.service.approve(plan.id, plan.digest);
  const timed = await settle(
    f.service,
    (await f.service.start(plan.id, "timeout")).id
  );
  expect(timed.state).toBe("failed");
  expect(timed.reason).toBe("timeout");
  const next = await f.service.start(plan.id, "cancel");
  await f.service.cancel(next.id);
  expect((await settle(f.service, next.id)).state).toBe("canceled");
  const manifest = JSON.parse(
    await readFile(
      join(f.root, ".research/jobs", next.id, "manifest.json"),
      "utf8"
    )
  );
  expect(manifest.runId).toBe(next.id);
});
it("keeps uncertain SSH submissions as the same Job and recovers without resubmitting", async () => {
  const f = await setup();
  let connected = false,
    submissions = 0,
    canceled = false;
  const remote: RemoteExecutor = {
    submit: async () => {
      submissions++;
      throw new Error("response lost after remote accepted");
    },
    sync: async (run) => {
      if (!connected) throw new Error("disconnected");
      await atomicWorkspaceWrite(
        f.root,
        `.research/jobs/${run.id}/source/results/metrics.json`,
        JSON.stringify([
          { seed: 0, score: 2 },
          { seed: 1, score: 4 }
        ])
      );
      await atomicWorkspaceWrite(
        f.root,
        `.research/jobs/${run.id}/status.json`,
        JSON.stringify({
          runId: run.id,
          token: run.jobToken,
          state: canceled ? "canceled" : "completed",
          pid: 123,
          startedAt: run.createdAt,
          heartbeatAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          exitCode: canceled ? -1 : 0,
          reason: canceled ? "canceled" : null
        })
      );
    },
    cancel: async () => {
      canceled = true;
    }
  };
  const service = new RunService(
    f.root,
    f.runStore,
    f.store,
    f.permissions,
    () => {},
    git,
    remote
  );
  fixtures[fixtures.length - 1]!.service = service;
  const plan = await service.propose({
    ...f.proposal,
    backend: "ssh",
    host: "fixture-host",
    remoteWorkdir: "/workdir/project/jobs",
    remotePython: "/opt/python-a"
  });
  const anotherPython = await service.propose({
    ...plan.proposal,
    remotePython: "/opt/python-b"
  });
  expect(anotherPython.digest).not.toBe(plan.digest);
  expect(anotherPython.comparableGroup).not.toBe(plan.comparableGroup);
  await expect(service.approve(plan.id, plan.digest)).rejects.toThrow(
    "被新方案替代"
  );
  await service.approve(anotherPython.id, anotherPython.digest);
  const run = await service.start(anotherPython.id, "remote-key");
  expect(run.state).toBe("unknown");
  expect((await service.start(anotherPython.id, "remote-key")).id).toBe(run.id);
  expect(submissions).toBe(1);
  await expect(service.start(anotherPython.id, "another-key")).rejects.toThrow(
    "活动或未知"
  );
  connected = true;
  expect((await service.refresh(run.id)).state).toBe("succeeded");
  expect(submissions).toBe(1);
  connected = false;
  const second = await service.start(anotherPython.id, "cancel-remote");
  await service.cancel(second.id);
  connected = true;
  expect((await service.refresh(second.id)).state).toBe("canceled");
});
it.each([
  {
    name: "reordered",
    rows: [
      { seed: 1, score: 4 },
      { seed: 0, score: 2 }
    ],
    state: "succeeded"
  },
  {
    name: "duplicate",
    rows: [
      { seed: 0, score: 2 },
      { seed: 0, score: 4 }
    ],
    state: "failed"
  },
  {
    name: "null",
    rows: [
      { seed: null, score: 2 },
      { seed: 1, score: 4 }
    ],
    state: "failed"
  },
  {
    name: "blank",
    rows: [
      { seed: "", score: 2 },
      { seed: 1, score: 4 }
    ],
    state: "failed"
  }
])(
  "matches seed identities rather than row order: $name",
  async ({ rows, state }) => {
    const f = await setup(
      `require('fs').mkdirSync('results',{recursive:true});require('fs').writeFileSync('results/metrics.json',${JSON.stringify(JSON.stringify(rows))});`
    );
    const plan = await f.service.propose(f.proposal);
    await f.service.approve(plan.id, plan.digest);
    const run = await settle(
      f.service,
      (await f.service.start(plan.id, "seed-regression")).id
    );
    expect(run.state, run.reason ?? "").toBe(state);
    if (state === "succeeded") expect(run.metrics.score).toBe(3);
    else expect(run.reason).toContain("seed");
  }
);
it("rejects altered snapshots, invalid seed identities and mismatched comparison protocols", async () => {
  const f = await setup(
    `require('fs').mkdirSync('results',{recursive:true});require('fs').writeFileSync('results/metrics.json',JSON.stringify([{seed:9,score:2},{seed:1,score:4}]));`
  );
  const plan = await f.service.propose(f.proposal);
  await writeFile(
    join(f.root, `.research/plans/${plan.id}/source/experiment.cjs`),
    "tampered"
  );
  await expect(f.service.approve(plan.id, plan.digest)).rejects.toThrow("改变");
  const correctSnapshot = await f.service.propose(f.proposal);
  await f.service.approve(correctSnapshot.id, correctSnapshot.digest);
  const run = await settle(
    f.service,
    (await f.service.start(correctSnapshot.id, "invalid-seed")).id
  );
  expect(run.state).toBe("failed");
  expect(run.reason).toContain("seed");
});
it("blocks dismissed and replaced plans at approval and launch, including dismissal during snapshot verification", async () => {
  const f = await setup();
  const first = await f.service.propose(f.proposal);
  await f.service.approve(first.id, first.digest);
  const replacement = await f.service.propose(f.proposal, "agent");
  expect(
    f.service.overview().plans.find((plan) => plan.id === first.id)?.closure
  ).toMatchObject({
    kind: "superseded",
    actor: "agent",
    replacementPlanId: replacement.id
  });
  await expect(f.service.approve(first.id, first.digest)).rejects.toThrow(
    "替代"
  );
  await expect(f.service.start(first.id, "old-plan")).rejects.toThrow("替代");
  const approving = f.service.approve(replacement.id, replacement.digest);
  f.service.dismissPlan(replacement.id, "revise the proposal");
  await expect(approving).rejects.toThrow("撤回");
  await expect(
    f.service.start(replacement.id, "dismissed-plan")
  ).rejects.toThrow("撤回");

  const next = await f.service.propose(f.proposal);
  await f.service.approve(next.id, next.digest);
  const starting = f.service.start(next.id, "dismiss-during-verification");
  f.service.dismissPlan(next.id, "do not launch");
  await expect(starting).rejects.toThrow("撤回");
  expect(f.service.overview().runs).toEqual([]);

  const live = await f.service.propose(f.proposal);
  await f.service.approve(live.id, live.digest);
  const run = await f.service.start(live.id, "keep-existing-job");
  f.service.dismissPlan(live.id, "no more attempts");
  expect(await f.service.start(live.id, "keep-existing-job")).toEqual(run);
  await expect(
    f.service.start(live.id, "forbidden-new-attempt")
  ).rejects.toThrow("撤回");
  expect(f.service.overview().runs.map((item) => item.id)).toEqual([run.id]);
});
