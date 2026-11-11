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
import { MilestoneStore } from "./milestone-store.js";
import { ScheduleStore } from "./schedule-store.js";
import { Scheduler } from "./scheduler.js";
import { buildDigest } from "./digest.js";
import { GitService } from "./git-service.js";
import { LspService } from "./lsp-service.js";
import { PermissionService } from "./permissions.js";
import { projectIdFromWorkspace } from "./project-id.js";
import { ResearchService } from "./research-service.js";
import { RpcServer } from "./rpc.js";
import { SkillService } from "./skill-service.js";
import { WorkspaceService } from "./workspace-service.js";
import { RunStore } from "./run-store.js";
import { RunService } from "./run-service.js";
import { SshExecutor } from "./ssh-executor.js";
import { SshConnections, handleSshPrivateLine } from "./ssh2-transport.js";

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
const milestoneStore = new MilestoneStore(experimentStore.database);
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
const sshConnections = new SshConnections();
const loop = new RunService(
  skills.workspaceRoot,
  new RunStore(experimentStore.database),
  experimentStore,
  permissions,
  (run) => server?.emitEvent("runs.changed", { id: run.id, state: run.state }),
  process.env.RW_GIT_BINARY || "git",
  new SshExecutor(skills.workspaceRoot, sshConnections.transport, (host) =>
    sshConnections.identity(host)
  )
);
skills.setResearchReader(async () => {
  await loop.refreshAll();
  return loop.overview();
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
  factStore,
  loop
);
const scheduleStore = new ScheduleStore(experimentStore.database);
scheduleStore.upsert({
  id: "digest",
  kind: "digest",
  intervalSeconds: 900
});

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
  milestones: milestoneStore,
  schedules: scheduleStore,
  runSchedule: (id) => runDigest(id),
  loop,
  git,
  lsp,
  research,
  permissions,
  emit: (event) => {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  }
});

/** One scheduled check: summarise what is blocking the research loop. */
async function runDigest(scheduleId: string): Promise<void> {
  const schedule = scheduleStore.get(scheduleId);
  const since = schedule?.lastRunAt ? new Date(schedule.lastRunAt) : null;
  const now = new Date();
  const pendingDrafts = experimentStore
    .pendingDraftTaskbooks()
    .map((record) => ({ id: record.id, title: record.title }));
  const proposedFacts = factStore
    .list()
    .filter((fact) => fact.status === "proposed")
    .map((fact) => ({ id: fact.id, statement: fact.statement }));
  const stalledRuns = experimentStore
    .list()
    .filter((record) => record.status === "pending")
    .map((record) => ({
      id: record.id,
      title: record.title,
      ageMinutes: Math.max(
        0,
        Math.round(
          (now.getTime() - new Date(record.startedAt).getTime()) / 60000
        )
      )
    }))
    .filter((record) => record.ageMinutes >= 60);
  const milestones = milestoneStore.list({ limit: 100 });
  const sinceLastRun = {
    milestones: since
      ? milestones.filter((item) => new Date(item.at) > since).length
      : 0,
    archivedRuns: experimentStore
      .list()
      .filter(
        (record) =>
          record.status !== "pending" &&
          record.finishedAt &&
          (!since || new Date(record.finishedAt) > since)
      ).length
  };

  const digest = buildDigest({
    pendingDrafts,
    proposedFacts,
    stalledRuns,
    sinceLastRun
  });
  milestoneStore.record({
    kind: "digest",
    title: digest.title,
    payload: digest
  });
  server.emitEvent("schedule.digest", {
    scheduleId,
    title: digest.title,
    lines: digest.lines,
    actionable: digest.actionable
  });
}

const scheduler = new Scheduler(scheduleStore, (schedule) =>
  runDigest(schedule.id)
);
scheduler.start();
let runCheck: Promise<void> | null = null;
const runTicker = setInterval(() => {
  if (runCheck) return;
  runCheck = loop
    .refreshAll()
    .catch((error) => {
      process.stderr.write(
        `[core] run check failed: ${error instanceof Error ? error.message : "unknown"}\n`
      );
    })
    .finally(() => {
      runCheck = null;
    });
}, 2000);
runTicker.unref();

process.stderr.write(
  `[core] ready workspace=${skills.workspaceRoot} skills=${skills.list().length}\n`
);

const rl = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
  terminal: false
});

const pendingRequests = new Set<Promise<void>>();
rl.on("line", (line) => {
  const work = handleSshPrivateLine(line, sshConnections)
    .then((output) => output ?? server.handleLine(line))
    .then((output) => {
      if (output) process.stdout.write(`${output}\n`);
    })
    .catch((error) => {
      process.stderr.write(
        `[core] request failed: ${error instanceof Error ? error.message : String(error)}\n`
      );
    })
    .finally(() => pendingRequests.delete(work));
  pendingRequests.add(work);
});

rl.on("close", async () => {
  sshConnections.dispose();
  clearInterval(runTicker);
  scheduler.stop();
  approvals.dispose();
  await runCheck;
  await Promise.allSettled(pendingRequests);
  experimentStore.close();
  lsp.stop();
});
