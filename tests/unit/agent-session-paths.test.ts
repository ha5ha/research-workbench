import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { AgentSessionStore } from "../../apps/core/src/agent-sessions.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

it("opens only Core-listed opaque IDs and rejects sibling, traversal, extension and link aliases", async () => {
  const root = await mkdtemp(join(tmpdir(), "rw-session-"));
  roots.push(root);
  const dir = join(root, ".research", "agent", "sessions");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "good.jsonl"),
    JSON.stringify({
      type: "message",
      message: { role: "user", content: "hello" }
    })
  );
  const store = new AgentSessionStore(root);
  expect((await store.list())[0]).toMatchObject({
    file: "good",
    id: "good",
    title: "hello"
  });
  expect(await store.read("good")).toEqual([{ role: "user", text: "hello" }]);
  for (const id of [
    "../sessions-sibling/evil",
    join(dir, "good.jsonl"),
    "../good",
    "good.jsonl",
    "..\\good",
    "missing"
  ])
    await expect(store.read(id)).rejects.toThrow();
  const outside = join(root, "outside");
  await mkdir(outside);
  await writeFile(join(outside, "evil.jsonl"), "{}");
  await symlink(
    outside,
    join(dir, "linked"),
    process.platform === "win32" ? "junction" : "dir"
  );
  await expect(store.read("linked/evil")).rejects.toThrow();
  await rm(join(dir, "linked"));
  await rm(dir, { recursive: true });
  await symlink(
    outside,
    dir,
    process.platform === "win32" ? "junction" : "dir"
  );
  await expect(store.read("evil")).rejects.toThrow();
});
