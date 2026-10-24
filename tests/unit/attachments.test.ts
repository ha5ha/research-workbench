import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importAttachments } from "../../apps/desktop/src/main/attachments.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe("importAttachments", () => {
  it("copies files into workspace uploads and returns relative paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "rw-attach-"));
    cleanup.push(root);
    const source = join(root, "paper notes.txt");
    await writeFile(source, "hello research", "utf8");

    const files = await importAttachments(root, [source]);
    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe("paper notes.txt");
    expect(files[0]?.path.startsWith("uploads/")).toBe(true);
    expect(
      await readFile(join(root, files[0]!.path), "utf8")
    ).toBe("hello research");
  });
});
