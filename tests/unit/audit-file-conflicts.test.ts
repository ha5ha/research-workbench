import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { WorkspaceService } from "@research-workbench/core";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

it("rejects a stale editor save after an Agent write, preserving both versions", async () => {
  const root = await mkdtemp(join(tmpdir(), "rw-conflict-"));
  roots.push(root);
  await writeFile(join(root, "a.txt"), "A\n");
  const editor = new WorkspaceService(root);
  const agent = new WorkspaceService(root);
  const opened = await editor.read("a.txt");
  await agent.write("a.txt", "B\n");
  await expect(
    editor.write("a.txt", "my draft\n", opened.sha256)
  ).rejects.toMatchObject({ code: "FILE_CONFLICT" });
  expect(await readFile(join(root, "a.txt"), "utf8")).toBe("B\n");
  const refreshed = await editor.read("a.txt");
  await editor.write("a.txt", "my draft\n", refreshed.sha256);
  expect(await readFile(join(root, "a.txt"), "utf8")).toBe("my draft\n");
});

it("serializes compare-and-write across Gateway instances and handles deleted files", async () => {
  const root = await mkdtemp(join(tmpdir(), "rw-conflict-"));
  roots.push(root);
  await writeFile(join(root, "a.txt"), "original");
  const service = new WorkspaceService(root);
  const opened = await service.read("a.txt");
  const results = await Promise.allSettled([
    service.write("a.txt", "one", opened.sha256),
    new WorkspaceService(root).write("a.txt", "two", opened.sha256)
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled")
  ).toHaveLength(1);
  await rm(join(root, "a.txt"));
  await expect(
    service.write("a.txt", "stale", opened.sha256)
  ).rejects.toMatchObject({ code: "FILE_CONFLICT" });
  await service.write("a.txt", "new", null);
  await expect(service.write("a.txt", "replace", null)).rejects.toMatchObject({
    code: "FILE_CONFLICT"
  });
});
