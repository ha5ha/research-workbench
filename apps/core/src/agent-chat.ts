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
import type {
  ExperimentService,
  ExperimentSession
} from "./experiment-service.js";
import type { ExperimentStore } from "./experiment-store.js";
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
  private readonly sessions = new Map<string, ExperimentSession>();

  constructor(
    private readonly skills: SkillService,
    private readonly workspaceRoot: string,
    private readonly approvals: ApprovalBroker,
    private readonly environment: ResearchEnvironment,
    private readonly workspace: WorkspaceService,
    private readonly experimentStore: ExperimentStore,
    private readonly experimentService: ExperimentService
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
    const experiments = this.experimentStore.list().slice(0, 5);
    const researchContext = [
      `Observation: ${observation.summary}`,
      `Artifacts: ${observation.artifactCount}`,
      "Facts:",
      ...observation.facts.map((fact) => `- ${fact}`),
      "Available actions:",
      ...observation.actions.map(
        (action) =>
          `- ${action.id}: ${action.title} (risk=${action.risk}, approval=${action.approval})`
      ),
      "Existing experiments:",
      ...(experiments.length === 0
        ? ["- none"]
        : experiments.map(
            (experiment) =>
              `- ${experiment.id} ${experiment.title} status=${experiment.status} taskbook=${experiment.taskBook.id} v${experiment.taskBook.version}`
          ))
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

  setApiKey(apiKey: string): void {
    const key = apiKey.trim();
    if (key) {
      process.env.DEEPSEEK_API_KEY = key;
    } else {
      delete process.env.DEEPSEEK_API_KEY;
    }
    this.dispose();
  }

  private async createExperiment(
    scope: ResearchScope,
    input: {
      title: string;
      goal: string;
      hypothesis: string;
      design: string;
      metrics: string;
      seeds: number;
    }
  ): Promise<{ experimentId: string; taskBookId: string }> {
    const record = this.experimentStore.create({
      ...input,
      scope
    });
    const session = await this.experimentService.begin(
      "experiment",
      input.title,
      scope
    );
    this.sessions.set(record.id, session);
    return {
      experimentId: record.id,
      taskBookId: record.taskBook.id
    };
  }

  private async finishExperiment(input: {
    experimentId: string;
    metrics?: string;
    seeds?: number;
    conclusion?: string;
    status?: "archived" | "failed";
  }): Promise<{ experimentId: string; status: string }> {
    const session = this.sessions.get(input.experimentId);
    const codeChanges = session
      ? await this.experimentService.finish(
          session,
          input.status === "failed" ? "failed" : "completed"
        )
      : null;
    const record = this.experimentStore.finish(
      input.experimentId,
      {
        metrics: input.metrics,
        seeds: input.seeds,
        conclusion: input.conclusion,
        status: input.status ?? "archived"
      },
      codeChanges?.files ?? []
    );
    this.sessions.delete(input.experimentId);
    return {
      experimentId: record.id,
      status: record.status
    };
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
        runCommand: (command) => this.workspace.run(command),
        createExperiment: (input) =>
          this.createExperiment(scope, input),
        finishExperiment: (input) => this.finishExperiment(input)
      }
    });
    this.runtimeScope = key;
  }
}
