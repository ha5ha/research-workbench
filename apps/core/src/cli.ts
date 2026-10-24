import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { createDemoEnvironment } from "@research-workbench/domain";
import { AgentSpikeService } from "./agent-spike.js";
import { RpcServer } from "./rpc.js";
import { SkillService } from "./skill-service.js";

const { values } = parseArgs({
  options: {
    workspace: { type: "string", short: "w" },
    "skills-dir": { type: "string" },
    help: { type: "boolean", short: "h" }
  },
  allowPositionals: false
});

if (values.help) {
  process.stderr.write(
    "Usage: tsx src/cli.ts --workspace <dir> [--skills-dir <dir>]\n"
  );
  process.exit(0);
}

const workspaceRoot = values.workspace ?? process.cwd();
const skills = await SkillService.create({
  workspaceRoot,
  skillsDir: values["skills-dir"]
});
const environment = createDemoEnvironment();
const agent = new AgentSpikeService(skills, skills.workspaceRoot);
const server = new RpcServer({
  workspaceRoot: skills.workspaceRoot,
  skills,
  environment,
  agent,
  emit: (event) => {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  }
});

process.stderr.write(
  `[core] ready workspace=${skills.workspaceRoot} skills=${skills.list().length}\n`
);

const rl = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
  terminal: false
});

for await (const line of rl) {
  const output = await server.handleLine(line);
  if (output) process.stdout.write(`${output}\n`);
}

process.exit(0);
