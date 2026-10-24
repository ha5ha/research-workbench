import { join } from "node:path";
import {
  PiChatRuntime,
  type PiChatStreamEvent
} from "@research-workbench/agent-runtime";
import type {
  ResearchEnvironment,
  ResearchScope
} from "@research-workbench/contracts";
import type { ApprovalBroker } from "./approval.js";
import type { SkillService } from "./skill-service.js";
import type { WorkspaceService } from "./workspace-service.js";
import { WorkspaceToolGateway } from "./workspace.js";

export interface AgentChatResult {
  text: string;
  mode: "faux" | "deepseek";
  sessionFile: string | null;
}

export class AgentChatService {
  private runtime: PiChatRuntime | null = null;
  private runtimeScope = "";
  private readonly gateway: WorkspaceToolGateway;

  constructor(
    private readonly skills: SkillService,
    private readonly workspaceRoot: string,
    private readonly approvals: ApprovalBroker,
    private readonly environment: ResearchEnvironment,
    private readonly workspace: WorkspaceService
  ) {
    this.gateway = new WorkspaceToolGateway(workspaceRoot);
  }

  async prompt(
    prompt: string,
    scope: ResearchScope,
    onEvent: (event: PiChatStreamEvent) => void
  ): Promise<AgentChatResult> {
    await this.ensureRuntime(scope);
    const observation = await this.environment.observe(scope);
    const researchContext = [
      `Observation: ${observation.summary}`,
      `Artifacts: ${observation.artifactCount}`,
      "Facts:",
      ...observation.facts.map((fact) => `- ${fact}`),
      "Available actions:",
      ...observation.actions.map(
        (action) =>
          `- ${action.id}: ${action.title} (risk=${action.risk}, approval=${action.approval})`
      )
    ].join("\n");
    const result = await this.runtime!.prompt(
      prompt,
      onEvent,
      researchContext
    );
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
          }),
        requestApproval: (input) =>
          this.approvals.request({
            ...input,
            scope
          }),
        recordNote: async ({ note }) =>
          this.gateway.writeArtifact({
            name: "research-note.json",
            kind: "research-note",
            mime: "application/json",
            content: JSON.stringify(
              {
                scope,
                note,
                createdAt: new Date().toISOString()
              },
              null,
              2
            )
          }),
        listFiles: () => this.workspace.tree(),
        readFile: async (path) => (await this.workspace.read(path)).content,
        writeFile: (path, content) => this.workspace.write(path, content),
        runCommand: (command) => this.workspace.run(command)
      }
    });
    this.runtimeScope = key;
  }
}
