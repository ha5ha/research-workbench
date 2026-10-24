import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  PiChatRuntime,
  type PiChatStreamEvent
} from "@research-workbench/agent-runtime";
import { SkillService } from "@research-workbench/core";

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

describe("pi chat runtime", () => {
  it("streams a faux tool loop and persists the session", async () => {
    const root = await mkdtemp(join(tmpdir(), "rw-chat-"));
    cleanup.push(root);
    await copyFile(fixture, join(root, "data.csv"));
    const skills = await SkillService.create({ workspaceRoot: root });
    const runtime = await PiChatRuntime.create({
      workspace: root,
      agentDir: join(root, ".agent"),
      scope,
      tools: {
        profileData: (path) =>
          skills.run("data-profile", {
            scope,
            artifacts: [],
            params: { path }
          })
      }
    });

    try {
      const events: PiChatStreamEvent[] = [];
      const result = await runtime.prompt("画像 data.csv", (event) => {
        events.push(event);
      });

      expect(result.mode).toBe("faux");
      expect(result.text).toContain("数据画像已完成");
      expect(result.sessionFile).toBeTruthy();
      expect(events.some((event) => event.type === "started")).toBe(true);
      expect(
        events.some(
          (event) =>
            event.type === "tool-start" && event.toolName === "data_profile"
        )
      ).toBe(true);
      expect(events.some((event) => event.type === "delta")).toBe(true);
      expect(events.some((event) => event.type === "completed")).toBe(true);
    } finally {
      runtime.dispose();
    }
  }, 20_000);
});
