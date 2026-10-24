import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PiChatRuntime,
  type PiChatStreamEvent
} from "@research-workbench/agent-runtime";

const scope = {
  projectId: "project-real",
  questionId: "Q-01",
  taskId: "T-02"
};
const cleanup: string[] = [];
const realTest =
  process.env.DEEPSEEK_API_KEY && process.env.RUN_REAL_AGENT === "1"
    ? it
    : it.skip;

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe("pi chat runtime (real provider)", () => {
  realTest(
    "streams a real DeepSeek reply",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "rw-chat-real-"));
      cleanup.push(root);
      const runtime = await PiChatRuntime.create({
        workspace: root,
        agentDir: join(root, ".agent"),
        scope,
        tools: {
          profileData: async () => ({
            summary: "not used",
            warnings: [],
            artifacts: []
          }),
          requestApproval: async () => true,
          recordNote: async () => ({
            id: "artifact-note",
            path: ".research/artifacts/note.json",
            kind: "research-note",
            mime: "application/json",
            sha256: "0".repeat(64),
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
          })
        }
      });

      try {
        const events: PiChatStreamEvent[] = [];
        const result = await runtime.prompt(
          "只回复这四个字：连接成功",
          (event) => events.push(event)
        );
        expect(result.mode).toBe("deepseek");
        expect(result.text.length).toBeGreaterThan(0);
        expect(result.sessionFile).toBeTruthy();
        expect(events.some((event) => event.type === "delta")).toBe(true);
      } finally {
        runtime.dispose();
      }
    },
    60_000
  );
});
