import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile
} from "node:fs/promises";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  posix,
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

export class WorkspaceConflictError extends Error {
  readonly code = "FILE_CONFLICT";
  constructor(
    readonly path: string,
    readonly actualSha256: string | null
  ) {
    super(
      `文件已被其他编辑器或 Agent 修改：${path}。请比较磁盘版本后重新保存。`
    );
    this.name = "WorkspaceConflictError";
  }
}

// All public writers, including separate Agent/UI Gateway instances, share this queue.
const publicWrites = new Map<string, Promise<unknown>>();

const MAX_TEXT_BYTES = 10 * 1024 * 1024;
const PRIVATE_DIRECTORIES = new Set([
  ".research",
  ".git",
  ".agent",
  ".agents",
  ".pi",
  ".ssh",
  ".aws",
  ".codex"
]);

/** One policy for every generic file tool, including Skill reads. */
export function normalizePublicFilePath(path: string): string {
  const portable = path.replace(/\\/g, "/");
  if (!portable || portable.startsWith("/") || /[:\x00-\x1f]/.test(portable))
    throw new WorkspaceAccessError("只接受工作区相对文件路径");
  const normalized = posix.normalize(portable);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../"))
    throw new WorkspaceAccessError("路径越出工作区");
  if (normalized.split("/").some((part) => /[. ]$/.test(part)))
    throw new WorkspaceAccessError("不接受含歧义的文件路径");
  return normalized;
}

function protectedFile(path: string): boolean {
  return path
    .split("/")
    .some(
      (part) =>
        PRIVATE_DIRECTORIES.has(part.toLowerCase()) ||
        /^(\.env(?:\..*)?|credentials(?:\..*)?|id_rsa|id_ed25519)$/i.test(
          part
        ) ||
        /\.(pem|key|p12)$/i.test(part)
    );
}

export class WorkspaceToolGateway implements SkillToolGateway {
  private rootReal: string | undefined;

  constructor(private readonly workspaceRoot: string) {}

  async readText(path: string): Promise<string> {
    return (await this.readVersion(path)).content;
  }

  async readVersion(
    path: string
  ): Promise<{ content: string; sha256: string }> {
    const normalized = await this.publicPath(path);
    const expected = protectedFile(normalized)
      ? await this.artifactIdentity(normalized)
      : undefined;
    const bytes = await this.readBytes(normalized, MAX_TEXT_BYTES);
    if (
      expected &&
      ((expected.size !== undefined && bytes.length !== expected.size) ||
        !createHash("sha256")
          .update(bytes)
          .digest("hex")
          .startsWith(expected.sha256))
    )
      throw new WorkspaceAccessError("受管产物已改变，拒绝读取");
    return {
      content: bytes.toString("utf8"),
      sha256: createHash("sha256").update(bytes).digest("hex")
    };
  }

  /** Inspect existing aliases and parents without creating anything before policy checks. */
  private async publicPath(path: string): Promise<string> {
    const normalized = normalizePublicFilePath(path);
    const root = await this.getRoot();
    const target = await workspacePath(root, normalized);
    return normalizePublicFilePath(toPosix(relative(root, target)));
  }

  private async readBytes(path: string, maxBytes: number): Promise<Buffer> {
    const root = await this.getRoot();
    const target = await workspacePath(root, path);
    const info = await stat(target);
    if (!info.isFile() || info.nlink > 1) {
      throw new WorkspaceAccessError(`不是普通文件：${path}`);
    }
    if (info.size > maxBytes) {
      throw new WorkspaceAccessError(
        `文件超过 ${maxBytes} 字节，请先使用分块读取工具`
      );
    }
    const bytes = await readFile(target);
    if (bytes.length > maxBytes)
      throw new WorkspaceAccessError("文件读取超过限额");
    return bytes;
  }

  private async artifactIdentity(
    path: string
  ): Promise<{ sha256: string; size?: number }> {
    const contentAddressed =
      /^\.research\/artifacts\/[^/]+-([a-f0-9]{12})(?:\.[^/.]+)?$/.exec(path);
    if (contentAddressed) return { sha256: contentAddressed[1]! };
    const managed =
      /^\.research\/jobs\/(job-[a-f0-9-]{36})\/artifacts\/(.+)$/.exec(path);
    if (managed && !protectedFile(managed[2]!)) {
      const manifest = JSON.parse(
        (
          await this.readBytes(
            `.research/jobs/${managed[1]}/manifest.json`,
            1024 * 1024
          )
        ).toString("utf8")
      ) as {
        runId?: unknown;
        artifacts?: Array<{
          path?: unknown;
          status?: unknown;
          sha256?: unknown;
          size?: unknown;
        }>;
      };
      const artifact =
        manifest.runId === managed[1] && Array.isArray(manifest.artifacts)
          ? manifest.artifacts.find(
              (item) => item.path === managed[2] && item.status === "present"
            )
          : undefined;
      if (
        artifact &&
        typeof artifact.sha256 === "string" &&
        /^[a-f0-9]{64}$/.test(artifact.sha256) &&
        typeof artifact.size === "number" &&
        Number.isSafeInteger(artifact.size) &&
        artifact.size >= 0
      )
        return { sha256: artifact.sha256, size: artifact.size };
    }
    throw new WorkspaceAccessError(
      "科研元数据和凭据不可通过文件工具读取；请使用专用服务"
    );
  }

  async writeText(
    path: string,
    content: string,
    expectedSha256?: string | null
  ): Promise<{ path: string; size: number; sha256: string }> {
    const normalized = await this.publicPath(path);
    if (protectedFile(normalized))
      throw new WorkspaceAccessError("科研元数据和凭据必须通过专用服务修改");
    if (Buffer.byteLength(content, "utf8") > 2 * 1024 * 1024) {
      throw new WorkspaceAccessError("写入内容超过 2 MiB 限制");
    }
    const root = await this.getRoot();
    const key =
      process.platform === "win32"
        ? join(root, normalized).toLowerCase()
        : join(root, normalized);
    const prior = publicWrites.get(key) ?? Promise.resolve();
    const operation = prior
      .catch(() => {})
      .then(async () => {
        const real = await atomicWorkspaceWrite(
          root,
          normalized,
          content,
          expectedSha256
        );
        return {
          path: toPosix(relative(root, real)),
          size: Buffer.byteLength(content, "utf8"),
          sha256: createHash("sha256").update(content).digest("hex")
        };
      });
    publicWrites.set(key, operation);
    try {
      return await operation;
    } finally {
      if (publicWrites.get(key) === operation) publicWrites.delete(key);
    }
  }

  async writeArtifact(input: ArtifactWriteInput): Promise<ArtifactRef> {
    const root = await this.getRoot();
    const hash = createHash("sha256").update(input.content).digest("hex");
    const safe = sanitizeName(input.name);
    const extension = extname(safe);
    const stem = extension ? safe.slice(0, -extension.length) : safe;
    const fileName = `${stem}-${hash.slice(0, 12)}${extension}`;
    const fullPath = await atomicWorkspaceWrite(
      root,
      `.research/artifacts/${fileName}`,
      input.content
    );
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

/** Reject links (including Windows junctions) before creating any descendants. */
export async function workspacePath(
  rootPath: string,
  path: string,
  createParents = false
): Promise<string> {
  const root = await realpath(rootPath);
  if (isAbsolute(path) || /^[a-z]:/i.test(path) || path.includes("\0")) {
    throw new WorkspaceAccessError("只接受工作区相对路径");
  }
  const target = resolve(root, path);
  assertWithin(root, target);
  const parts = relative(root, target).split(sep);
  let current = root;
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]!);
    let info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!info && index < parts.length - 1 && createParents) {
      await mkdir(current).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      });
      info = await lstat(current);
    }
    if (info?.isSymbolicLink())
      throw new WorkspaceAccessError("写入路径包含链接或 junction");
    if (info) {
      const actual = await realpath(current);
      assertWithin(root, actual);
      if (index < parts.length - 1 && !info.isDirectory())
        throw new WorkspaceAccessError("父路径不是目录");
      current = actual;
    }
  }
  return current;
}

/** Atomic replacement avoids following an existing target link or hardlink. */
export async function atomicWorkspaceWrite(
  root: string,
  path: string,
  content: string | Uint8Array,
  expectedSha256?: string | null
): Promise<string> {
  const target = await workspacePath(root, path, true);
  const temporary = join(dirname(target), `.rw-write-${randomUUID()}`);
  try {
    await writeFile(temporary, content, { flag: "wx", mode: 0o600 });
    await workspacePath(root, path);
    if (expectedSha256 !== undefined) {
      const actual = await readFile(target).then(
        (bytes) => createHash("sha256").update(bytes).digest("hex"),
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null;
          throw error;
        }
      );
      if (actual !== expectedSha256)
        throw new WorkspaceConflictError(path, actual);
    }
    await rename(temporary, target);
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  return target;
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
