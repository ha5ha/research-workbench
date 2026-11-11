import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  ExperimentStore,
  PermissionService,
  RunService,
  RunStore
} from "@research-workbench/core";
import type {
  LoopOverview,
  ManagedPlan,
  SnapshotFile
} from "@research-workbench/contracts";
import { RunSnapshot, hash } from "../../apps/core/src/run-snapshot.js";
import { loopRequest } from "../../apps/core/src/loop-rpc.js";
import { experimentPlanState } from "../../apps/desktop/src/renderer/src/research/plan-state.js";

const roots: string[] = [];
const stores: ExperimentStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) {
    if (
      !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
      !root.includes("rw-frozen-review-")
    )
      throw new Error("unsafe fixture cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
function plan(id: string, files: SnapshotFile[]): ManagedPlan {
  return {
    id,
    version: 1,
    createdAt: new Date().toISOString(),
    approvedAt: null,
    closure: null,
    revision: "a".repeat(40),
    taskbookHash: "task",
    codeHash: "code",
    inputHash: "input",
    environmentHash: "environment",
    comparableGroup: "group",
    digest: "b".repeat(64),
    files,
    proposal: {
      experimentId: "experiment",
      command: "node experiment.cjs",
      timeoutSeconds: 30,
      maxOutputBytes: 65536,
      inputs: [],
      backend: "local",
      protocol: {
        name: "fixture",
        metric: "score",
        direction: "maximize",
        unit: "",
        dataset: "fixed",
        environment: "node",
        seeds: [0],
        metricsPath: "results/metrics.json",
        requiredArtifacts: []
      }
    }
  };
}
async function setup(
  content: string | Buffer = "// 冻结版本\r\nconsole.log('frozen');\n"
) {
  const root = await mkdtemp(join(tmpdir(), "rw-frozen-review-"));
  roots.push(root);
  const bytes = Buffer.from(content);
  const path = "experiment.cjs";
  const file = { path, sha256: hash(bytes), size: bytes.length };
  const frozen = join(root, ".research/plans/plan-first/source");
  await mkdir(frozen, { recursive: true });
  await writeFile(join(frozen, path), bytes);
  await writeFile(join(root, path), "// working tree is a different version");
  return { root, path, file, bytes, frozen, snapshot: new RunSnapshot(root) };
}

it("reads only the exact complete frozen text, preserving Unicode and line endings", async () => {
  const f = await setup();
  expect(await f.snapshot.readText("plan-first", [f.file], f.path)).toEqual({
    planId: "plan-first",
    path: f.path,
    sha256: f.file.sha256,
    size: f.bytes.length,
    content: f.bytes.toString("utf8")
  });
  const empty = await setup("");
  expect(
    (await empty.snapshot.readText("plan-first", [empty.file], empty.path))
      .content
  ).toBe("");
  const boundary = await setup("a".repeat(128 * 1024));
  expect(
    (
      await boundary.snapshot.readText(
        "plan-first",
        [boundary.file],
        boundary.path
      )
    ).content.length
  ).toBe(128 * 1024);
});

it("rejects nonmanifest paths, traversal, reserved paths and symlinked snapshot directories", async () => {
  const f = await setup();
  for (const path of [
    "../experiment.cjs",
    "C:/secret",
    "nested\\file",
    "/absolute",
    ".research/secret",
    ".env",
    "unknown.cjs"
  ]) {
    await expect(
      f.snapshot.readText("plan-first", [f.file], path)
    ).rejects.toThrow();
  }
  await expect(
    f.snapshot.readText("../plan-first", [f.file], f.path)
  ).rejects.toThrow("标识");
  await mkdir(join(f.root, ".research/plans/plan-link"));
  await symlink(
    f.frozen,
    join(f.root, ".research/plans/plan-link/source"),
    process.platform === "win32" ? "junction" : "dir"
  );
  await expect(
    f.snapshot.readText("plan-link", [f.file], f.path)
  ).rejects.toThrow(/链接|junction/);
});

it("refuses oversized, binary, invalid UTF-8, changed, and missing frozen files without a working-tree fallback", async () => {
  const f = await setup();
  await expect(
    f.snapshot.readText("plan-first", [{ ...f.file, size: 131073 }], f.path)
  ).rejects.toThrow("128 KiB");
  for (const content of [
    Buffer.from([0x61, 0, 0x62]),
    Buffer.from([0xc3, 0x28]),
    Buffer.from([0x61, 0x1b, 0x62])
  ]) {
    const binary = await setup(content);
    await expect(
      binary.snapshot.readText("plan-first", [binary.file], binary.path)
    ).rejects.toThrow(/UTF-8|二进制/);
  }
  await writeFile(join(f.frozen, f.path), Buffer.alloc(f.bytes.length, 0x61));
  await expect(
    f.snapshot.readText("plan-first", [f.file], f.path)
  ).rejects.toThrow("已改变");
  await writeFile(join(f.frozen, f.path), Buffer.alloc(131073));
  await expect(
    f.snapshot.readText("plan-first", [f.file], f.path)
  ).rejects.toThrow("128 KiB");
  await expect(
    f.snapshot.readText("plan-missing", [f.file], f.path)
  ).rejects.toThrow();
});

it("keeps dismissed and superseded snapshots readable through validated read-only RPC without reopening them", async () => {
  const f = await setup();
  const experiments = new ExperimentStore(f.root);
  stores.push(experiments);
  const store = new RunStore(experiments.database);
  const service = new RunService(
    f.root,
    store,
    experiments,
    new PermissionService("read-only")
  );
  const first = plan("plan-first", [f.file]);
  store.savePlan(first);
  await expect(
    loopRequest(service, "plans.readFrozenFile", { id: first.id, path: f.path })
  ).resolves.toMatchObject({ content: f.bytes.toString("utf8") });
  const second = { ...plan("plan-second", [f.file]), version: 2 };
  store.savePlan(second, "agent");
  expect(store.plan(first.id)?.closure?.kind).toBe("superseded");
  const before = store.plan(first.id);
  await expect(
    loopRequest(service, "plans.readFrozenFile", { id: first.id, path: f.path })
  ).resolves.toMatchObject({ sha256: f.file.sha256 });
  expect(store.plan(first.id)).toEqual(before);
  await expect(service.approve(first.id, first.digest)).rejects.toThrow("替代");
  store.dismiss(second.id, "not needed");
  await mkdir(join(f.root, ".research/plans/plan-second/source"), {
    recursive: true
  });
  await writeFile(
    join(f.root, ".research/plans/plan-second/source", f.path),
    f.bytes
  );
  await expect(
    service.readFrozenFile(second.id, f.path)
  ).resolves.toMatchObject({ content: f.bytes.toString("utf8") });
  expect(store.plan(second.id)?.closure?.kind).toBe("dismissed");
  await expect(
    loopRequest(service, "plans.readFrozenFile", {
      id: first.id,
      path: "../experiment.cjs"
    })
  ).rejects.toThrow();
  await expect(service.readFrozenFile("unknown-plan", f.path)).rejects.toThrow(
    "不存在"
  );
  expect(service.overview().runs).toHaveLength(0);
});

it("projects pending, replaced, dismissed and started card state from the ledger", () => {
  const first = plan("plan-first", []),
    second = { ...plan("plan-second", []), version: 2 };
  const overview: LoopOverview = {
    compass: {
      goal: "",
      constraints: "",
      stopConditions: "",
      nextStep: "",
      nextStepReason: "",
      updatedAt: ""
    },
    plans: [first],
    runs: [],
    claims: [],
    decisions: []
  };
  expect(experimentPlanState(null, "experiment").pending).toBeNull();
  expect(experimentPlanState(overview, "experiment").pending?.id).toBe(
    first.id
  );
  first.closure = {
    kind: "superseded",
    at: "now",
    actor: "agent",
    reason: "new version",
    replacementPlanId: second.id
  };
  overview.plans.push(second);
  expect(experimentPlanState(overview, "experiment").pending?.id).toBe(
    second.id
  );
  second.closure = {
    kind: "dismissed",
    at: "now",
    actor: "human",
    reason: "not needed",
    replacementPlanId: null
  };
  expect(experimentPlanState(overview, "experiment")).toMatchObject({
    pending: null,
    plan: { closure: { kind: "dismissed" } }
  });
  overview.runs.push({
    id: "run",
    planId: second.id,
    experimentId: "experiment",
    attempt: 1,
    idempotencyKey: "key",
    state: "running",
    jobToken: "fixture",
    pid: 1,
    createdAt: "now",
    startedAt: "now",
    finishedAt: null,
    exitCode: null,
    reason: null,
    metrics: {},
    artifacts: [],
    cancelRequested: false
  });
  expect(experimentPlanState(overview, "experiment")).toMatchObject({
    pending: null,
    run: { state: "running" }
  });
});
