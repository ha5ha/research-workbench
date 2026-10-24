import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  PiChatRuntime,
  type PiChatStreamEvent,
  type PiProviderConfig
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
import type { ExperimentStore, SeedResult } from "./experiment-store.js";
import type { PermissionService } from "./permissions.js";
import type { SkillService } from "./skill-service.js";
import type { WorkspaceService } from "./workspace-service.js";
import { WorkspaceToolGateway } from "./workspace.js";

export interface AgentChatResult {
  text: string;
  mode: "faux" | "deepseek" | "openai";
  sessionFile: string | null;
}

export class AgentChatService {
  private runtime: PiChatRuntime | null = null;
  private runtimeScope = "";
  private readonly gateway: WorkspaceToolGateway;
  private readonly sessions = new Map<string, ExperimentSession>();
  private providerConfig: PiProviderConfig = {
    provider:
      process.env.RW_PROVIDER === "openai-compatible"
        ? "openai-compatible"
        : "deepseek",
    baseUrl: process.env.RW_BASE_URL ?? "https://api.deepseek.com",
    model:
      process.env.RW_MODEL ??
      process.env.DEEPSEEK_MODEL ??
      "deepseek-flash",
    apiKey: process.env.RW_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? ""
  };

  constructor(
    private readonly skills: SkillService,
    private readonly workspaceRoot: string,
    private readonly approvals: ApprovalBroker,
    private readonly environment: ResearchEnvironment,
    private readonly workspace: WorkspaceService,
    private readonly experimentStore: ExperimentStore,
    private readonly experimentService: ExperimentService,
    private readonly permissions: PermissionService
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

  reset(): void {
    this.dispose();
  }

  setApiKey(apiKey: string): void {
    const key = apiKey.trim();
    this.providerConfig = { ...this.providerConfig, apiKey: key };
    if (key) {
      process.env.RW_API_KEY = key;
    } else {
      delete process.env.RW_API_KEY;
    }
    this.dispose();
  }

  configureProvider(input: {
    provider: PiProviderConfig["provider"];
    baseUrl: string;
    model: string;
    apiKey?: string;
  }): void {
    this.providerConfig = {
      provider: input.provider,
      baseUrl: input.baseUrl.trim(),
      model: input.model.trim(),
      apiKey:
        input.apiKey === undefined
          ? this.providerConfig.apiKey
          : input.apiKey.trim()
    };
    process.env.RW_PROVIDER = this.providerConfig.provider;
    process.env.RW_BASE_URL = this.providerConfig.baseUrl;
    process.env.RW_MODEL = this.providerConfig.model;
    if (this.providerConfig.apiKey) {
      process.env.RW_API_KEY = this.providerConfig.apiKey;
    } else {
      delete process.env.RW_API_KEY;
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
    seedResults?: Array<{
      seed: number | string;
      metrics: Record<string, string | number>;
      note?: string;
    }>;
    artifacts?: Array<{ path: string; kind: string }>;
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
        status: input.status ?? "archived",
        seedResults:
          input.seedResults ?? (await readSeedResults(this.workspaceRoot)),
        artifacts: input.artifacts ?? codeChanges?.artifacts
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
      provider: this.providerConfig,
      tools: {
        profileData: (path) =>
          this.skills.run("data-profile", {
            scope,
            artifacts: [],
            params: { path }
          }),
        requestApproval: (input) => {
          const mode = this.permissions.modeForTool(input.toolName);
          if (mode === "allow") return Promise.resolve(true);
          if (mode === "deny") return Promise.resolve(false);
          return this.approvals.request({
            ...input,
            scope
          });
        },
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

async function readSeedResults(
  workspaceRoot: string
): Promise<SeedResult[] | undefined> {
  const jsonPath = join(workspaceRoot, "results", "seed-results.json");
  if (existsSync(jsonPath)) {
    try {
      const raw = JSON.parse(await readFile(jsonPath, "utf8")) as unknown;
      if (Array.isArray(raw)) {
        return raw.filter(
          (item): item is SeedResult =>
            Boolean(item) &&
            typeof item === "object" &&
            "seed" in item &&
            "metrics" in item
        );
      }
    } catch {
      // Fall back to CSV or the tool-provided result.
    }
  }
  for (const name of ["seed-metrics.csv", "seed_metrics.csv"]) {
    const csvPath = join(workspaceRoot, "results", name);
    if (!existsSync(csvPath)) continue;
    try {
      const lines = (await readFile(csvPath, "utf8"))
        .replace(/^\uFEFF/, "")
        .trim()
        .split(/\r?\n/)
        .filter(Boolean);
      if (lines.length < 2) continue;
      const header = parseCsvLine(lines[0] ?? "");
      const seedIndex = Math.max(
        0,
        header.findIndex((column) => /seed/i.test(column))
      );
      return lines.slice(1).map((line) => {
        const cells = parseCsvLine(line);
        const metrics: Record<string, string | number> = {};
        header.forEach((column, index) => {
          if (index === seedIndex) return;
          const value = cells[index] ?? "";
          const numeric = Number(value);
          metrics[column] = value !== "" && Number.isFinite(numeric) ? numeric : value;
        });
        return {
          seed: cells[seedIndex] ?? String(cells),
          metrics
        };
      });
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}
