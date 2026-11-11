import { link, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  WorkspaceToolGateway,
  atomicWorkspaceWrite
} from "../../apps/core/src/workspace.js";
import { hash } from "../../apps/core/src/run-snapshot.js";

const directories: string[] = [];
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "rw-file-policy-"));
  directories.push(root);
  await atomicWorkspaceWrite(root, ".research/internal.json", "private-token");
  return { root, gateway: new WorkspaceToolGateway(root) };
}
afterEach(async () => {
  for (const root of directories.splice(0)) {
    if (
      !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
      !root.includes("rw-file-policy-")
    )
      throw new Error("unsafe cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

it.each([
  ".research/internal.json",
  "./.research/internal.json",
  "folder/../.research/internal.json",
  "folder\\..\\.research\\internal.json",
  ".RESEARCH/internal.json",
  "./.git/config",
  "folder/../.AGENT/config.json",
  ".pi/extensions/inject.ts",
  "nested/.research/internal.json",
  ".ssh/id_rsa",
  "./.env.local",
  "config/credentials.json",
  "config/token.pem",
  ".research./internal.json",
  "../outside.txt",
  "C:\\private.txt"
])(
  "rejects generic metadata reads and writes after normalization: %s",
  async (path) => {
    const { root, gateway } = await setup();
    await expect(gateway.readText(path)).rejects.toThrow();
    await expect(gateway.writeText(path, "changed")).rejects.toThrow();
    expect(await readFile(join(root, ".research/internal.json"), "utf8")).toBe(
      "private-token"
    );
  }
);

it("normalizes ordinary files and permits content-addressed artifacts only for reads", async () => {
  const { root, gateway } = await setup();
  await gateway.writeText("folder\\..\\notes.txt", "notes");
  expect(await gateway.readText("./folder/../notes.txt")).toBe("notes");
  const artifact = await gateway.writeArtifact({
    name: "profile.json",
    kind: "profile",
    mime: "application/json",
    content: '{"score":3}'
  });
  expect(await gateway.readText(`./${artifact.path}`)).toBe('{"score":3}');
  await expect(gateway.writeText(artifact.path, "overwrite")).rejects.toThrow(
    "专用服务"
  );
  await atomicWorkspaceWrite(root, artifact.path, "tampered");
  await expect(gateway.readText(artifact.path)).rejects.toThrow("已改变");
});

it("reads only manifest-registered, hash-verified Run artifacts", async () => {
  const { root, gateway } = await setup();
  const id = "job-11111111-1111-1111-1111-111111111111";
  const base = `.research/jobs/${id}`;
  const content = '[{"seed":0,"score":3}]';
  const artifactPath = `${base}/artifacts/results/metrics.json`;
  await atomicWorkspaceWrite(root, artifactPath, content);
  await atomicWorkspaceWrite(
    root,
    `${base}/manifest.json`,
    JSON.stringify({
      runId: id,
      artifacts: [
        {
          path: "results/metrics.json",
          status: "present",
          sha256: hash(content),
          size: Buffer.byteLength(content)
        }
      ]
    })
  );
  expect(await gateway.readText(`folder/../${artifactPath}`)).toBe(content);
  await expect(gateway.readText(`${base}/status.json`)).rejects.toThrow(
    "专用服务"
  );
  await expect(gateway.writeText(artifactPath, "changed")).rejects.toThrow(
    "专用服务"
  );
  await atomicWorkspaceWrite(
    root,
    `${base}/artifacts/results/unregistered.json`,
    "private"
  );
  await expect(
    gateway.readText(`${base}/artifacts/results/unregistered.json`)
  ).rejects.toThrow("专用服务");
  await atomicWorkspaceWrite(root, artifactPath, content.replace(":3", ":9"));
  await expect(gateway.readText(artifactPath)).rejects.toThrow("已改变");
});

it("does not expose internal files through junctions or hardlinks", async () => {
  const { root, gateway } = await setup();
  await symlink(
    join(root, ".research"),
    join(root, "visible"),
    process.platform === "win32" ? "junction" : "dir"
  );
  await expect(gateway.readText("visible/internal.json")).rejects.toThrow(
    "链接"
  );
  await link(join(root, ".research/internal.json"), join(root, "visible.json"));
  await expect(gateway.readText("visible.json")).rejects.toThrow("普通文件");
});
