import { expect, it } from "vitest";
import { AgentOperationQueue } from "../../apps/core/src/agent-operation-queue.js";

it("rejects a concurrent prompt and waits for abort before restoring a session", async () => {
  const queue = new AgentOperationQueue();
  let finish!: () => void;
  const events: string[] = [];
  const first = queue.prompt(async () => {
    events.push("A started");
    await new Promise<void>((done) => {
      finish = done;
    });
    events.push("A finished");
  });
  await Promise.resolve();
  await expect(
    queue.prompt(async () => events.push("B leaked"))
  ).rejects.toThrow("AGENT_BUSY");
  const change = queue.mutate(
    () => {
      events.push("B restored");
    },
    async () => {
      events.push("A aborted");
      finish();
    }
  );
  await expect(first).rejects.toMatchObject({ name: "AbortError" });
  await change;
  expect(events).toEqual([
    "A started",
    "A aborted",
    "A finished",
    "B restored"
  ]);
  await queue.prompt(async () => {
    events.push("B started");
  });
  expect(events.at(-1)).toBe("B started");
});

it("rejects a canceled turn even when the underlying runtime resolves a partial result", async () => {
  const queue = new AgentOperationQueue();
  let finish!: (value: string) => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const turn = queue.prompt(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
        started();
      })
  );
  await ready;
  queue.cancel();
  finish("partial result returned after abort");
  await expect(turn).rejects.toMatchObject({ name: "AbortError" });
  await expect(queue.prompt(async () => "next turn")).resolves.toBe(
    "next turn"
  );
});
