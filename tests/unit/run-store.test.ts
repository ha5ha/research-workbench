import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { RunStore } from "@research-workbench/core";
import type { ManagedPlan } from "@research-workbench/contracts";

it("rolls back a run update when its audit event cannot be persisted", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const store = new RunStore(db);
    const plan: ManagedPlan = {
      id: "plan-transaction",
      version: 1,
      taskbookHash: "a",
      revision: "b",
      codeHash: "c",
      inputHash: "d",
      environmentHash: "e",
      comparableGroup: "f",
      files: [],
      digest: "g",
      approvedAt: new Date().toISOString(),
      closure: null,
      createdAt: new Date().toISOString(),
      proposal: {
        experimentId: "experiment-transaction",
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
    store.savePlan(plan);
    const run = store.createRun(plan, "transaction");
    const events = store.events(run.id);
    db.exec(
      "CREATE TRIGGER reject_event BEFORE INSERT ON managed_events BEGIN SELECT RAISE(ABORT, 'injected audit failure'); END;"
    );

    expect(() =>
      store.update({ ...run, cancelRequested: true }, "running", "started")
    ).toThrow("injected audit failure");
    expect(store.run(run.id)).toEqual(run);
    expect(store.events(run.id)).toEqual(events);
    // A fresh transaction also proves the failure did not leave a transaction open.
    db.exec("BEGIN IMMEDIATE; DROP TRIGGER reject_event; COMMIT;");

    const updated = store.update(
      { ...run, cancelRequested: true },
      "running",
      "started"
    );
    expect(store.run(run.id)).toEqual(updated);
    expect(updated).toMatchObject({ state: "running", cancelRequested: true });
    expect(store.events(run.id)).toHaveLength(events.length + 1);
    expect(store.events(run.id).at(-1)).toMatchObject({
      type: "running",
      detail: "started"
    });
  } finally {
    db.close();
  }
});
