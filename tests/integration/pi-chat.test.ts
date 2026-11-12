import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PiChatRuntime,
  type PiChatStreamEvent
} from "@research-workbench/agent-runtime";
import { authorizeAgentTool } from "../../apps/core/src/agent-tools.js";
import { PermissionService } from "@research-workbench/core";
import type {
  AgentDemoResponse,
  AgentJsonObject,
  AgentToolDefinition
} from "@research-workbench/contracts";

const cleanup: string[] = [];
afterEach(async () => {
  for (const dir of cleanup.splice(0)) {
    if (
      !resolve(dir).startsWith(resolve(tmpdir()) + sep) ||
      !dir.includes("rw-generic-chat-")
    )
      throw new Error("unsafe fixture cleanup");
    await rm(dir, { recursive: true, force: true });
  }
});
async function fixture(
  input: {
    allowed?: boolean;
    arguments?: AgentJsonObject;
    unauthorizedName?: string;
    policyThrows?: boolean;
    useCorePolicy?: boolean;
  } = {}
) {
  const root = await mkdtemp(join(tmpdir(), "rw-generic-chat-"));
  cleanup.push(root);
  let calls = 0;
  const attempted: string[] = [];
  const tools: AgentToolDefinition[] = [
    {
      name: "measure_fixture",
      label: "Measure fixture",
      description: "Measure an owned test fixture.",
      parameters: {
        type: "object",
        properties: { count: { type: "integer", minimum: 1 } },
        required: ["count"]
      },
      execute: async (args) => {
        calls++;
        if (input.useCorePolicy)
          await writeFile(
            join(root, "should-not-exist.txt"),
            "unauthorized write"
          );
        return { content: [{ type: "text", text: JSON.stringify(args) }] };
      }
    }
  ];
  const responses: AgentDemoResponse[] = [
    {
      toolCalls: [
        {
          name: input.unauthorizedName ?? "measure_fixture",
          arguments: input.arguments ?? { count: 3 }
        }
      ]
    },
    { text: "Fixture measured." }
  ];
  const options = {
    workspace: root,
    agentDir: join(root, ".agent"),
    systemPrompt: "Host supplied instructions.",
    tools,
    provider: {
      provider: "openai-compatible" as const,
      baseUrl: "",
      model: "",
      apiKey: ""
    },
    authorizeToolCall: async (name: string) => {
      attempted.push(name);
      if (input.policyThrows) throw new Error("host policy unavailable");
      if (input.useCorePolicy)
        return authorizeAgentTool(
          {
            requestApproval: async () =>
              new PermissionService("read-only").allows(name)
          },
          name,
          {}
        );
      return { allowed: input.allowed !== false, reason: "Denied by host" };
    },
    demoResponses: () => responses
  };
  return {
    root,
    runtime: await PiChatRuntime.create(options),
    options,
    calls: () => calls,
    attempted
  };
}

describe("generic pi chat adapter", () => {
  it("injects arbitrary host tools, streams context and restores the persisted session", async () => {
    const f = await fixture();
    const events: PiChatStreamEvent[] = [];
    let sessionFile: string | null = null;
    try {
      const result = await f.runtime.prompt(
        "measure",
        (event) => events.push(event),
        "host context v1"
      );
      sessionFile = result.sessionFile;
      expect(f.calls()).toBe(1);
      expect(f.attempted).toEqual(["measure_fixture"]);
      expect(result.mode).toBe("faux");
      expect(result.text).toContain("Fixture measured");
      expect(result.systemPrompt).toContain("Host supplied instructions.");
      expect(result.systemPrompt).toContain("host context v1");
      expect(events).toContainEqual({
        type: "tool-end",
        toolCallId: expect.any(String),
        toolName: "measure_fixture",
        isError: false
      });
      expect(events.some((event) => event.type === "delta")).toBe(true);
      expect(await readFile(sessionFile!, "utf8")).toContain("measure_fixture");
    } finally {
      f.runtime.dispose();
    }
    const restored = await PiChatRuntime.create({ ...f.options, sessionFile });
    try {
      expect(restored.sessionFile).toBe(sessionFile);
    } finally {
      restored.dispose();
    }
  });

  it.each(["deny", "invalid-schema", "unregistered", "policy-error"] as const)(
    "does not execute callbacks on %s",
    async (failure) => {
      const f = await fixture({
        allowed: failure !== "deny",
        arguments: failure === "invalid-schema" ? { count: "bad" } : undefined,
        unauthorizedName: failure === "unregistered" ? "bash" : undefined,
        policyThrows: failure === "policy-error"
      });
      const events: PiChatStreamEvent[] = [];
      try {
        await f.runtime
          .prompt("try", (event) => events.push(event))
          .catch((error) =>
            expect(error.message).toContain("host policy unavailable")
          );
        expect(f.calls()).toBe(0);
        if (failure === "unregistered") expect(f.attempted).toEqual([]);
        else
          expect(
            events.some((event) => event.type === "tool-end" && event.isError)
          ).toBe(true);
      } finally {
        f.runtime.dispose();
      }
    }
  );

  it("refuses a future tool registered in the runtime but missing Core effect/permission metadata", async () => {
    const f = await fixture({ useCorePolicy: true });
    try {
      await f.runtime.prompt("try the future write tool", () => {});
      expect(f.attempted).toEqual(["measure_fixture"]);
      expect(f.calls()).toBe(0);
      await expect(
        readFile(join(f.root, "should-not-exist.txt"))
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      f.runtime.dispose();
    }
  });
});
