import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GitService } from "@research-workbench/core";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe("GitService", () => {
  it("reports changes, diffs, stages and commits", async () => {
    const root = await mkdtemp(join(tmpdir(), "rw-git-"));
    cleanup.push(root);
    const git = (args: string[]) =>
      execFileSync("git", args, { cwd: root, stdio: "pipe" });
    git(["init"]);
    git(["config", "user.email", "test@example.com"]);
    git(["config", "user.name", "Test"]);
    await writeFile(join(root, "a.txt"), "v1\n");
    git(["add", "a.txt"]);
    git(["commit", "-m", "initial"]);

    await writeFile(join(root, "a.txt"), "v2\n");
    const service = new GitService(root);
    const status = await service.status();
    expect(status.available).toBe(true);
    expect(status.working.some((file) => file.path === "a.txt")).toBe(true);

    const diff = await service.diff("a.txt", false);
    expect(diff).toContain("-v1");
    expect(diff).toContain("+v2");

    await service.stage(["a.txt"]);
    const staged = await service.status();
    expect(staged.staged.some((file) => file.path === "a.txt")).toBe(true);

    const result = await service.commit("update a");
    expect(result.commit).toBeTruthy();
    const log = await service.log(5);
    expect(log[0]?.message).toBe("update a");

    service.configure({ binary: "git", autoCommit: true });
    expect(await service.version()).toContain("git version");
    expect(service.isAutoCommitEnabled()).toBe(true);
    await writeFile(join(root, "a.txt"), "v3\n");
    const auto = await service.autoCommit("auto update");
    expect(auto?.commit).toBeTruthy();
    expect((await service.status()).working).toHaveLength(0);
    expect((await service.log(5))[0]?.message).toBe("auto update");
  }, 20_000);
});
