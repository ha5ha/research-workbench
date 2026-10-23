import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  SkillManifestSchema,
  type SkillManifest
} from "@research-workbench/contracts";

export class SkillManifestError extends Error {
  constructor(
    message: string,
    readonly skillDir: string
  ) {
    super(message);
    this.name = "SkillManifestError";
  }
}

export interface LoadedSkill {
  manifest: SkillManifest;
  body: string;
  dir: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export async function loadSkill(skillDir: string): Promise<LoadedSkill> {
  const skillFile = join(skillDir, "SKILL.md");
  const source = await readFile(skillFile, "utf8");
  const match = source.match(FRONTMATTER);
  if (!match) {
    throw new SkillManifestError("SKILL.md 缺少 YAML frontmatter", skillDir);
  }

  const raw = parseYaml(match[1] ?? "") as Record<string, unknown>;
  const name = requireString(raw.name, "name", skillDir);
  const description = requireString(raw.description, "description", skillDir);
  const version = requireString(raw.version, "version", skillDir);
  const lastReviewed = requireString(
    raw["last-reviewed"],
    "last-reviewed",
    skillDir
  );
  const allowedTools = Array.isArray(raw["allowed-tools"])
    ? raw["allowed-tools"].map((value) => String(value))
    : [];
  const status = raw.status === undefined ? "runnable" : String(raw.status);

  const manifest = SkillManifestSchema.parse({
    id: name,
    name,
    description,
    version,
    lastReviewed,
    allowedTools,
    status,
    path: skillDir
  });

  return {
    manifest,
    body: match[2] ?? "",
    dir: skillDir
  };
}

export async function discoverSkills(root: string): Promise<LoadedSkill[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const skills: LoadedSkill[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    try {
      const info = await stat(join(dir, "SKILL.md"));
      if (!info.isFile()) continue;
    } catch {
      continue;
    }
    skills.push(await loadSkill(dir));
  }

  return skills;
}

function requireString(
  value: unknown,
  field: string,
  skillDir: string
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SkillManifestError(`SKILL.md 缺少 ${field}`, skillDir);
  }
  return value.trim();
}
