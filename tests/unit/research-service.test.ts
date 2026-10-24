import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ResearchService } from "@research-workbench/core";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe("ResearchService", () => {
  it("starts empty and persists questions and tasks", async () => {
    const root = await mkdtemp(join(tmpdir(), "rw-research-"));
    cleanup.push(root);
    const service = new ResearchService(root);
    expect(await service.tree()).toEqual([]);

    const question = await service.createQuestion("验证增强是否稳定");
    expect(question.id).toBe("Q-01");
    const task = await service.createTask(question.id, "三种子配对验证");
    expect(task.id).toBe("T-01");

    const reloaded = new ResearchService(root);
    const tree = await reloaded.tree();
    expect(tree).toHaveLength(1);
    expect(tree[0]?.tasks[0]?.title).toBe("三种子配对验证");
  });
});
