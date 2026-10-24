import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  realpath,
  stat,
  writeFile
} from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep
} from "node:path";
import type {
  ArtifactRef,
  ArtifactWriteInput,
  SkillToolGateway
} from "@research-workbench/contracts";

export class WorkspaceAccessError extends Error {
  readonly code = "WORKSPACE_DENIED";

  constructor(message: string) {
    super(message);
    this.name = "WorkspaceAccessError";
  }
}

const MAX_TEXT_BYTES = 10 * 1024 * 1024;

export class WorkspaceToolGateway implements SkillToolGateway {
  private rootReal: string | undefined;

  constructor(private readonly workspaceRoot: string) {}

  async readText(path: string): Promise<string> {
    if (isAbsolute(path)) {
      throw new WorkspaceAccessError("只接受工作区相对路径");
    }
    const root = await this.getRoot();
    const target = resolve(root, path);
    assertWithin(root, target);
    const real = await realpath(target).catch(() => {
      throw new WorkspaceAccessError(`文件不存在：${path}`);
    });
    assertWithin(root, real);
    const info = await stat(real);
    if (!info.isFile()) {
      throw new WorkspaceAccessError(`不是普通文件：${path}`);
    }
    if (info.size > MAX_TEXT_BYTES) {
      throw new WorkspaceAccessError(
        `文件超过 ${MAX_TEXT_BYTES} 字节，请先使用分块读取工具`
      );
    }
    return readFile(real, "utf8");
  }

  async writeText(
    path: string,
    content: string
  ): Promise<{ path: string; size: number; sha256: string }> {
    if (isAbsolute(path)) {
      throw new WorkspaceAccessError("只接受工作区相对路径");
    }
    if (Buffer.byteLength(content, "utf8") > 2 * 1024 * 1024) {
      throw new WorkspaceAccessError("写入内容超过 2 MiB 限制");
    }
    const root = await this.getRoot();
    const target = resolve(root, path);
    assertWithin(root, target);
    const parent = dirname(target);
    await mkdir(parent, { recursive: true });
    const parentReal = await realpath(parent);
    if (parentReal !== root) {
      assertWithin(root, parentReal);
    }
    const fullPath = join(parentReal, basename(target));
    await writeFile(fullPath, content, "utf8");
    const real = await realpath(fullPath);
    assertWithin(root, real);
    const info = await stat(real);
    return {
      path: toPosix(relative(root, real)),
      size: info.size,
      sha256: createHash("sha256").update(content).digest("hex")
    };
  }

  async writeArtifact(input: ArtifactWriteInput): Promise<ArtifactRef> {    const root = await this.getRoot();
    const artifactsDir = join(root, ".research", "artifacts");
    await mkdir(artifactsDir, { recursive: true });

    const hash = createHash("sha256").update(input.content).digest("hex");
    const safe = sanitizeName(input.name);
    const extension = extname(safe);
    const stem = extension ? safe.slice(0, -extension.length) : safe;
    const fileName = `${stem}-${hash.slice(0, 12)}${extension}`;
    const fullPath = join(artifactsDir, fileName);
    await writeFile(fullPath, input.content);
    const info = await stat(fullPath);

    return {
      id: `artifact-${hash.slice(0, 16)}`,
      path: toPosix(relative(root, fullPath)),
      kind: input.kind,
      mime: input.mime,
      sha256: hash,
      size: info.size,
      createdAt: new Date().toISOString()
    };
  }

  private async getRoot(): Promise<string> {
    if (!this.rootReal) {
      this.rootReal = await realpath(this.workspaceRoot);
    }
    return this.rootReal;
  }
}

function assertWithin(root: string, target: string): void {
  const relativePath = relative(root, target);
  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new WorkspaceAccessError("路径越出工作区");
  }
}

function sanitizeName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 96);
  return base.length > 0 ? base : "artifact";
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}
