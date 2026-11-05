import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  AgentChatService,
  ApprovalBroker,
  ExperimentService,
  ExperimentStore,
  FactStore,
  PermissionService,
  ResearchService,
  SkillService,
  WorkspaceService
} from "@research-workbench/core";
import { createDemoEnvironment } from "@research-workbench/domain";

const fixture = fileURLToPath(
  new URL(
    "../../packages/research-skills/fixtures/messy.csv",
    import.meta.url
  )
);
const scope = {
  projectId: "project-demo",
  questionId: "Q-01",
  taskId: "T-02"
};
const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe("Agent experiment creation", () => {
  it("lets the agent create a task book and pending experiment record", async () => {
    const root = await mkdtemp(join(tmpdir(), "rw-agent-exp-"));
    cleanup.push(root);
    await copyFile(fixture, join(root, "data.csv"));
    const skills = await SkillService.create({ workspaceRoot: root });
    const workspace = new WorkspaceService(root);
    const store = new ExperimentStore(root);
    const experimentService = new ExperimentService(root);
    const approvals = new ApprovalBroker(() => {});
    const chat = new AgentChatService(
      skills,
      root,
      approvals,
      createDemoEnvironment(),
      workspace,
      store,
      experimentService,
      new PermissionService(),
      new ResearchService(root),
      new FactStore(store.database)
    );

    try {
      const events: Array<{ type: string; card?: { kind: string } }> = [];
      const result = await chat.prompt(
        "请设计并运行一个实验，验证增强是否稳定。",
        scope,
        (event) => events.push(event as { type: string; card?: { kind: string } })
      );
      expect(result.text).toContain("实验记录");
      const records = store.list();
      expect(records).toHaveLength(1);
      expect(records[0]?.status).toBe("pending");
      expect(records[0]?.taskBook.goal).toContain("轻量增强");
      expect(records[0]?.taskBook.seeds).toBe(3);

      // Research objects must surface in the conversation stream, not only in
      // the records page.
      const cards = events.filter((event) => event.type === "card");
      expect(cards.length).toBeGreaterThan(0);
      expect(cards[0]?.card?.kind).toBe("taskbook");
    } finally {
      chat.dispose();
      approvals.dispose();
      store.close();
    }
  }, 20_000);
});
