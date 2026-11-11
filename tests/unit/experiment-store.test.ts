import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ExperimentStore } from "@research-workbench/core";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe("ExperimentStore", () => {
  it("creates a task book, finishes and reads back an experiment", async () => {
    const root = await mkdtemp(join(tmpdir(), "rw-store-"));
    cleanup.push(root);
    const store = new ExperimentStore(root);

    try {
      const created = store.create({
        title: "轻量增强三种子验证",
        goal: "验证增强是否稳定",
        hypothesis: "三种子均优于基线",
        design: "配对验证",
        metrics: "准确率",
        seeds: 3
      });
      expect(created.id).toBe("RUN-001");
      expect(created.taskBook.id).toBe("PLAN-001");
      expect(store.list()[0]?.status).toBe("pending");

      store.confirmTaskbook(created.id);
      const finished = store.finish(
        created.id,
        {
          metrics: "73.9 ± 0.7%",
          seeds: 3,
          conclusion: "三个种子上均高于基线",
          status: "archived",
          seedResults: [
            { seed: 1, metrics: { accuracy: 0.74 } },
            { seed: 2, metrics: { accuracy: 0.73 } },
            { seed: 3, metrics: { accuracy: 0.75 } }
          ],
          artifacts: [{ path: "results/seed-metrics.csv", kind: "table" }]
        },
        [
          {
            path: "experiments/001/run.py",
            status: "modified",
            additions: 2,
            deletions: 1,
            diff: "diff",
            before: "a",
            after: "b"
          }
        ]
      );
      expect(finished.status).toBe("archived");
      expect(finished.metrics).toBe("73.9 ± 0.7%");
      expect(finished.files).toHaveLength(1);
      expect(finished.seedResults).toHaveLength(3);
      expect(finished.artifacts[0]?.path).toBe("results/seed-metrics.csv");
      expect(store.list()[0]?.fileCount).toBe(1);
      expect(store.list()[0]?.seedResults[0]?.seed).toBe(1);
      expect(store.get(created.id)?.conclusion).toBe(
        "三个种子上均高于基线"
      );
    } finally {
      store.close();
    }
  });

  it("starts task books as drafts and only runs after confirmation", async () => {
    const root = await mkdtemp(join(tmpdir(), "rw-store-"));
    cleanup.push(root);
    const store = new ExperimentStore(root);

    try {
      const created = store.create({
        title: "待确认的实验",
        goal: "验证确认门",
        hypothesis: "未确认不能跑",
        design: "对照",
        metrics: "acc",
        seeds: 3,
        scope: { projectId: "ws-1", taskId: "T-01" }
      });
      expect(created.taskbookStatus).toBe("draft");
      expect(store.pendingDraftTaskbooks()).toHaveLength(1);
      expect(store.pendingDraftTaskbooks("T-01")).toHaveLength(1);
      expect(store.pendingDraftTaskbooks("T-02")).toHaveLength(0);

      const confirmed = store.confirmTaskbook(created.id);
      expect(confirmed.taskbookStatus).toBe("confirmed");
      expect(confirmed.taskbookConfirmedAt).toBeTruthy();
      expect(store.pendingDraftTaskbooks()).toHaveLength(0);
      expect(store.list()[0]?.taskbookStatus).toBe("confirmed");
    } finally {
      store.close();
    }
  });
});
