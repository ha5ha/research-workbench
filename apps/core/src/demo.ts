import { copyFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDemoEnvironment } from "@research-workbench/domain";
import { SkillService } from "./skill-service.js";

const fixture = fileURLToPath(
  new URL(
    "../../../packages/research-skills/fixtures/messy.csv",
    import.meta.url
  )
);
const workspace = await mkdtemp(join(tmpdir(), "research-workbench-"));
await copyFile(fixture, join(workspace, "data.csv"));

const skills = await SkillService.create({ workspaceRoot: workspace });
const environment = createDemoEnvironment();
const scope = {
  projectId: "project-demo",
  questionId: "Q-01",
  taskId: "T-02"
};

const observation = await environment.observe(scope);
process.stdout.write(`Scope: ${observation.summary}\n`);

const available = skills.list();
process.stdout.write(
  `Skills: ${available.map((skill) => `${skill.id}(${skill.status})`).join(", ")}\n`
);

const result = await skills.run("data-profile", {
  scope,
  artifacts: [],
  params: { path: "data.csv" }
});

process.stdout.write(`Result: ${result.summary}\n`);
for (const warning of result.warnings) process.stdout.write(`Warning: ${warning}\n`);
for (const artifact of result.artifacts) {
  process.stdout.write(`Artifact: ${artifact.path}\n`);
  const report = await readFile(join(workspace, artifact.path), "utf8");
  process.stdout.write(`${report}\n`);
}

process.stdout.write(`Workspace: ${workspace}\n`);
