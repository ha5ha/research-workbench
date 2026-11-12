import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { workspacePath } from "./workspace.js";

export class AgentSessionStore {
  constructor(private readonly workspaceRoot: string) {}
  private directory() {
    return join(this.workspaceRoot, ".research", "agent", "sessions");
  }

  async resolveSession(id: string): Promise<string> {
    // Core supplies opaque IDs in both file/id DTO fields. No arbitrary path input.
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("会话 ID 无效");
    const path = await workspacePath(
      this.workspaceRoot,
      `.research/agent/sessions/${id}.jsonl`
    );
    const dir = await realpath(this.directory());
    const actual = await realpath(path);
    const within = relative(dir, actual);
    if (
      !within ||
      isAbsolute(within) ||
      within === ".." ||
      within.startsWith(`..${sep}`) ||
      within.includes(sep)
    )
      throw new Error("会话文件不在当前工作区");
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
      throw new Error("会话必须是独立普通 JSONL 文件");
    return actual;
  }

  async list() {
    // Do not follow a symlinked sessions directory, including parent aliases.
    await workspacePath(this.workspaceRoot, ".research/agent/sessions");
    const entries = await readdir(this.directory(), {
      withFileTypes: true
    }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    const records = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const id = entry.name.slice(0, -6);
      const file = await this.resolveSession(id);
      const info = await lstat(file);
      const messages = await this.read(id);
      records.push({
        file: id,
        id,
        title: (messages.find((item) => item.role === "user")?.text ?? "空会话")
          .replace(/\s+/g, " ")
          .slice(0, 60),
        startedAt: info.mtime.toISOString(),
        size: info.size,
        messages: messages.length
      });
    }
    return records.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async read(
    id: string
  ): Promise<Array<{ role: "user" | "assistant"; text: string }>> {
    const raw = await readFile(await this.resolveSession(id), "utf8");
    const messages: Array<{ role: "user" | "assistant"; text: string }> = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (
        entry?.type !== "message" ||
        !["user", "assistant"].includes(entry.message?.role)
      )
        continue;
      const content = entry.message.content;
      const text =
        typeof content === "string"
          ? content.trim()
          : Array.isArray(content)
            ? content
                .filter(
                  (part) =>
                    part?.type === "text" && typeof part.text === "string"
                )
                .map((part) => part.text)
                .join("\n")
            : "";
      if (text) messages.push({ role: entry.message.role, text });
    }
    return messages;
  }

  idFromFile(file: string): string {
    const within = relative(resolve(this.directory()), resolve(file));
    if (
      !within ||
      isAbsolute(within) ||
      within.includes(sep) ||
      !within.endsWith(".jsonl")
    )
      throw new Error("会话持久化路径无效");
    const id = within.slice(0, -6);
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("会话 ID 无效");
    return id;
  }
}
