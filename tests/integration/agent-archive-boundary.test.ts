import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { PiChatRuntime } from "@research-workbench/agent-runtime";
import { createDemoEnvironment } from "@research-workbench/domain";
import {
  AgentChatService,
  ApprovalBroker,
  ExperimentService,
  ExperimentStore,
  FactStore,
  PermissionService,
  ResearchService,
  RunService,
  RunStore,
  SkillService,
  WorkspaceService
} from "@research-workbench/core";
import type {
  AgentToolDefinition,
  ManagedPlan,
  RunState
} from "@research-workbench/contracts";
import { atomicWorkspaceWrite } from "../../apps/core/src/workspace.js";
import { hash } from "../../apps/core/src/run-snapshot.js";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  vi.restoreAllMocks();
});

async function setup(state?: RunState) {
  const root = await mkdtemp(join(tmpdir(), "rw-agent-archive-"));
  cleanup.push(async () => {
    if (
      !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
      !root.includes("rw-agent-archive-")
    )
      throw new Error("unsafe cleanup");
    await rm(root, { recursive: true, force: true });
  });
  const store = new ExperimentStore(root);
  cleanup.push(async () => store.close());
  const permissions = new PermissionService("workspace-write");
  const runStore = new RunStore(store.database);
  const loop = new RunService(root, runStore, store, permissions);
  const experiment = store.create({
    title: "measurement",
    goal: "g",
    hypothesis: "h",
    design: "d",
    metrics: "score",
    seeds: 2
  });
  store.confirmTaskbook(experiment.id);
  const plan: ManagedPlan = {
    id: "plan-11111111-1111-1111-1111-111111111111",
    version: 1,
    proposal: {
      experimentId: experiment.id,
      command: "never executed",
      timeoutSeconds: 1,
      maxOutputBytes: 1024,
      inputs: [],
      backend: "local",
      protocol: {
        name: "fixed",
        metric: "score",
        direction: "maximize",
        unit: "",
        dataset: "fixture",
        environment: "fixture",
        seeds: [0, 1],
        metricsPath: "results/metrics.json",
        requiredArtifacts: []
      }
    },
    taskbookHash: hash("taskbook"),
    revision: "a".repeat(40),
    codeHash: hash("code"),
    inputHash: hash("input"),
    environmentHash: hash("environment"),
    comparableGroup: hash("group"),
    files: [],
    digest: hash("identity"),
    approvedAt: new Date().toISOString(),
    closure: null,
    createdAt: new Date().toISOString()
  };
  runStore.savePlan(plan);
  const run = state ? runStore.createRun(plan, "fixture") : undefined;
  if (run) {
    const content = JSON.stringify([
      { seed: 0, score: 2 },
      { seed: 1, score: 4 }
    ]);
    const artifacts = [
      {
        path: "results/metrics.json",
        status: "present" as const,
        sha256: hash(content),
        size: Buffer.byteLength(content)
      }
    ];
    await atomicWorkspaceWrite(
      root,
      `.research/jobs/${run.id}/artifacts/results/metrics.json`,
      content
    );
    await atomicWorkspaceWrite(
      root,
      `.research/jobs/${run.id}/manifest.json`,
      JSON.stringify({ runId: run.id, artifacts })
    );
    runStore.update(
      {
        ...run,
        metrics: { score: 999 },
        artifacts,
        finishedAt: new Date().toISOString()
      },
      state!
    );
  }
  let tools: AgentToolDefinition[] = [];
  vi.spyOn(PiChatRuntime, "create").mockImplementation(async (options) => {
    tools = options.tools;
    return {
      prompt: async () => ({
        text: "fixture",
        mode: "faux",
        sessionFile: null
      }),
      dispose: () => {}
    } as unknown as PiChatRuntime;
  });
  const approvals = new ApprovalBroker(() => {});
  const skills = await SkillService.create({ workspaceRoot: root });
  skills.setResearchReader(async () => loop.overview());
  const chat = new AgentChatService(
    skills,
    root,
    approvals,
    createDemoEnvironment(),
    new WorkspaceService(root),
    store,
    new ExperimentService(root),
    permissions,
    new ResearchService(root),
    new FactStore(store.database),
    loop
  );
  cleanup.push(async () => {
    chat.dispose();
    approvals.dispose();
  });
  await chat.prompt("fixture", { projectId: "fixture" }, () => {});
  const execute = (name: string, input: Record<string, unknown>) => {
    const tool = tools.find((item) => item.name === name);
    if (!tool) throw new Error("missing tool");
    return tool.execute(input);
  };
  return {
    skills,
    root,
    store,
    experiment,
    run,
    runStore,
    plan,
    permissions,
    tools,
    execute
  };
}

it.each([
  undefined,
  "preparing",
  "running",
  "collecting",
  "failed",
  "canceled",
  "unknown"
] as const)(
  "rejects Agent archive without a verified succeeded run: %s",
  async (state) => {
    const f = await setup(state);
    await expect(
      f.execute("finish_experiment", {
        experimentId: f.experiment.id,
        runId: f.run?.id ?? "nonexistent"
      })
    ).rejects.toThrow();
    expect(f.store.get(f.experiment.id)?.status).toBe("pending");
  }
);

it("archives only Core-derived metrics and manifest artifacts, keeping conclusions unconfirmed", async () => {
  const f = await setup("succeeded");
  const schema = f.tools.find(
    (item) => item.name === "finish_experiment"
  )!.parameters;
  expect(schema.required).toContain("runId");
  for (const field of [
    "metrics",
    "seedResults",
    "seeds",
    "artifacts",
    "status"
  ])
    expect(schema.properties).not.toHaveProperty(field);
  await f.execute("finish_experiment", {
    experimentId: f.experiment.id,
    runId: f.run!.id,
    conclusion: "candidate interpretation",
    metrics: "999",
    seedResults: [{ seed: 99, metrics: { score: 999 } }],
    seeds: 99,
    artifacts: [{ path: ".research/internal.json", kind: "fake" }],
    status: "failed"
  });
  const archived = f.store.get(f.experiment.id)!;
  expect(archived.status).toBe("archived");
  expect(JSON.parse(archived.metrics!)).toMatchObject({
    score: 3,
    "score.n": 2
  });
  expect(archived.seeds).toBe(2);
  expect(archived.seedResults).toEqual([
    { seed: 0, metrics: { score: 2 } },
    { seed: 1, metrics: { score: 4 } }
  ]);
  expect(archived.artifacts).toEqual([
    {
      path: `.research/jobs/${f.run!.id}/artifacts/results/metrics.json`,
      kind: "metrics"
    }
  ]);
  expect(archived.confirmedAt).toBeNull();
  expect(
    (await f.execute("read_file", { path: archived.artifacts[0]!.path }))
      .content[0]
  ).toMatchObject({ type: "text", text: expect.stringContaining('"score":2') });
  await expect(
    f.execute("finish_experiment", {
      experimentId: f.experiment.id,
      runId: f.run!.id
    })
  ).rejects.toThrow("不能覆盖");
});

it("rejects a successful run from another experiment and a newer active attempt", async () => {
  const f = await setup("succeeded");
  const other = f.store.create({
    title: "other",
    goal: "g",
    hypothesis: "h",
    design: "d",
    metrics: "score",
    seeds: 2
  });
  f.store.confirmTaskbook(other.id);
  await expect(
    f.execute("finish_experiment", { experimentId: other.id, runId: f.run!.id })
  ).rejects.toThrow("不属于");
  f.runStore.createRun(f.plan, "second");
  await expect(
    f.execute("finish_experiment", {
      experimentId: f.experiment.id,
      runId: f.run!.id
    })
  ).rejects.toThrow("活动或未知");
});

it.each(["changed", "missing"])(
  "rejects %s evidence before archive",
  async (kind) => {
    const f = await setup("succeeded");
    const path = `.research/jobs/${f.run!.id}/artifacts/results/metrics.json`;
    if (kind === "changed")
      await atomicWorkspaceWrite(f.root, path, '[{"seed":0,"score":9}]');
    else await rm(join(f.root, path));
    await expect(
      f.execute("finish_experiment", {
        experimentId: f.experiment.id,
        runId: f.run!.id
      })
    ).rejects.toThrow();
    expect(f.store.get(f.experiment.id)?.status).toBe("pending");
  }
);

it("denies read-only Agent writes and archive, and strips private Job tokens from model state", async () => {
  const f = await setup("succeeded");
  const state = await f.execute("research_state", {});
  expect(JSON.stringify(state)).not.toContain(f.run!.jobToken);
  expect(JSON.stringify(state)).not.toContain("jobToken");
  const checkpoint = await f.skills.run("research-checkpoint", {
    scope: { projectId: "fixture" },
    artifacts: [],
    params: {}
  });
  const report = await f.execute("read_file", {
    path: checkpoint.artifacts[0]!.path
  });
  expect(JSON.stringify(report)).not.toContain(f.run!.jobToken);
  expect(JSON.stringify(report)).not.toContain("jobToken");
  await expect(
    f.execute("read_file", {
      path: `./.research/jobs/${f.run!.id}/manifest.json`
    })
  ).rejects.toThrow("专用服务");
  f.permissions.configure({ level: "read-only" });
  await expect(
    f.execute("write_file", { path: "ordinary.txt", content: "changed" })
  ).rejects.toThrow("权限拒绝");
  await expect(
    f.execute("finish_experiment", {
      experimentId: f.experiment.id,
      runId: f.run!.id
    })
  ).rejects.toThrow("权限拒绝");
});
