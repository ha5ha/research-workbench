import { expect, it } from "vitest";
import type { ContextUsage } from "@research-workbench/contracts";
import { ConversationStore } from "../../apps/desktop/src/renderer/src/chat/conversation-store.js";
import { projectNameFromRoot } from "../../apps/desktop/src/renderer/src/project-selection.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(control: { holdUsage?: boolean; holdSessions?: boolean } = {}) {
  const saved = new Map<string, string>();
  const chats: Array<{
    conversationId: string;
    turnId: string;
    result: ReturnType<typeof deferred<unknown>>;
  }> = [];
  const usages: Array<ReturnType<typeof deferred<ContextUsage | null>>> = [];
  const sessions: Array<
    ReturnType<
      typeof deferred<{ messages: Array<{ role: "assistant"; text: string }> }>
    >
  > = [];
  const restored: string[] = [];
  const api = {
    request: async <T>(method: string, params?: unknown): Promise<T> => {
      if (method === "agent.chat") {
        const result = deferred<unknown>();
        chats.push({
          ...(params as { conversationId: string; turnId: string }),
          result
        });
        return result.promise as Promise<T>;
      }
      if (method === "agent.contextUsage") {
        if (!control.holdUsage) return null as T;
        const result = deferred<ContextUsage | null>();
        usages.push(result);
        return result.promise as Promise<T>;
      }
      if (method === "agent.sessionMessages" && control.holdSessions) {
        const result = deferred<{
          messages: Array<{ role: "assistant"; text: string }>;
        }>();
        sessions.push(result);
        return result.promise as Promise<T>;
      }
      if (method === "agent.restoreSession")
        restored.push((params as { sessionFile: string }).sessionFile);
      return {} as T;
    }
  };
  const store = new ConversationStore(
    {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => {
        saved.set(key, value);
      },
      removeItem: (key) => {
        saved.delete(key);
      }
    },
    api
  );
  return { store, chats, saved, usages, sessions, restored };
}
async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

it("routes A/B events and late results to their original conversation, pairing repeated tools by ID", async () => {
  const { store, chats, saved } = setup();
  const a = store.send("A", "first", "first", { projectId: "P" });
  await flush();
  const b = store.send("B", "second", "second", { projectId: "P" });
  await flush();
  expect(chats).toHaveLength(1);
  const identity = { conversationId: "A", turnId: chats[0]!.turnId };
  store.event({ ...identity, type: "delta", text: "A partial" });
  store.event({
    ...identity,
    type: "tool-start",
    toolName: "read_file",
    toolCallId: "one"
  });
  store.event({
    ...identity,
    type: "tool-start",
    toolName: "read_file",
    toolCallId: "two"
  });
  store.event({
    ...identity,
    type: "tool-end",
    toolName: "read_file",
    toolCallId: "one"
  });
  expect(store.snapshot("A").trace.map((step) => step.status)).toEqual([
    "done",
    "running"
  ]);
  expect(store.snapshot("B").stream).toBe("");
  chats[0]!.result.resolve({
    text: "A answer",
    mode: "faux",
    sessionFile: "a-session"
  });
  await a;
  await flush();
  expect(chats).toHaveLength(2);
  store.event({ ...identity, type: "delta", text: "stale" });
  expect(store.snapshot("A").stream).toBe("");
  chats[1]!.result.resolve({
    text: "B answer",
    mode: "faux",
    sessionFile: "b-session"
  });
  await b;
  expect(store.snapshot("A").messages.at(-1)?.text).toBe("A answer");
  expect(store.snapshot("B").messages.at(-1)?.text).toBe("B answer");
  expect(saved.get("B")).not.toContain("A answer");
});

it("invalidates old turns after starting a new chat", async () => {
  const { store, chats } = setup();
  const a = store.send("A", "old", "old", { projectId: "P" });
  await flush();
  store.reset("A");
  const next = store.send("A", "new", "new", { projectId: "P" });
  chats[0]!.result.resolve({
    text: "late old answer",
    mode: "faux",
    sessionFile: "old-session"
  });
  await a;
  await flush();
  expect(store.snapshot("A").messages).toEqual([{ role: "user", text: "new" }]);
  chats[1]!.result.resolve({
    text: "new answer",
    mode: "faux",
    sessionFile: "new-session"
  });
  await next;
  expect(store.snapshot("A").sessionFile).toBe("new-session");
});

it("displays filesystem percent names without URI decoding", () => {
  for (const name of ["100%", "%E4%", "%20", "实验 %not-uri"])
    expect(projectNameFromRoot(`D:\\projects\\${name}`)).toBe(name);
});

it("drops context usage that arrives after reset and keeps the next runtime owner's usage isolated", async () => {
  const { store, chats, usages } = setup({ holdUsage: true });
  const first = store.send("A", "old", "old", { projectId: "P" });
  await flush();
  chats[0]!.result.resolve({
    text: "old answer",
    mode: "faux",
    sessionFile: "a-session"
  });
  await flush();
  expect(usages).toHaveLength(1);
  store.reset("A");
  const second = store.send("B", "new", "new", { projectId: "P" });
  usages[0]!.resolve({ tokens: 99, percent: 99, contextWindow: 100 });
  await first;
  await flush();
  expect(store.snapshot("A").contextUsage).toBeNull();
  expect(store.snapshot("A").messages).toEqual([]);
  chats[1]!.result.resolve({
    text: "new answer",
    mode: "faux",
    sessionFile: "b-session"
  });
  await flush();
  usages[1]!.resolve({ tokens: 2, percent: 2, contextWindow: 100 });
  await second;
  expect(store.snapshot("B").contextUsage?.tokens).toBe(2);
  expect(store.snapshot("A").contextUsage).toBeNull();
});

it("ignores older history responses after opening another session or starting a new chat", async () => {
  const { store, sessions } = setup({ holdSessions: true });
  const old = store.open("A", "old-session");
  const recent = store.open("A", "recent-session");
  sessions[1]!.resolve({
    messages: [{ role: "assistant", text: "recent history" }]
  });
  expect(await recent).toBe(true);
  sessions[0]!.resolve({
    messages: [{ role: "assistant", text: "late history" }]
  });
  expect(await old).toBe(false);
  expect(store.snapshot("A").sessionFile).toBe("recent-session");
  expect(store.snapshot("A").messages.at(-1)?.text).toBe("recent history");
  const stale = store.open("A", "old-session");
  store.reset("A");
  sessions[2]!.resolve({
    messages: [{ role: "assistant", text: "stale after reset" }]
  });
  expect(await stale).toBe(false);
  expect(store.snapshot("A").messages).toEqual([]);
});

it("serializes compaction with other turns and restores the selected conversation's session first", async () => {
  const { store, chats, restored } = setup();
  const first = store.send("A", "first", "first", { projectId: "P" });
  await flush();
  chats[0]!.result.resolve({
    text: "A answer",
    mode: "faux",
    sessionFile: "a-session"
  });
  await first;
  const second = store.send("B", "second", "second", { projectId: "P" });
  await flush();
  const compact = store.compact("A", "keep evidence");
  await flush();
  expect(restored).toEqual([]);
  chats[1]!.result.resolve({
    text: "B answer",
    mode: "faux",
    sessionFile: "b-session"
  });
  await second;
  await compact;
  expect(restored).toEqual(["a-session"]);
  expect(store.snapshot("B").sessionFile).toBe("b-session");
});
