import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { MilestoneStore } from "@research-workbench/core";

const dbs: DatabaseSync[] = [];

function open(): MilestoneStore {
  const db = new DatabaseSync(":memory:");
  dbs.push(db);
  return new MilestoneStore(db);
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});

describe("MilestoneStore", () => {
  it("records milestones with sequential ids and filters by task", () => {
    const store = open();
    const first = store.record({
      taskId: "T-01",
      kind: "taskbook",
      title: "任务书：三种子验证",
      experimentId: "RUN-001",
      at: "2026-11-01T10:00:00.000Z"
    });
    store.record({
      taskId: "T-02",
      kind: "archive",
      title: "归档：另一条任务",
      at: "2026-11-02T10:00:00.000Z"
    });
    expect(first.id).toBe("M-0001");
    const onlyTaskOne = store.list({ taskId: "T-01" });
    expect(onlyTaskOne).toHaveLength(1);
    expect(onlyTaskOne[0]?.title).toContain("三种子验证");
  });

  it("lists newest first and respects the limit", () => {
    const store = open();
    store.record({ kind: "taskbook", title: "旧", at: "2026-11-01T00:00:00.000Z" });
    store.record({ kind: "archive", title: "新", at: "2026-11-03T00:00:00.000Z" });
    const listed = store.list({ limit: 1 });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.title).toBe("新");
  });

  it("truncates very long titles instead of storing unbounded text", () => {
    const store = open();
    const milestone = store.record({ kind: "archive", title: "长".repeat(500) });
    expect(milestone.title.length).toBe(300);
  });
});
