import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PiChatRuntime } from "@research-workbench/agent-runtime";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe("OpenAI-compatible provider", () => {
  it("streams a reply from a custom /chat/completions endpoint", async () => {
    let receivedModel = "";
    const server: Server = createServer((req, res) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const payload = JSON.parse(body || "{}") as { model?: string };
        receivedModel = payload.model ?? "";
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive"
        });
        res.write(
          `data: ${JSON.stringify({
            id: "chatcmpl-test",
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: payload.model,
            choices: [
              {
                index: 0,
                delta: { role: "assistant", content: "pong" },
                finish_reason: null
              }
            ]
          })}\n\n`
        );
        res.write(
          `data: ${JSON.stringify({
            id: "chatcmpl-test",
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: payload.model,
            choices: [
              { index: 0, delta: {}, finish_reason: "stop" }
            ],
            usage: {
              prompt_tokens: 1,
              completion_tokens: 1,
              total_tokens: 2
            }
          })}\n\n`
        );
        res.write("data: [DONE]\n\n");
        res.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    const root = await mkdtemp(join(tmpdir(), "rw-openai-"));
    cleanup.push(root);

    const runtime = await PiChatRuntime.create({
      workspace: root,
      agentDir: join(root, ".research", "agent"),
      scope: { projectId: "p", questionId: "q", taskId: "t" },
      provider: {
        provider: "openai-compatible",
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        model: "local-test-model",
        apiKey: "test-key"
      },
      tools: {
        profileData: async () => ({
          summary: "",
          warnings: [],
          artifacts: []
        }),
        requestApproval: async () => true,
        recordNote: async () => ({
          id: "a",
          path: "a",
          kind: "note",
          mime: "application/json",
          sha256: "x",
          size: 0,
          createdAt: new Date().toISOString()
        }),
        listFiles: async () => [],
        readFile: async () => "",
        writeFile: async (path) => ({ path, size: 0 }),
        runCommand: async () => ({
          stdout: "",
          stderr: "",
          exitCode: 0,
          timedOut: false
        }),
        createExperiment: async () => ({
          experimentId: "RUN-001",
          taskBookId: "PLAN-001"
        }),
        finishExperiment: async (input) => ({
          experimentId: input.experimentId,
          status: "archived"
        })
      }
    });

    try {
      const result = await runtime.prompt("say pong", () => {});
      expect(result.mode).toBe("openai");
      expect(result.text).toContain("pong");
      expect(receivedModel).toBe("local-test-model");
    } finally {
      runtime.dispose();
      server.close();
    }
  }, 20_000);
});
