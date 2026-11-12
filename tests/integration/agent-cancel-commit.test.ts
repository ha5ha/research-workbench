import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { expect, it, vi } from "vitest";
import {
  AgentChatService,
  ApprovalBroker,
  ExperimentService,
  ExperimentStore,
  FactStore,
  GitService,
  PermissionService,
  ResearchService,
  RpcServer,
  SkillService,
  WorkspaceService
} from "@research-workbench/core";
import { ErrorCode, type RpcEvent } from "@research-workbench/contracts";
import { createDemoEnvironment } from "@research-workbench/domain";

it("leaves real Agent writes uncommitted when an SDK turn is aborted after its tool completes", async () => {
  const root = await mkdtemp(join(tmpdir(), "rw-agent-cancel-"));
  let continuationSeen = false;
  const endpoint = createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const input = JSON.parse(body) as {
        model: string;
        messages: Array<{ role: string }>;
      };
      res.writeHead(200, { "content-type": "text/event-stream" });
      const continuation = input.messages.at(-1)?.role === "tool";
      const chunk = (delta: unknown, finish: string | null) =>
        res.write(
          `data: ${JSON.stringify({
            id: "cancel-fixture",
            object: "chat.completion.chunk",
            created: 1,
            model: input.model,
            choices: [{ index: 0, delta, finish_reason: finish }]
          })}\n\n`
        );
      if (continuation) {
        chunk(
          {
            role: "assistant",
            content: "Partial response before cancellation."
          },
          null
        );
        continuationSeen = true;
        return;
      }
      chunk(
        {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: "owned-write",
              type: "function",
              function: {
                name: "write_file",
                arguments: JSON.stringify({
                  path: "owned.txt",
                  content: "Agent edit"
                })
              }
            }
          ]
        },
        null
      );
      chunk({}, "tool_calls");
      res.end("data: [DONE]\n\n");
    });
  });
  let chat: AgentChatService | undefined;
  let store: ExperimentStore | undefined;
  const approvals = new ApprovalBroker(() => {});
  try {
    const git = (args: string[]) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        windowsHide: true
      });
    git(["init", "--quiet"]);
    git(["config", "user.name", "Test"]);
    git(["config", "user.email", "test@example.invalid"]);
    await writeFile(join(root, "owned.txt"), "base");
    git(["add", "owned.txt"]);
    git(["commit", "--quiet", "-m", "fixture"]);
    const gitService = new GitService(root, { autoCommit: true });
    const before = await gitService.head();
    const skills = await SkillService.create({ workspaceRoot: root });
    const workspace = new WorkspaceService(root);
    const permissions = new PermissionService("workspace-write");
    const environment = createDemoEnvironment();
    store = new ExperimentStore(root);
    chat = new AgentChatService(
      skills,
      root,
      approvals,
      environment,
      workspace,
      store,
      new ExperimentService(root),
      permissions,
      new ResearchService(root),
      new FactStore(store.database)
    );
    await new Promise<void>((done) => endpoint.listen(0, "127.0.0.1", done));
    const address = endpoint.address();
    if (!address || typeof address === "string")
      throw new Error("fixture has no port");
    await chat.configureProvider({
      provider: "openai-compatible",
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      model: "fixture",
      apiKey: ""
    });
    const events: RpcEvent[] = [];
    const rpc = new RpcServer({
      workspaceRoot: root,
      skills,
      environment,
      workspace,
      permissions,
      experiments: store,
      chat,
      git: gitService,
      emit: (event) => events.push(event)
    });
    const request = (id: string, method: string, params?: unknown) =>
      rpc.handleLine(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    const turn = request("turn", "agent.chat", {
      prompt: "Edit owned.txt, then continue.",
      scope: { projectId: "fixture" }
    });
    await vi.waitFor(() => expect(continuationSeen).toBe(true), {
      timeout: 10000
    });
    expect(await readFile(join(root, "owned.txt"), "utf8")).toBe("Agent edit");
    const abort = JSON.parse((await request("abort", "agent.abort"))!);
    expect(abort.result).toEqual({ aborted: true });
    const result = JSON.parse((await turn)!);
    expect(result.error?.code).toBe(ErrorCode.SKILL_FAILED);
    expect(result.error?.message).toContain("已中断");
    expect(await gitService.head()).toBe(before);
    expect(
      (await gitService.status()).working.map((file) => file.path)
    ).toContain("owned.txt");
    expect(
      events.some(
        (event) =>
          event.params.type === "git.committed" ||
          event.params.type === "git.auto-commit-failed"
      )
    ).toBe(false);
    expect(
      events.some((event) => event.params.type === "agent.completed")
    ).toBe(false);
  } finally {
    await chat?.abort();
    chat?.dispose();
    approvals.dispose();
    store?.close();
    endpoint.closeAllConnections();
    if (endpoint.listening)
      await new Promise<void>((done) => endpoint.close(() => done()));
    if (
      !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
      !root.includes("rw-agent-cancel-")
    )
      throw new Error("unsafe fixture cleanup");
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 50
    });
  }
}, 20_000);
