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
  it("persists a topic with projects, knowledge, literature and questions", async () => {
    const root = await mkdtemp(join(tmpdir(), "rw-research-"));
    cleanup.push(root);
    const service = new ResearchService(root);
    expect(await service.tree()).toEqual([]);

    const topic = await service.createTopic("小样本分类", "验证增强是否稳定");
    expect(topic.id).toBe("TP-01");
    expect(topic.description).toBe("验证增强是否稳定");

    const project = await service.createProject(topic.id, {
      name: "baseline",
      path: "projects/baseline"
    });
    expect(project.id).toBe("P-01");

    const knowledge = await service.createKnowledge(topic.id, {
      title: "验证集划分",
      body: "固定 seed 42 的 stratified split",
      tags: ["数据"]
    });
    expect(knowledge.id).toBe("K-01");

    await service.addLiterature(topic.id, {
      title: "A robust benchmark",
      url: "https://example.com/paper"
    });

    const question = await service.createQuestion(topic.id, "三种子配对");
    expect(question.id).toBe("R-01");
    const task = await service.createTask(question.id, "跑 seed 0");
    expect(task.id).toBe("T-01");

    const reloaded = new ResearchService(root);
    const topics = await reloaded.tree();
    expect(topics).toHaveLength(1);
    expect(topics[0]?.projects[0]?.name).toBe("baseline");
    expect(topics[0]?.knowledge[0]?.title).toBe("验证集划分");
    expect(topics[0]?.literature[0]?.title).toBe("A robust benchmark");
    expect(topics[0]?.questions[0]?.tasks[0]?.title).toBe("跑 seed 0");

    const raw = JSON.parse(
      await readFile(join(root, ".research", "research.json"), "utf8")
    );
    expect(raw.version).toBe(3);
  });

  it("deletes projects, knowledge and questions independently", async () => {
    const root = await mkdtemp(join(tmpdir(), "rw-research-delete-"));
    cleanup.push(root);
    const service = new ResearchService(root);
    const topic = await service.createTopic("可删除");
    const project = await service.createProject(topic.id, { name: "p" });
    const knowledge = await service.createKnowledge(topic.id, {
      title: "k",
      body: ""
    });
    const question = await service.createQuestion(topic.id, "q");

    await service.deleteProject(topic.id, project.id);
    await service.deleteKnowledge(topic.id, knowledge.id);
    await service.deleteQuestion(question.id);

    const [reloaded] = await service.tree();
    expect(reloaded?.projects).toHaveLength(0);
    expect(reloaded?.knowledge).toHaveLength(0);
    expect(reloaded?.questions).toHaveLength(0);
    await expect(service.deleteQuestion("R-99")).rejects.toThrow("子问题不存在");
  });

  it("migrates v2 files that still store routes", async () => {
    const root = await mkdtemp(join(tmpdir(), "rw-research-v2-"));
    cleanup.push(root);
    await mkdir(join(root, ".research"), { recursive: true });
    await writeFile(
      join(root, ".research", "research.json"),
      JSON.stringify({
        version: 2,
        topics: [
          {
            id: "TP-01",
            title: "旧课题",
            description: "v2",
            literature: [],
            routes: [
              {
                id: "R-01",
                title: "旧路线",
                status: "planned",
                tasks: [{ id: "T-01", title: "旧任务", status: "done" }]
              }
            ]
          }
        ]
      }),
      "utf8"
    );

    const topics = await new ResearchService(root).tree();
    expect(topics[0]?.title).toBe("旧课题");
    // routes become questions, ids preserved so experiment scope still resolves
    expect(topics[0]?.questions[0]?.id).toBe("R-01");
    expect(topics[0]?.questions[0]?.title).toBe("旧路线");
    expect(topics[0]?.questions[0]?.status).toBe("done");
    expect(topics[0]?.projects).toEqual([]);
    expect(topics[0]?.knowledge).toEqual([]);
  });

  it("migrates legacy question files into a topic with questions", async () => {
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
    expect(topics[0]?.questions[0]?.title).toBe("旧问题");
    expect(topics[0]?.questions[0]?.tasks[0]?.status).toBe("done");
    expect(topics[0]?.questions[0]?.status).toBe("done");

    const raw = JSON.parse(
      await readFile(join(root, ".research", "research.json"), "utf8")
    );
    expect(raw.version).toBe(3);
  });
});
