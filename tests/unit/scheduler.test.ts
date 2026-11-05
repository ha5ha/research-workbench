import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { Scheduler, ScheduleStore, buildDigest } from "@research-workbench/core";

function openStore(): ScheduleStore {
  return new ScheduleStore(new DatabaseSync(":memory:"));
}

describe("ScheduleStore", () => {
  it("upserts idempotently so restarts do not duplicate rows", () => {
    const store = openStore();
    store.upsert({ id: "digest", kind: "digest", intervalSeconds: 900 });
    store.upsert({ id: "digest", kind: "digest", intervalSeconds: 1800 });
    const rows = store.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.intervalSeconds).toBe(1800);
  });

  it("tracks enabled, interval and run bookkeeping", () => {
    const store = openStore();
    store.upsert({ id: "digest", kind: "digest", intervalSeconds: 60 });
    expect(store.setEnabled("digest", false).enabled).toBe(false);
    expect(store.setInterval("digest", 120).intervalSeconds).toBe(120);
    const at = new Date("2026-11-06T00:00:00.000Z");
    const marked = store.markRun("digest", at);
    expect(marked.lastRunAt).toBe(at.toISOString());
    expect(marked.nextRunAt).toBe("2026-11-06T00:02:00.000Z");
  });
});

describe("Scheduler", () => {
  it("only fires due, enabled schedules and reschedules them", async () => {
    const store = openStore();
    store.upsert({ id: "digest", kind: "digest", intervalSeconds: 60 });
    store.upsert({ id: "off", kind: "digest", intervalSeconds: 60, enabled: false });
    const fired: string[] = [];
    const scheduler = new Scheduler(store, async (schedule) => {
      fired.push(schedule.id);
    });

    // not due yet
    const first = await scheduler.tick(new Date("2000-01-01T00:00:00.000Z"));
    expect(first).toEqual([]);

    const later = await scheduler.tick(new Date("2100-01-01T00:00:00.000Z"));
    expect(later).toEqual(["digest"]);
    expect(fired).toEqual(["digest"]);
    expect(
      new Date(store.get("digest")?.nextRunAt ?? 0).getTime()
    ).toBeGreaterThan(new Date("2100-01-01T00:00:00.000Z").getTime());
  });
});

describe("buildDigest", () => {
  it("reports what actually blocks a research loop", () => {
    const digest = buildDigest({
      pendingDrafts: [{ id: "RUN-001", title: "三种子验证" }],
      proposedFacts: [{ id: "F-002", statement: "学习率 1e-4 无效" }],
      stalledRuns: [{ id: "RUN-003", title: "长跑实验", ageMinutes: 95 }],
      sinceLastRun: { milestones: 2, archivedRuns: 1 }
    });
    expect(digest.actionable).toBe(true);
    expect(digest.title).toContain("需要你处理");
    expect(digest.lines.join("\n")).toContain("RUN-001 三种子验证");
    expect(digest.lines.join("\n")).toContain("95 分钟");
    expect(digest.lines.join("\n")).toContain("F-002");
  });

  it("says nothing is pending when everything is clear", () => {
    const digest = buildDigest({
      pendingDrafts: [],
      proposedFacts: [],
      stalledRuns: [],
      sinceLastRun: { milestones: 0, archivedRuns: 0 }
    });
    expect(digest.actionable).toBe(false);
    expect(digest.lines[0]).toContain("没有待确认");
  });
});
