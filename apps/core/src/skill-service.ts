import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { stat } from "node:fs/promises";
import {
  SkillRunInputSchema,
  type SkillManifest,
  type SkillRunInput,
  type SkillRunResult,
  type SkillToolGateway
} from "@research-workbench/contracts";
import {
  SkillRegistry,
  builtInSkills
} from "@research-workbench/research-skills";
import { WorkspaceToolGateway } from "./workspace.js";

const DEFAULT_SKILLS_DIR = fileURLToPath(
  new URL("../../../packages/research-skills/skills", import.meta.url)
);

export class ToolNotAllowedError extends Error {
  readonly code = "TOOL_NOT_ALLOWED";
}

export interface SkillServiceOptions {
  workspaceRoot: string;
  skillsDir?: string;
}

export class SkillService {
  private constructor(
    readonly workspaceRoot: string,
    private readonly registry: SkillRegistry,
    private readonly tools: WorkspaceToolGateway
  ) {}

  static async create(options: SkillServiceOptions): Promise<SkillService> {
    const workspaceRoot = resolve(options.workspaceRoot);
    const info = await stat(workspaceRoot).catch(() => null);
    if (!info?.isDirectory()) {
      throw new Error(`工作区不存在或不是目录：${workspaceRoot}`);
    }
    const registry = await SkillRegistry.load(
      options.skillsDir ?? DEFAULT_SKILLS_DIR,
      builtInSkills
    );
    return new SkillService(
      workspaceRoot,
      registry,
      new WorkspaceToolGateway(workspaceRoot)
    );
  }

  list(): SkillManifest[] {
    return this.registry.list();
  }

  async run(skillId: string, input: SkillRunInput): Promise<SkillRunResult> {
    const parsed = SkillRunInputSchema.parse(input);
    const manifest = this.registry.get(skillId);
    const tools = this.scopedTools(manifest);
    return this.registry.run(skillId, parsed, {
      scope: parsed.scope,
      workspaceRoot: this.workspaceRoot,
      params: parsed.params,
      tools
    });
  }

  private scopedTools(manifest: SkillManifest | undefined): SkillToolGateway {
    const allowed = new Set(manifest?.allowedTools ?? []);
    return {
      readText: allowed.has("fs.read")
        ? (path) => this.tools.readText(path)
        : async () => {
            throw new ToolNotAllowedError("Skill 未声明 fs.read");
          },
      writeArtifact: allowed.has("artifact.write")
        ? (artifact) => this.tools.writeArtifact(artifact)
        : async () => {
            throw new ToolNotAllowedError("Skill 未声明 artifact.write");
          }
    };
  }
}
