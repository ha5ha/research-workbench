import {
  SkillRunResultSchema,
  type SkillContext,
  type SkillManifest,
  type SkillRunInput,
  type SkillRunResult
} from "@research-workbench/contracts";
import { discoverSkills, type LoadedSkill } from "./manifest.js";

export type SkillImplementation = (
  manifest: SkillManifest,
  input: SkillRunInput,
  context: SkillContext
) => Promise<SkillRunResult>;

export class SkillNotFoundError extends Error {
  code = "SKILL_NOT_FOUND";
}

export class SkillNotRunnableError extends Error {
  code = "SKILL_NOT_RUNNABLE";
}

export class SkillRegistry {
  private constructor(
    private readonly skills: Map<string, LoadedSkill>,
    private readonly implementations: Map<string, SkillImplementation>
  ) {}

  static async load(
    skillsRoot: string,
    implementations: Record<string, SkillImplementation>
  ): Promise<SkillRegistry> {
    const loaded = await discoverSkills(skillsRoot);
    const registry = new Map<string, LoadedSkill>();
    for (const skill of loaded) {
      if (registry.has(skill.manifest.id)) {
        throw new Error(`重复的 skill id：${skill.manifest.id}`);
      }
      registry.set(skill.manifest.id, skill);
    }
    return new SkillRegistry(
      registry,
      new Map(Object.entries(implementations))
    );
  }

  list(): SkillManifest[] {
    return [...this.skills.values()]
      .map((skill) => skill.manifest)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): SkillManifest | undefined {
    return this.skills.get(id)?.manifest;
  }

  async run(
    id: string,
    input: SkillRunInput,
    context: SkillContext
  ): Promise<SkillRunResult> {
    const skill = this.skills.get(id);
    if (!skill) throw new SkillNotFoundError(`未知 skill：${id}`);
    if (skill.manifest.status !== "runnable") {
      throw new SkillNotRunnableError(
        `Skill ${id} 当前状态为 ${skill.manifest.status}，不可执行`
      );
    }
    const implementation = this.implementations.get(id);
    if (!implementation) {
      throw new SkillNotRunnableError(`Skill ${id} 没有执行实现`);
    }
    const result = SkillRunResultSchema.parse(
      await implementation(skill.manifest, input, context)
    );
    if (
      result.skillId !== skill.manifest.id ||
      result.version !== skill.manifest.version
    ) {
      throw new Error(
        `Skill ${id} 返回了不匹配的 id/version：${result.skillId}@${result.version}`
      );
    }
    return result;
  }
}

export type { LoadedSkill };
