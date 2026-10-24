import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ExperimentService } from "@research-workbench/core";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe("experiment change tracking", () => {
  it("records changed files with before/after diff", async () => {
    const root = await mkdtemp(join(tmpdir(), "rw-experiment-"));
    cleanup.push(root);
    await writeFile(join(root, "analysis.py"), "print('v1')\n");
    const service = new ExperimentService(root);

    const session = await service.begin("terminal", "修改 analysis.py");
    await writeFile(join(root, "analysis.py"), "print('v2')\nprint('extra')\n");
    await writeFile(join(root, "notes.md"), "# result\n");
    const record = await service.finish(session);

    expect(record.fileCount).toBe(2);
    expect(record.additions).toBeGreaterThan(0);
    const analysis = record.files.find((file) => file.path === "analysis.py");
    expect(analysis?.status).toBe("modified");
    expect(analysis?.diff).toContain("-print('v1')");
    expect(analysis?.diff).toContain("+print('v2')");
    expect(record.files.find((file) => file.path === "notes.md")?.status).toBe(
      "added"
    );

    const list = await service.list();
    expect(list[0]?.id).toBe(record.id);
    const loaded = await service.get(record.id);
    expect(loaded?.files).toHaveLength(2);
  });
});
