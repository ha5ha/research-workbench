import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  it("starts empty and persists topics, literature, routes and tasks", async () => {
    const root = await mkdtemp(join(tmpdir(), "rw-research-"));
    cleanup.push(root);
    const service = new ResearchService(root);
    expect(await service.tree()).toEqual([]);

    const topic = await service.createTopic(
      "小样本分类",
      "验证增强是否稳定"
    );
    expect(topic.id).toBe("TP-01");
    expect(topic.description).toBe("验证增强是否稳定");

    await service.addLiterature(topic.id, {
      title: "A robust benchmark",
      url: "https://example.com/paper"
    });
    const route = await service.createRoute(topic.id, "三种子配对");
    expect(route.id).toBe("R-01");
    const task = await service.createTask(route.id, "跑 seed 0");
    expect(task.id).toBe("T-01");

    const reloaded = new ResearchService(root);
    const topics = await reloaded.tree();
    expect(topics).toHaveLength(1);
    expect(topics[0]?.literature[0]?.title).toBe("A robust benchmark");
    expect(topics[0]?.routes[0]?.tasks[0]?.title).toBe("跑 seed 0");
  });

  it("migrates legacy question files into a topic with routes", async () => {
    const root = await mkdtemp(join(tmpdir(), "rw-research-legacy-"));
    cleanup.push(root);
    await mkdir(join(root, ".research"), { recursive: true });
    await writeFile(
      join(root, ".research", "research.json"),
      JSON.stringify({
        questions: [
          {
            id: "Q-01",
            title: "旧问题",
            tasks: [{ id: "T-01", title: "旧任务", status: "done" }]
          }
        ]
      }),
      "utf8"
    );

    const topics = await new ResearchService(root).tree();
    expect(topics[0]?.title).toBe("未命名课题");
    expect(topics[0]?.routes[0]?.title).toBe("旧问题");
    expect(topics[0]?.routes[0]?.tasks[0]?.status).toBe("done");
    expect(topics[0]?.routes[0]?.status).toBe("done");

    const raw = await readFile(join(root, ".research", "research.json"), "utf8");
    expect(JSON.parse(raw).version).toBe(2);
  });
});
