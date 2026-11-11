import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { open, readFile, stat } from "node:fs/promises";
import { relative } from "node:path";
import type {
  FrozenFileContent,
  SnapshotFile
} from "@research-workbench/contracts";
import { atomicWorkspaceWrite, workspacePath } from "./workspace.js";
import { executionEnvironment } from "./execution-env.js";

const exec = promisify(execFile);
const MAX_REVIEW_BYTES = 128 * 1024;
export function hash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function assertSnapshotPath(path: string): void {
  if (
    !path ||
    /[\\:\x00-\x1f]/.test(path) ||
    path.startsWith("/") ||
    path
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          /[. ]$/.test(part) ||
          /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(part) ||
          [".git", ".research", ".agent", ".ssh", "node_modules"].includes(
            part.toLowerCase()
          )
      ) ||
    /(^|\/)(\.env(?:\..*)?|credentials(?:\..*)?|id_rsa|id_ed25519)$/i.test(
      path
    ) ||
    /\.(pem|key|p12)$/i.test(path)
  ) {
    throw new Error(`快照路径不允许：${path}`);
  }
}

export class RunSnapshot {
  constructor(
    private readonly root: string,
    private readonly git = "git"
  ) {}
  private async gitCommand(args: string[]): Promise<Buffer> {
    const result = await exec(this.git, ["-C", this.root, ...args], {
      encoding: "buffer",
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
      env: executionEnvironment(this.root)
    });
    return result.stdout;
  }
  async create(
    planId: string,
    inputs: string[]
  ): Promise<{
    revision: string;
    files: SnapshotFile[];
    codeHash: string;
    inputHash: string;
    environmentHash: string;
  }> {
    const top = (await this.gitCommand(["rev-parse", "--show-toplevel"]))
      .toString()
      .trim();
    if (relative(this.root, top) !== "")
      throw new Error("受管运行需要工作区根目录本身是 Git 仓库");
    const revision = (await this.gitCommand(["rev-parse", "HEAD"]))
      .toString()
      .trim();
    if (!/^[a-f0-9]{40,64}$/.test(revision))
      throw new Error("无法冻结代码 revision");
    const listing = (await this.gitCommand(["ls-tree", "-rz", revision]))
      .toString()
      .split("\0")
      .filter(Boolean);
    if (listing.length > 2000)
      throw new Error("代码快照超过 2000 文件，请缩小研究项目");
    const files: SnapshotFile[] = [];
    let bytes = 0;
    for (const entry of listing) {
      const match = /^(\d+) blob [a-f0-9]+\t([\s\S]+)$/.exec(entry);
      if (!match || !["100644", "100755"].includes(match[1]!))
        throw new Error("快照不接受符号链接或 Git 子模块");
      const path = match[2]!;
      assertSnapshotPath(path);
      const content = await this.gitCommand(["show", `${revision}:${path}`]);
      bytes += content.length;
      if (bytes > 128 * 1024 * 1024)
        throw new Error("代码快照超过 128 MiB 限额");
      await atomicWorkspaceWrite(
        this.root,
        `.research/plans/${planId}/source/${path}`,
        content
      );
      files.push({
        path,
        size: content.length,
        sha256: hash(content),
        executable: match[1] === "100755"
      });
    }
    const codeHash = hash(canonical(files));
    const data: SnapshotFile[] = [];
    for (const path of [...new Set(inputs)].sort()) {
      assertSnapshotPath(path);
      if (files.some((file) => file.path === path))
        throw new Error("输入路径不能覆盖冻结代码；请将数据与代码分开");
      const full = await workspacePath(this.root, path);
      const info = await stat(full);
      bytes += info.size;
      if (!info.isFile() || bytes > 256 * 1024 * 1024)
        throw new Error("输入不是普通文件或快照超过 256 MiB");
      const content = await readFile(full);
      await atomicWorkspaceWrite(
        this.root,
        `.research/plans/${planId}/source/${path}`,
        content
      );
      const file = { path, size: content.length, sha256: hash(content) };
      files.push(file);
      data.push(file);
    }
    const locks = files.filter((file) =>
      /(^|\/)(requirements.*\.txt|uv.lock|poetry.lock|package-lock.json|pnpm-lock.yaml|environment.yml)$/.test(
        file.path
      )
    );
    return {
      revision,
      files,
      codeHash,
      inputHash: hash(canonical(data)),
      environmentHash: hash(
        canonical({
          platform: process.platform,
          arch: process.arch,
          node: process.versions.node,
          locks
        })
      )
    };
  }
  async verify(planId: string, files: SnapshotFile[]): Promise<void> {
    for (const file of files) {
      const full = await workspacePath(
        this.root,
        `.research/plans/${planId}/source/${file.path}`
      );
      if (hash(await readFile(full)) !== file.sha256)
        throw new Error(`冻结快照已改变：${file.path}`);
    }
  }
  async readText(
    planId: string,
    files: SnapshotFile[],
    path: string
  ): Promise<FrozenFileContent> {
    if (!/^[a-z0-9][a-z0-9-]{0,99}$/i.test(planId))
      throw new Error("无效冻结方案标识");
    assertSnapshotPath(path);
    const entry = files.find((file) => file.path === path);
    if (!entry) throw new Error("文件不在此方案的冻结清单中");
    if (entry.size > MAX_REVIEW_BYTES)
      throw new Error("冻结文件超过 128 KiB，只支持完整的小型文本审阅");
    // Resolve only the plan snapshot, never the current working tree or a caller-provided root.
    const full = await workspacePath(
      this.root,
      `.research/plans/${planId}/source/${entry.path}`
    );
    const handle = await open(full, "r");
    try {
      const info = await handle.stat();
      if (!info.isFile()) throw new Error("冻结文件不是普通文件");
      if (info.size > MAX_REVIEW_BYTES)
        throw new Error("冻结文件超过 128 KiB，只支持完整的小型文本审阅");
      const buffer = Buffer.alloc(MAX_REVIEW_BYTES + 1);
      let size = 0;
      while (size < buffer.length) {
        const { bytesRead } = await handle.read(
          buffer,
          size,
          buffer.length - size,
          size
        );
        if (!bytesRead) break;
        size += bytesRead;
      }
      const content = buffer.subarray(0, size);
      if (size !== entry.size || hash(content) !== entry.sha256)
        throw new Error("冻结快照已改变，请重新提议方案后审阅");
      let text: string;
      try {
        text = new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true
        }).decode(content);
      } catch {
        throw new Error("冻结文件不是有效的 UTF-8 文本，不能在此预览");
      }
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))
        throw new Error("冻结文件包含二进制控制字符，不能在此预览");
      return {
        planId,
        path: entry.path,
        sha256: entry.sha256,
        size,
        content: text
      };
    } finally {
      await handle.close();
    }
  }
}
