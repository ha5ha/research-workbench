import { join } from "node:path";
import { runPiSpike, type PiSpikeResult } from "@research-workbench/agent-runtime";
import type { ResearchScope } from "@research-workbench/contracts";
import type { SkillService } from "./skill-service.js";

export class AgentSpikeService {
  constructor(
    private readonly skills: SkillService,
    private readonly workspaceRoot: string
  ) {}

  async run(scope: ResearchScope): Promise<PiSpikeResult> {
    return runPiSpike({
      workspace: this.workspaceRoot,
      agentDir: join(this.workspaceRoot, ".research", "agent"),
      tools: {
        profileData: (path) =>
          this.skills.run("data-profile", {
            scope,
            artifacts: [],
            params: { path }
          })
      }
    });
  }
}
