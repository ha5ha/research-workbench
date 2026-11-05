import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { FactStore } from "@research-workbench/core";

const stores: FactStore[] = [];
const dbs: DatabaseSync[] = [];

function open(): FactStore {
  const db = new DatabaseSync(":memory:");
  dbs.push(db);
  const store = new FactStore(db);
  stores.push(store);
  return store;
}

afterEach(() => {
  stores.length = 0;
  for (const db of dbs.splice(0)) db.close();
});

describe("FactStore", () => {
  it("creates proposed facts and lists them by importance", () => {
    const store = open();
    const low = store.create({ statement: "次要观察", importance: 1 });
    const high = store.create({ statement: "关键结论", importance: 5 });
    expect(low.id).toBe("F-001");
    expect(high.id).toBe("F-002");
    const listed = store.list();
    expect(listed.map((fact) => fact.statement)).toEqual([
      "关键结论",
      "次要观察"
    ]);
    expect(listed[0]?.status).toBe("proposed");
  });

  it("confirms a fact and records when it happened", () => {
    const store = open();
    const fact = store.create({ statement: "增强有效", kind: "finding" });
    const confirmed = store.setStatus(fact.id, "confirmed");
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.confirmedAt).toBeTruthy();
  });

  it("filters by topic and rejects unknown ids", () => {
    const store = open();
    store.create({ statement: "TP-01 的事实", topicId: "TP-01" });
    store.create({ statement: "TP-02 的事实", topicId: "TP-02" });
    expect(store.list({ topicId: "TP-01" })).toHaveLength(1);
    expect(() => store.setStatus("F-999", "confirmed")).toThrow(
      "事实不存在：F-999"
    );
  });

  it("clamps importance into 1..5 and defaults the kind", () => {
    const store = open();
    const fact = store.create({ statement: "越界权重", importance: 42 });
    expect(fact.importance).toBe(5);
    expect(fact.kind).toBe("finding");
  });
});
