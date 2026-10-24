import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runPiSpike } from "@research-workbench/agent-runtime";
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

describe("pi SDK spike", () => {
  it("runs a faux-model tool loop through a research skill", async () => {
    const root = await mkdtemp(join(tmpdir(), "rw-pi-"));
    cleanup.push(root);
    await copyFile(fixture, join(root, "data.csv"));
    const skills = await SkillService.create({ workspaceRoot: root });

    const result = await runPiSpike({
      workspace: root,
      agentDir: join(root, ".agent"),
      tools: {
        profileData: (path) =>
          skills.run("data-profile", {
            scope,
            artifacts: [],
            params: { path }
          })
      }
    });

    expect(result.systemPrompts[0]).toContain("Research Workbench");
    expect(result.toolCallAttempts).toContain("dangerous_echo");
    expect(result.blockedTools).toContain("dangerous_echo");
    expect(result.toolNames).toContain("data_profile");
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.kind).toBe("data-profile");
    expect(result.text).toContain("Data profile complete");
    expect(result.sessionFile).toBeTruthy();
    expect(result.eventTypes).toContain("tool_execution_start");
    expect(result.eventTypes).toContain("agent_settled");
  }, 20_000);
});
