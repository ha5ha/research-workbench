import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { loadSkill } from "@research-workbench/research-skills";

const dataProfileDir = fileURLToPath(
  new URL(
    "../../packages/research-skills/skills/data-profile",
    import.meta.url
  )
);
const checkpointDir = fileURLToPath(
  new URL(
    "../../packages/research-skills/skills/research-checkpoint",
    import.meta.url
  )
);

describe("SKILL.md loader", () => {
  it("loads a runnable skill with allowed tools", async () => {
    const skill = await loadSkill(dataProfileDir);
    expect(skill.manifest.id).toBe("data-profile");
    expect(skill.manifest.status).toBe("runnable");
    expect(skill.manifest.allowedTools).toContain("fs.read");
    expect(skill.body).toContain("Data Profile");
  });

  it("loads the checkpoint implementation as runnable", async () => {
    const skill = await loadSkill(checkpointDir);
    expect(skill.manifest.status).toBe("runnable");
  });
});
