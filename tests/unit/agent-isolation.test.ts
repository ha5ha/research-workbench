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
  await Promise.all([first, change]);
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
