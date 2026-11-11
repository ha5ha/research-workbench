import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  WorkspaceToolGateway,
  atomicWorkspaceWrite,
  workspacePath
} from "../../apps/core/src/workspace.js";
import { executionEnvironment } from "../../apps/core/src/execution-env.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, realpath: vi.fn(actual.realpath) };
});
const actualFs =
  await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
const roots: string[] = [];
afterEach(async () => {
  vi.mocked(realpath).mockImplementation(actualFs.realpath);
  for (const root of roots.splice(0)) {
    if (
      !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
      !root.includes("rw-physical-alias-")
    )
      throw new Error("unsafe cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "rw-physical-alias-"));
  roots.push(root);
  await atomicWorkspaceWrite(root, ".research/internal.json", "private");
  return { root, gateway: new WorkspaceToolGateway(root) };
}

/** Deterministic alias semantics without requiring NTFS short-name generation. */
async function alias(root: string, name: string, actual: string) {
  await mkdir(join(root, name));
  const aliasPath = join(root, name);
  vi.mocked(realpath).mockImplementation(async (path, options) => {
    if (String(path).toLowerCase() === aliasPath.toLowerCase()) return actual;
    return actualFs.realpath(path, options as { encoding?: null | undefined });
  });
}

it("applies private-file policy to the physical target of an existing alias", async () => {
  const { root, gateway } = await setup();
  await alias(root, "shortcut", join(root, ".research"));
  // Populate the lexical fixture too: an implementation checking only that name would allow it.
  await writeFile(join(root, "shortcut/internal.json"), "private");
  expect(await workspacePath(root, "shortcut/internal.json")).toBe(
    join(root, ".research/internal.json")
  );
  await expect(gateway.readText("./shortcut/internal.json")).rejects.toThrow(
    "专用服务"
  );
  await expect(
    gateway.writeText("shortcut/internal.json", "changed")
  ).rejects.toThrow("专用服务");
  expect(await readFile(join(root, ".research/internal.json"), "utf8")).toBe(
    "private"
  );
});

it("resolves the deepest existing parent and rejects private new paths before mkdir", async () => {
  const { root, gateway } = await setup();
  await alias(root, "shortcut", join(root, ".research"));
  await expect(
    gateway.writeText("shortcut/new/deep/file.txt", "changed")
  ).rejects.toThrow("专用服务");
  await expect(stat(join(root, ".research/new"))).rejects.toThrow();
  await expect(stat(join(root, "shortcut/new"))).rejects.toThrow();
});

it("preserves ordinary reads and new writes through a public physical parent", async () => {
  const { root, gateway } = await setup();
  await mkdir(join(root, "source"));
  await alias(root, "shortcut", join(root, "source"));
  await gateway.writeText("shortcut/new/file.txt", "public");
  expect(await gateway.readText("shortcut/new/file.txt")).toBe("public");
  expect(await readFile(join(root, "source/new/file.txt"), "utf8")).toBe(
    "public"
  );
  await expect(stat(join(root, "shortcut/new"))).rejects.toThrow();
});

it("applies the same artifact verification after resolving an alias", async () => {
  const { root, gateway } = await setup();
  const artifact = await gateway.writeArtifact({
    name: "profile.json",
    content: "verified",
    kind: "profile",
    mime: "text/plain"
  });
  await alias(root, "shortcut", join(root, ".research/artifacts"));
  expect(await gateway.readText(`shortcut/${basename(artifact.path)}`)).toBe(
    "verified"
  );
  await expect(
    gateway.writeText(`shortcut/${basename(artifact.path)}`, "overwrite")
  ).rejects.toThrow("专用服务");
  await writeFile(join(root, artifact.path), "changed");
  await expect(
    gateway.readText(`shortcut/${basename(artifact.path)}`)
  ).rejects.toThrow("已改变");
});

it.skipIf(process.platform !== "win32")(
  "blocks an actual NTFS short alias when available",
  async (context) => {
    const { root, gateway } = await setup();
    const result = spawnSync(
      "cmd.exe",
      ["/d", "/c", 'for %I in ("%RW_TEST_ALIAS_PATH%") do @echo %~sI'],
      {
        encoding: "utf8",
        windowsHide: true,
        windowsVerbatimArguments: true,
        env: {
          ...executionEnvironment(root),
          RW_TEST_ALIAS_PATH: join(root, ".research")
        }
      }
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr);
    const short = result.stdout.trim();
    const directory = basename(short);
    if (directory.toLowerCase() === ".research") {
      context.skip();
      return;
    }
    expect(await actualFs.realpath(join(root, directory))).toBe(
      await actualFs.realpath(join(root, ".research"))
    );
    await expect(
      gateway.readText(`${directory}/internal.json`)
    ).rejects.toThrow("专用服务");
    await expect(
      gateway.writeText(`${directory}/new/file.txt`, "changed")
    ).rejects.toThrow("专用服务");
    await expect(stat(join(root, ".research/new"))).rejects.toThrow();
  }
);
