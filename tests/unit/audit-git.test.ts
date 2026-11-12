import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  link,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  unlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, expect, it } from "vitest";
import { GitService } from "@research-workbench/core";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0).reverse()) {
    if (
      !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
      !root.includes("rw-audit-git-")
    )
      throw new Error("unsafe fixture cleanup");
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 50
    });
  }
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "rw-audit-git-"));
  roots.push(root);
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git(["init"]);
  git(["config", "user.name", "Test"]);
  git(["config", "user.email", "test@example.com"]);
  await writeFile(join(root, "owned.txt"), "base");
  await writeFile(join(root, "unrelated.txt"), "base");
  git(["add", "."]);
  git(["commit", "-m", "initial"]);
  return { root, git, service: new GitService(root, { autoCommit: true }) };
}
const write = (path: string, content: string) => ({
  path,
  sha256: createHash("sha256").update(content).digest("hex")
});

it("commits only proven Agent writes and preserves unrelated staged/working changes", async () => {
  const { root, git, service } = await fixture();
  await writeFile(join(root, "unrelated.txt"), "user staged");
  git(["add", "unrelated.txt"]);
  await writeFile(join(root, "draft.txt"), "user draft");
  const before = await service.status();
  await writeFile(join(root, "owned.txt"), "agent");
  expect(
    await service.autoCommit("agent", {
      before,
      transaction: { commandsRan: false, writes: [write("owned.txt", "agent")] }
    })
  ).not.toBeNull();
  expect(git(["show", "--pretty=", "--name-only", "HEAD"]).trim()).toBe(
    "owned.txt"
  );
  expect(git(["diff", "--cached", "--name-only"]).trim()).toBe("unrelated.txt");
  expect(await readFile(join(root, "draft.txt"), "utf8")).toBe("user draft");
});

it("does not commit unowned, preexisting, changed-after-write, or shell changes", async () => {
  const { root, service } = await fixture();
  const head = await service.head();
  await writeFile(join(root, "owned.txt"), "user draft");
  const before = await service.status();
  await writeFile(join(root, "owned.txt"), "agent on dirty file");
  expect(
    await service.autoCommit("skip", {
      before,
      transaction: {
        commandsRan: false,
        writes: [write("owned.txt", "agent on dirty file")]
      }
    })
  ).toBeNull();
  expect(await service.autoCommit("no ownership")).toBeNull();
  expect(
    await service.autoCommit("shell", {
      before,
      transaction: { commandsRan: true, writes: [] }
    })
  ).toBeNull();
  expect(await service.head()).toBe(head);
});

it("leaves a later external edit and newly staged owned path for human review", async () => {
  const { root, git, service } = await fixture();
  const before = await service.status();
  await writeFile(join(root, "owned.txt"), "external edit after agent write");
  expect(
    await service.autoCommit("skip", {
      before,
      transaction: { commandsRan: false, writes: [write("owned.txt", "agent")] }
    })
  ).toBeNull();
  await writeFile(join(root, "owned.txt"), "agent");
  git(["add", "owned.txt"]);
  expect(
    await service.autoCommit("skip", {
      before,
      transaction: { commandsRan: false, writes: [write("owned.txt", "agent")] }
    })
  ).toBeNull();
  expect(git(["diff", "--cached", "--name-only"]).trim()).toBe("owned.txt");
});

it("uses idempotent local excludes without touching the project's gitignore", async () => {
  const { root, service } = await fixture();
  await writeFile(join(root, ".gitignore"), "# user's rules\ncustom/\n");
  await service.ensureInternalExcludes();
  const exclude = await readFile(join(root, ".git", "info", "exclude"), "utf8");
  await service.ensureInternalExcludes();
  expect(await readFile(join(root, ".git", "info", "exclude"), "utf8")).toBe(
    exclude
  );
  expect(exclude).toContain("/.research/");
  expect(await readFile(join(root, ".gitignore"), "utf8")).toBe(
    "# user's rules\ncustom/\n"
  );
  const other = await mkdtemp(join(tmpdir(), "rw-audit-git-"));
  roots.push(other);
  expect(
    (await new GitService(other).ensureInternalExcludes()).configured
  ).toBe(false);
  await expect(readFile(join(other, ".gitignore"))).rejects.toThrow();
});

it("refuses a hard-linked exclude file and a linked metadata directory without changing the destination", async () => {
  const { root, service } = await fixture();
  const outside = await mkdtemp(join(tmpdir(), "rw-audit-git-outside-"));
  roots.push(outside);
  const target = join(outside, "exclude");
  await writeFile(target, "# untouched\n");
  const exclude = join(root, ".git", "info", "exclude");
  await unlink(exclude);
  await link(target, exclude);
  await expect(service.ensureInternalExcludes()).rejects.toThrow(
    /普通文件|链接/
  );
  expect(await readFile(target, "utf8")).toBe("# untouched\n");
  await unlink(exclude);
  await rename(join(root, ".git", "info"), join(root, ".git", "info-original"));
  await symlink(
    outside,
    join(root, ".git", "info"),
    process.platform === "win32" ? "junction" : "dir"
  );
  await expect(service.ensureInternalExcludes()).rejects.toThrow(/工作区|链接/);
  expect(await readFile(target, "utf8")).toBe("# untouched\n");
  await unlink(join(root, ".git", "info"));
});

it("leaves external linked-worktree metadata and tracked ignore rules unchanged", async () => {
  const { root, git } = await fixture();
  const worktree = join(root, "..", `${root.split(/[\\/]/).at(-1)}-linked`);
  roots.push(worktree);
  git(["worktree", "add", "--detach", worktree, "HEAD"]);
  const exclude = join(root, ".git", "info", "exclude");
  const original = await readFile(exclude, "utf8");
  const result = await new GitService(worktree).ensureInternalExcludes();
  expect(result).toMatchObject({ configured: false });
  expect(result.reason).toContain("工作区外");
  expect(await readFile(exclude, "utf8")).toBe(original);
  await expect(readFile(join(worktree, ".gitignore"))).rejects.toMatchObject({
    code: "ENOENT"
  });
});

it("reports a read-only metadata directory and preserves its contents", async () => {
  const { root, service } = await fixture();
  const info = join(root, ".git", "info");
  const exclude = join(info, "exclude");
  const original = await readFile(exclude, "utf8");
  await chmod(process.platform === "win32" ? exclude : info, 0o555);
  try {
    await expect(service.ensureInternalExcludes()).rejects.toThrow();
    expect(await readFile(exclude, "utf8")).toBe(original);
  } finally {
    await chmod(process.platform === "win32" ? exclude : info, 0o755);
  }
});
