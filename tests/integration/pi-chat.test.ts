import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  PiChatRuntime,
  type PiChatStreamEvent
} from "@research-workbench/agent-runtime";
import { SkillService } from "@research-workbench/core";

const fixture = fileURLToPath(
  new URL(
    "../../packages/research-skills/fixtures/messy.csv",
    import.meta.url
  )
);
const scope = {
  projectId: "project-demo",
  questionId: "Q-01",
  taskId: "T-02"
};
const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe("pi chat runtime", () => {
  it("streams a faux tool loop and persists the session", async () => {
    const root = await mkdtemp(join(tmpdir(), "rw-chat-"));
    cleanup.push(root);
    await copyFile(fixture, join(root, "data.csv"));
    const skills = await SkillService.create({ workspaceRoot: root });
    const runtime = await PiChatRuntime.create({
      workspace: root,
      agentDir: join(root, ".agent"),
      scope,
      tools: {
        profileData: (path) =>
          skills.run("data-profile", {
            scope,
            artifacts: [],
            params: { path }
          }),
        requestApproval: async () => true,
        recordNote: async ({ note }) => ({
          id: "artifact-note",
          path: ".research/artifacts/note.json",
          kind: "research-note",
          mime: "application/json",
          sha256: "0".repeat(64),
          size: note.length,
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
        "画像 data.csv",
        (event) => {
          events.push(event);
        },
        "Observation: 6 rows; Artifacts: 0"
      );

      expect(result.mode).toBe("faux");
      expect(result.text).toContain("数据画像已完成");
      expect(result.systemPrompt).toContain("Observation: 6 rows");
      expect(result.sessionFile).toBeTruthy();
      expect(events.some((event) => event.type === "started")).toBe(true);
      expect(
        events.some(
          (event) =>
            event.type === "tool-start" && event.toolName === "data_profile"
        )
      ).toBe(true);
      expect(events.some((event) => event.type === "delta")).toBe(true);
      expect(events.some((event) => event.type === "completed")).toBe(true);
    } finally {
      runtime.dispose();
    }
  }, 20_000);

  it("waits for approval before recording a note", async () => {
    const root = await mkdtemp(join(tmpdir(), "rw-chat-approval-"));
    cleanup.push(root);
    await copyFile(fixture, join(root, "data.csv"));
    const skills = await SkillService.create({ workspaceRoot: root });
    let approvalCalls = 0;
    let noteCalls = 0;
    const runtime = await PiChatRuntime.create({
      workspace: root,
      agentDir: join(root, ".agent"),
      scope,
      tools: {
        profileData: (path) =>
          skills.run("data-profile", {
            scope,
            artifacts: [],
            params: { path }
          }),
        requestApproval: async () => {
          approvalCalls += 1;
          return true;
        },
        recordNote: async ({ note }) => {
          noteCalls += 1;
          return {
            id: "artifact-note",
            path: ".research/artifacts/research-note.json",
            kind: "research-note",
            mime: "application/json",
            sha256: "0".repeat(64),
            size: note.length,
            createdAt: new Date().toISOString()
          };
        },
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
        "请记录笔记：数据画像不能证明数据科学有效。",
        (event) => events.push(event),
        "Observation: approval test"
      );

      expect(approvalCalls).toBe(1);
      expect(noteCalls).toBe(1);
      expect(result.text).toContain("研究笔记已记录");
      expect(
        events.some(
          (event) =>
            event.type === "tool-start" && event.toolName === "record_note"
        )
      ).toBe(true);
    } finally {
      runtime.dispose();
    }
  }, 20_000);
});
