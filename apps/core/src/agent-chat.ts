import { join } from "node:path";
import {
  PiChatRuntime,
  type PiChatStreamEvent
} from "@research-workbench/agent-runtime";
import type { ResearchScope } from "@research-workbench/contracts";
import type { SkillService } from "./skill-service.js";

export interface AgentChatResult {
  text: string;
  mode: "faux" | "deepseek";
  sessionFile: string | null;
}

export class AgentChatService {
  private runtime: PiChatRuntime | null = null;
  private runtimeScope = "";

  constructor(
    private readonly skills: SkillService,
    private readonly workspaceRoot: string
  ) {}

  async prompt(
    prompt: string,
    scope: ResearchScope,
    onEvent: (event: PiChatStreamEvent) => void
  ): Promise<AgentChatResult> {
    await this.ensureRuntime(scope);
    const result = await this.runtime!.prompt(prompt, onEvent);
    return result;
  }

  dispose(): void {
    this.runtime?.dispose();
    this.runtime = null;
    this.runtimeScope = "";
  }

  private async ensureRuntime(scope: ResearchScope): Promise<void> {
    const key = JSON.stringify(scope);
    if (this.runtime && this.runtimeScope === key) return;
    this.dispose();
    this.runtime = await PiChatRuntime.create({
      workspace: this.workspaceRoot,
      agentDir: join(this.workspaceRoot, ".research", "agent"),
      scope,
      tools: {
        profileData: (path) =>
          this.skills.run("data-profile", {
            scope,
            artifacts: [],
            params: { path }
          })
      }
    });
    this.runtimeScope = key;
  }
}
