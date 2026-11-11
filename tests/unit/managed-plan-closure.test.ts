import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { RunStore } from "@research-workbench/core";
import type { ManagedPlan } from "@research-workbench/contracts";

function plan(id: string): ManagedPlan {
  return {
    id,
    version: 1,
    taskbookHash: "a",
    revision: "b",
    codeHash: "c",
    inputHash: "d",
    environmentHash: "e",
    comparableGroup: "f",
    files: [],
    digest: id,
    approvedAt: null,
    closure: null,
    createdAt: new Date().toISOString(),
    proposal: {
      experimentId: "fixture",
      command: "fixture",
      timeoutSeconds: 1,
      maxOutputBytes: 1024,
      inputs: [],
      backend: "local",
      protocol: {
        name: "fixture",
        metric: "score",
        direction: "maximize",
        unit: "",
        dataset: "fixture",
        environment: "fixture",
        seeds: [0],
        metricsPath: "results/metrics.json",
        requiredArtifacts: []
      }
    }
  };
}

it("supersedes unused plans atomically, refuses stale approved objects, and preserves started jobs", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const store = new RunStore(db);
    const first = plan("first");
    store.savePlan(first);
    const staleApproved = store.approve(first.id, first.digest);
    const replacement = plan("replacement");
    store.savePlan(replacement, "agent");
    expect(store.plan(first.id)?.closure).toMatchObject({
      kind: "superseded",
      actor: "agent",
      replacementPlanId: replacement.id
    });
    expect(() => store.approve(first.id, first.digest)).toThrow("替代");
    expect(() => store.createRun(staleApproved, "stale")).toThrow("替代");
    expect(() => store.savePlan(first)).toThrow("不可覆盖");

    const approved = store.approve(replacement.id, replacement.digest);
    const run = store.createRun(approved, "existing");
    const next = plan("next");
    store.savePlan(next, "agent");
    expect(store.plan(replacement.id)?.closure).toBeNull();
    expect(store.run(run.id)).toEqual(run);
    store.dismiss(replacement.id, "do not submit another attempt");
    expect(store.createRun(approved, "existing")).toEqual(run);
    expect(() => store.createRun(approved, "another")).toThrow("撤回");
    expect(store.run(run.id)).toEqual(run);
  } finally {
    db.close();
  }
});

it("rolls back replacement and dismissal when their lifecycle audit cannot be saved", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const store = new RunStore(db);
    const first = plan("first");
    store.savePlan(first);
    db.exec(
      "CREATE TRIGGER reject_closure BEFORE INSERT ON managed_plan_events BEGIN SELECT RAISE(ABORT, 'injected closure failure'); END;"
    );
    expect(() => store.savePlan(plan("replacement"), "agent")).toThrow(
      "injected closure failure"
    );
    expect(store.plans()).toEqual([first]);
    expect(() => store.dismiss(first.id, "reason")).toThrow(
      "injected closure failure"
    );
    expect(store.plan(first.id)?.closure).toBeNull();
    db.exec("DROP TRIGGER reject_closure");
    const dismissed = store.dismiss(first.id, "reason");
    expect(store.dismiss(first.id, "attempt to rewrite audit")).toEqual(
      dismissed
    );
    expect(dismissed.closure).toMatchObject({
      kind: "dismissed",
      actor: "human",
      reason: "reason",
      replacementPlanId: null
    });
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM managed_plan_events").get()
    ).toEqual({ n: 1 });
  } finally {
    db.close();
  }
});

it("migrates historical plan JSON once, retains the original backup, and rolls back incomplete migrations", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE managed_plans (id TEXT PRIMARY KEY, data TEXT NOT NULL)"
    );
    const insert = (id: string) => {
      const legacy = plan(id) as Partial<ManagedPlan>;
      delete legacy.closure;
      const original = JSON.stringify(legacy);
      db.prepare("INSERT INTO managed_plans VALUES (?,?)").run(id, original);
      return original;
    };
    const firstOriginal = insert("first");
    insert("latest");
    db.exec(
      "CREATE TABLE managed_plan_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, plan_id TEXT NOT NULL, data TEXT NOT NULL);"
    );
    db.exec(
      "CREATE TRIGGER reject_migration BEFORE INSERT ON managed_plan_events BEGIN SELECT RAISE(ABORT, 'injected migration failure'); END;"
    );
    expect(() => new RunStore(db)).toThrow("injected migration failure");
    expect(
      db.prepare("SELECT data FROM managed_plans WHERE id='first'").get()
    ).toEqual({ data: firstOriginal });
    expect(
      db
        .prepare("SELECT COUNT(*) AS n FROM managed_plan_migration_backup")
        .get()
    ).toEqual({ n: 0 });
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM managed_schema_migrations").get()
    ).toEqual({ n: 0 });
    db.exec("DROP TRIGGER reject_migration");

    const store = new RunStore(db);
    expect(store.plan("first")?.closure).toMatchObject({
      kind: "superseded",
      actor: "system",
      replacementPlanId: "latest"
    });
    expect(store.plan("latest")?.closure).toBeNull();
    expect(
      db
        .prepare(
          "SELECT data FROM managed_plan_migration_backup WHERE plan_id='first'"
        )
        .get()
    ).toEqual({ data: firstOriginal });
    new RunStore(db);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM managed_plan_events").get()
    ).toEqual({ n: 1 });
    expect(
      db
        .prepare("SELECT COUNT(*) AS n FROM managed_plan_migration_backup")
        .get()
    ).toEqual({ n: 2 });
  } finally {
    db.close();
  }
});

it("keeps an existing historical run while closing an older unused proposal during migration", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const initial = new RunStore(db);
    const oldest = plan("oldest");
    initial.savePlan(oldest);
    const latest = plan("latest");
    initial.savePlan(latest);
    const approved = initial.approve(latest.id, latest.digest);
    const run = initial.createRun(approved, "historical");
    for (const item of [oldest, approved]) {
      const legacy = { ...item } as Partial<ManagedPlan>;
      delete legacy.closure;
      db.prepare("UPDATE managed_plans SET data=? WHERE id=?").run(
        JSON.stringify(legacy),
        item.id
      );
    }
    db.exec(
      "DELETE FROM managed_schema_migrations; DELETE FROM managed_plan_events;"
    );
    const migrated = new RunStore(db);
    expect(migrated.plan(oldest.id)?.closure).toMatchObject({
      kind: "superseded",
      replacementPlanId: latest.id
    });
    expect(migrated.plan(latest.id)?.closure).toBeNull();
    expect(migrated.run(run.id)).toEqual(run);
    expect(migrated.createRun(approved, "historical")).toEqual(run);
  } finally {
    db.close();
  }
});
