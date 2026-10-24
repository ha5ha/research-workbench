import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { RpcServer, SkillService, WorkspaceService } from "@research-workbench/core";
import type { RpcEvent } from "@research-workbench/contracts";
import { createDemoEnvironment } from "@research-workbench/domain";

const fixture = fileURLToPath(
  new URL(
    "../../packages/research-skills/fixtures/messy.csv",
    import.meta.url
  )
);
const cleanup: string[] = [];
const scope = {
  projectId: "project-demo",
  questionId: "Q-01",
  taskId: "T-02"
};

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function setup(): Promise<{ root: string; server: RpcServer; events: RpcEvent[] }> {
  const root = await mkdtemp(join(tmpdir(), "rw-rpc-"));
  cleanup.push(root);
  await copyFile(fixture, join(root, "data.csv"));
  const skills = await SkillService.create({ workspaceRoot: root });
  const events: RpcEvent[] = [];
  const server = new RpcServer({
    workspaceRoot: root,
    skills,
    environment: createDemoEnvironment(),
    agent: {
      run: async () => ({
        text: "pi spike complete",
        toolNames: ["data_profile"],
        blockedTools: ["dangerous_echo"]
      })
    },
    chat: {
      prompt: async (_prompt, _scope, onEvent) => {
        onEvent({ type: "delta", text: "streamed" });
        onEvent({ type: "completed", text: "streamed" });
        return { text: "streamed", mode: "faux", sessionFile: null };
      }
    },
    approvals: {
      request: async () => true,
      respond: () => true
    },
    workspace: new WorkspaceService(root),
    emit: (event) => events.push(event)
  });
  return { root, server, events };
}

function request(id: string, method: string, params?: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

describe("Core JSON-RPC", () => {
  it("lists skills and runs data-profile with events", async () => {
    const { server, events } = await setup();

    const hello = JSON.parse(
      (await server.handleLine(request("1", "system.hello"))) ?? "{}"
    );
    expect(hello.result.name).toBe("research-workbench-core");

    const listed = JSON.parse(
      (await server.handleLine(request("2", "skills.list"))) ?? "{}"
    );
    expect(
      listed.result.skills.some(
        (skill: { id: string; status: string }) =>
          skill.id === "data-profile" && skill.status === "runnable"
      )
    ).toBe(true);
    expect(
      listed.result.skills.some(
        (skill: { id: string; status: string }) =>
          skill.id === "research-checkpoint" && skill.status === "planned"
      )
    ).toBe(true);

    const run = JSON.parse(
      (await server.handleLine(
        request("3", "skills.run", {
          skillId: "data-profile",
          input: { scope, artifacts: [], params: { path: "data.csv" } }
        })
      )) ?? "{}"
    );
    expect(run.result.status).toBe("succeeded");
    expect(run.result.artifacts).toHaveLength(1);
    expect(events.map((event) => event.params.type)).toEqual([
      "skill.started",
      "artifact.created",
      "skill.completed"
    ]);
    expect(events.map((event) => event.params.seq)).toEqual([1, 2, 3]);
  });

  it("returns a structured workspace denial", async () => {
    const { server } = await setup();
    const result = JSON.parse(
      (await server.handleLine(
        request("4", "skills.run", {
          skillId: "data-profile",
          input: {
            scope,
            artifacts: [],
            params: { path: "../outside.csv" }
          }
        })
      )) ?? "{}"
    );
    expect(result.error.code).toBe(-32001);
    expect(result.error.message).toContain("工作区");
  });

  it("rejects unknown methods", async () => {
    const { server } = await setup();
    const result = JSON.parse(
      (await server.handleLine(request("5", "unknown.method"))) ?? "{}"
    );
    expect(result.error.code).toBe(-32601);
  });

  it("observes the domain environment", async () => {
    const { server } = await setup();
    const result = JSON.parse(
      (await server.handleLine(
        request("6", "domain.observe", { scope })
      )) ?? "{}"
    );
    expect(result.result.scope.projectId).toBe("project-demo");
    expect(result.result.actions.length).toBeGreaterThan(0);
  });

  it("exposes the pi agent spike with lifecycle events", async () => {
    const { server, events } = await setup();
    const result = JSON.parse(
      (await server.handleLine(
        request("7", "agent.spike", { scope })
      )) ?? "{}"
    );
    expect(result.result.toolNames).toContain("data_profile");
    expect(result.result.blockedTools).toContain("dangerous_echo");
    expect(events.map((event) => event.params.type)).toContain("agent.started");
    expect(events.map((event) => event.params.type)).toContain("agent.completed");
  });

  it("streams agent chat deltas over RPC", async () => {
    const { server, events } = await setup();
    const result = JSON.parse(
      (await server.handleLine(
        request("8", "agent.chat", { prompt: "你好", scope })
      )) ?? "{}"
    );
    expect(result.result.text).toBe("streamed");
    expect(events.map((event) => event.params.type)).toContain("agent.delta");
    expect(events.map((event) => event.params.type)).toContain("agent.completed");
  });

  it("accepts approval responses", async () => {
    const { server } = await setup();
    const result = JSON.parse(
      (await server.handleLine(
        request("9", "approval.respond", {
          id: "approval-test",
          approved: true
        })
      )) ?? "{}"
    );
    expect(result.result.ok).toBe(true);
  });

  it("lists, reads and writes workspace files", async () => {
    const { server } = await setup();
    const tree = JSON.parse(
      (await server.handleLine(request("10", "workspace.tree"))) ?? "{}"
    );
    expect(
      tree.result.some(
        (entry: { path: string; type: string }) =>
          entry.path === "data.csv" && entry.type === "file"
      )
    ).toBe(true);

    const read = JSON.parse(
      (await server.handleLine(
        request("11", "workspace.read", { path: "data.csv" })
      )) ?? "{}"
    );
    expect(read.result.content).toContain("sample_id");

    const write = JSON.parse(
      (await server.handleLine(
        request("12", "workspace.write", {
          path: "notes.txt",
          content: "hello workspace"
        })
      )) ?? "{}"
    );
    expect(write.result.path).toBe("notes.txt");  });

  it("runs a terminal command in the workspace", async () => {
    const { server } = await setup();
    const result = JSON.parse(
      (await server.handleLine(
        request("13", "terminal.run", {
          command: "node -e \"console.log('terminal-ok')\""
        })
      )) ?? "{}"
    );
    expect(result.result.stdout).toContain("terminal-ok");
    expect(result.result.exitCode).toBe(0);
  }, 20_000);
});
