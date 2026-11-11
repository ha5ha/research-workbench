import { execFileSync } from "node:child_process";
import { createServer, type ServerResponse } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  AgentChatService,
  ApprovalBroker,
  ExperimentService,
  ExperimentStore,
  FactStore,
  MilestoneStore,
  PermissionService,
  ResearchService,
  RpcServer,
  RunService,
  RunStore,
  SkillService,
  WorkspaceService,
  type AgentCard
} from "@research-workbench/core";
import type { RpcEvent, RunProposal } from "@research-workbench/contracts";
import { createDemoEnvironment } from "@research-workbench/domain";

const cleanup: Array<() => Promise<void>> = [];
const git =
  process.platform === "win32" ? "C:/Program Files/Git/cmd/git.exe" : "git";
const scope = { projectId: "project-demo", questionId: "Q-01", taskId: "T-02" };

afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

interface ToolSchema {
  function: {
    name: string;
    parameters: { properties: Record<string, unknown>; required?: string[] };
  };
}

function reply(res: ServerResponse, model: string, proposal?: RunProposal) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache"
  });
  const chunk = (delta: unknown, finishReason: string | null) => {
    res.write(
      `data: ${JSON.stringify({
        id: "managed-plan-fixture",
        object: "chat.completion.chunk",
        created: 1,
        model,
        choices: [{ index: 0, delta, finish_reason: finishReason }]
      })}\n\n`
    );
  };
  chunk(
    proposal
      ? {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: "request-plan",
              type: "function",
              function: {
                name: "request_run",
                arguments: JSON.stringify(proposal)
              }
            }
          ]
        }
      : { role: "assistant", content: "运行方案已提出，等待研究者审阅。" },
    null
  );
  chunk({}, proposal ? "tool_calls" : "stop");
  res.end("data: [DONE]\n\n");
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "rw-agent-plan-"));
  cleanup.push(async () => {
    if (
      !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
      !root.includes("rw-agent-plan-")
    )
      throw new Error("unsafe fixture cleanup");
    await rm(root, { recursive: true, force: true });
  });
  execFileSync(git, ["init", root], { windowsHide: true, stdio: "ignore" });
  await writeFile(
    join(root, "experiment.py"),
    "print('fixture is never executed')\n"
  );
  execFileSync(git, ["-C", root, "add", "experiment.py"], {
    windowsHide: true
  });
  execFileSync(
    git,
    [
      "-C",
      root,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-qm",
      "fixture"
    ],
    { windowsHide: true }
  );

  const skills = await SkillService.create({ workspaceRoot: root });
  const workspace = new WorkspaceService(root);
  const store = new ExperimentStore(root);
  cleanup.push(async () => store.close());
  const experiment = store.create({
    title: "固定输入 baseline",
    goal: "measure",
    hypothesis: "repeatable",
    design: "one seed",
    metrics: "score",
    seeds: 1
  });
  const permissions = new PermissionService("workspace-write");
  const loop = new RunService(
    root,
    new RunStore(store.database),
    store,
    permissions,
    () => {},
    git
  );
  const proposal: RunProposal = {
    experimentId: experiment.id,
    command: "python3 experiment.py",
    timeoutSeconds: 30,
    maxOutputBytes: 64 * 1024 * 1024,
    inputs: [],
    backend: "ssh",
    host: "fixture-host",
    remoteWorkdir: "/workdir/project/jobs",
    remotePython: "/opt/env/bin/python",
    baselineRunId: "baseline-fixture",
    protocol: {
      name: "fixed/score",
      metric: "score",
      direction: "maximize",
      unit: "",
      dataset: "fixed",
      environment: "fixture",
      seeds: [0],
      metricsPath: "results/metrics.json",
      requiredArtifacts: []
    }
  };
  const advertised: ToolSchema[][] = [];
  const systemPrompts: string[] = [];
  const endpoint = createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const payload = JSON.parse(body) as {
        model: string;
        tools: ToolSchema[];
        messages: Array<{ role: string; content?: string }>;
      };
      advertised.push(payload.tools);
      systemPrompts.push(
        payload.messages
          .filter((message) => message.role === "system")
          .map((message) => message.content ?? "")
          .join("\n")
      );
      reply(
        res,
        payload.model,
        payload.messages.at(-1)?.role === "tool" ? undefined : proposal
      );
    });
  });
  await new Promise<void>((done) => endpoint.listen(0, "127.0.0.1", done));
  cleanup.push(async () => {
    endpoint.closeAllConnections();
    await new Promise<void>((done, reject) =>
      endpoint.close((error) => (error ? reject(error) : done()))
    );
  });
  const address = endpoint.address();
  if (!address || typeof address === "string")
    throw new Error("fixture endpoint has no port");
  const approvals = new ApprovalBroker(() => {});
  const environment = createDemoEnvironment();
  const chat = new AgentChatService(
    skills,
    root,
    approvals,
    environment,
    workspace,
    store,
    new ExperimentService(root),
    permissions,
    new ResearchService(root),
    new FactStore(store.database),
    loop
  );
  chat.configureProvider({
    provider: "openai-compatible",
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    model: "fixture",
    apiKey: ""
  });
  cleanup.push(async () => {
    chat.dispose();
    approvals.dispose();
  });
  const events: RpcEvent[] = [];
  const milestones = new MilestoneStore(store.database);
  const rpc = new RpcServer({
    workspaceRoot: root,
    skills,
    environment,
    workspace,
    experiments: store,
    permissions,
    chat,
    loop,
    milestones,
    emit: (event) => events.push(event)
  });
  return {
    store,
    experiment,
    loop,
    permissions,
    proposal,
    advertised,
    systemPrompts,
    events,
    milestones,
    rpc
  };
}

async function ask(rpc: RpcServer) {
  const response = JSON.parse(
    (await rpc.handleLine(
      JSON.stringify({
        jsonrpc: "2.0",
        id: "chat",
        method: "agent.chat",
        params: { prompt: "Prepare a frozen research run plan.", scope }
      })
    )) ?? "{}"
  );
  expect(response.error).toBeUndefined();
}

it("emits a plan reference through the existing RPC card event and leaves approval to the researcher", async () => {
  const fixture = await setup();
  await ask(fixture.rpc);

  const plans = fixture.loop.overview().plans;
  expect(plans).toHaveLength(1);
  const plan = plans[0]!;
  expect(plan.proposal).toEqual(fixture.proposal);
  expect(plan.approvedAt).toBeNull();
  expect(fixture.store.get(fixture.experiment.id)?.taskbookStatus).toBe(
    "draft"
  );
  expect(fixture.loop.overview().runs).toEqual([]);
  await expect(
    fixture.loop.start(plan.id, "unapproved-fixture")
  ).rejects.toThrow("尚未批准");

  const cardEvents = fixture.events.filter(
    (event) => event.params.type === "agent.card"
  );
  expect(cardEvents).toHaveLength(1);
  expect((cardEvents[0]!.params.payload as { card: AgentCard }).card).toEqual({
    kind: "run_plan",
    planId: plan.id,
    experimentId: fixture.experiment.id,
    title: fixture.experiment.title
  });
  expect(fixture.milestones.list()).toMatchObject([
    {
      kind: "run_plan",
      title: `运行方案：${fixture.experiment.title}`,
      experimentId: fixture.experiment.id
    }
  ]);
  const tools = fixture.advertised[0]!;
  const schema = tools.find((tool) => tool.function.name === "request_run")!
    .function.parameters;
  for (const field of ["remoteWorkdir", "remotePython", "baselineRunId"]) {
    expect(schema.properties).toHaveProperty(field);
    expect(schema.required).not.toContain(field);
  }
  const toolNames = tools.map((tool) => tool.function.name);
  expect(toolNames).not.toContain("runs.approve");
  expect(toolNames).not.toContain("runs.start");
  expect(fixture.systemPrompts[0]).toContain(
    "create_experiment, then request_run"
  );
  expect(fixture.systemPrompts[0]).toContain(
    "NEVER ask for a separate task-book confirmation"
  );
  expect(fixture.systemPrompts[0]).toContain(
    "NEVER execute research compute through run_command"
  );
});

it.each(["read-only", "invalid-remote-directory"])(
  "does not emit a plan card when proposal is rejected: %s",
  async (reason) => {
    const fixture = await setup();
    if (reason === "read-only")
      fixture.permissions.configure({ level: "read-only" });
    else fixture.proposal.remoteWorkdir = "../outside";

    await ask(fixture.rpc);
    expect(fixture.loop.overview().plans).toEqual([]);
    expect(fixture.loop.overview().runs).toEqual([]);
    expect(
      fixture.events.filter((event) => event.params.type === "agent.card")
    ).toEqual([]);
    expect(fixture.milestones.list()).toEqual([]);
    expect(fixture.store.get(fixture.experiment.id)?.taskbookStatus).toBe(
      "draft"
    );
  }
);
