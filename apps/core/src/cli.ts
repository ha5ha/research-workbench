import { basename } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { createDemoEnvironment } from "@research-workbench/domain";
import { AgentChatService } from "./agent-chat.js";
import { AgentSpikeService } from "./agent-spike.js";
import { ApprovalBroker } from "./approval.js";
import { ExperimentService } from "./experiment-service.js";
import { ExperimentStore } from "./experiment-store.js";
import { FactStore } from "./fact-store.js";
import { GitService } from "./git-service.js";
import { LspService } from "./lsp-service.js";
import { PermissionService } from "./permissions.js";
import { projectIdFromWorkspace } from "./project-id.js";
import { ResearchService } from "./research-service.js";
import { RpcServer } from "./rpc.js";
import { SkillService } from "./skill-service.js";
import { WorkspaceService } from "./workspace-service.js";

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
const environment = createDemoEnvironment({
  projectId: projectIdFromWorkspace(skills.workspaceRoot),
  projectTitle: basename(skills.workspaceRoot) || "当前研究项目",
  facts: []
});
const workspaceService = new WorkspaceService(skills.workspaceRoot);
const experiments = new ExperimentService(skills.workspaceRoot);
const experimentStore = new ExperimentStore(skills.workspaceRoot);
const factStore = new FactStore(experimentStore.database);
const git = new GitService(skills.workspaceRoot, {
  binary: process.env.RW_GIT_BINARY || undefined,
  autoCommit: process.env.RW_AUTO_COMMIT === "1"
});
const lsp = new LspService(skills.workspaceRoot);
const research = new ResearchService(skills.workspaceRoot);
const permissions = new PermissionService(process.env.RW_PERMISSION_LEVEL);
const agent = new AgentSpikeService(skills, skills.workspaceRoot);
let server!: RpcServer;
const approvals = new ApprovalBroker((type, payload) => {
  server.emitEvent(type, payload);
});
const chat = new AgentChatService(
  skills,
  skills.workspaceRoot,
  approvals,
  environment,
  workspaceService,
  experimentStore,
  experiments,
  permissions,
  research,
  factStore
);
server = new RpcServer({
  workspaceRoot: skills.workspaceRoot,
  skills,
  environment,
  agent,
  chat,
  approvals,
  workspace: workspaceService,
  experiments: experimentStore,
  facts: factStore,
  git,
  lsp,
  research,
  permissions,
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

rl.on("line", (line) => {
  void server.handleLine(line).then((output) => {
    if (output) process.stdout.write(`${output}\n`);
  }).catch((error) => {
    process.stderr.write(
      `[core] request failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
  });
});

rl.on("close", () => {
  approvals.dispose();
  experimentStore.close();
  lsp.stop();
});