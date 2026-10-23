import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  SkillService,
  ToolNotAllowedError,
  WorkspaceAccessError
} from "@research-workbench/core";

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

async function createWorkspace(): Promise<{ root: string; service: SkillService }> {
  const root = await mkdtemp(join(tmpdir(), "rw-skill-"));
  cleanup.push(root);
  await copyFile(fixture, join(root, "data.csv"));
  const service = await SkillService.create({ workspaceRoot: root });
  return { root, service };
}

describe("data-profile skill", () => {
  it("profiles a CSV without leaking raw rows", async () => {
    const { root, service } = await createWorkspace();
    const result = await service.run("data-profile", {
      scope,
      artifacts: [],
      params: { path: "data.csv" }
    });

    expect(result.status).toBe("succeeded");
    expect(result.artifacts).toHaveLength(1);
    expect(result.summary).toContain("6 行");
    expect(result.summary).toContain("5 列");
    expect(result.warnings.length).toBeGreaterThan(0);

    const artifact = result.artifacts[0];
    expect(artifact).toBeDefined();
    if (!artifact) return;

    const report = await readFile(join(root, artifact.path), "utf8");
    expect(report).toContain("\"rowCount\": 6");
    expect(report).toContain("\"columnCount\": 5");
    expect(report).not.toContain("0.71");
    expect(report).not.toContain("s1");
    expect(report).toContain("\"missing\": 1");
    expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a path outside the workspace", async () => {
    const { service } = await createWorkspace();
    await expect(
      service.run("data-profile", {
        scope,
        artifacts: [],
        params: { path: "../outside.csv" }
      })
    ).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("rejects an absolute path", async () => {
    const { service } = await createWorkspace();
    await expect(
      service.run("data-profile", {
        scope,
        artifacts: [],
        params: { path: "C:\\Windows\\win.ini" }
      })
    ).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("enforces allowed-tools from SKILL.md", async () => {
    const root = await mkdtemp(join(tmpdir(), "rw-tools-"));
    cleanup.push(root);
    await copyFile(fixture, join(root, "data.csv"));
    const skillsDir = join(root, "skills");
    const skillDir = join(skillsDir, "data-profile");
    await mkdir(skillDir, { recursive: true });
    const source = await readFile(
      fileURLToPath(
        new URL(
          "../../packages/research-skills/skills/data-profile/SKILL.md",
          import.meta.url
        )
      ),
      "utf8"
    );
    await writeFile(
      join(skillDir, "SKILL.md"),
      source.replace("  - fs.read\n", "")
    );
    const service = await SkillService.create({
      workspaceRoot: root,
      skillsDir
    });

    await expect(
      service.run("data-profile", {
        scope,
        artifacts: [],
        params: { path: "data.csv" }
      })
    ).rejects.toBeInstanceOf(ToolNotAllowedError);
  });
});
