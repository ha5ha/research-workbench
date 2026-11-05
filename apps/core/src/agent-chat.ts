import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
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
import type { AgentCard } from "./cards.js";
import type { FactStore } from "./fact-store.js";
import type {
  ExperimentService,
  ExperimentSession
} from "./experiment-service.js";
import type { ExperimentStore, SeedResult } from "./experiment-store.js";
import type { PermissionService } from "./permissions.js";
import type { ResearchService } from "./research-service.js";
import type { SkillService } from "./skill-service.js";
import type { WorkspaceService } from "./workspace-service.js";
import { WorkspaceToolGateway } from "./workspace.js";
import { rankSimilar } from "./similarity.js";
import { buildWorkingSet } from "./working-set.js";

export interface AgentChatResult {
  text: string;
  mode: "faux" | "deepseek" | "openai";
  sessionFile: string | null;
}

/** Stream events plus the structured cards the UI renders inline. */
export type AgentStreamEvent =
  | PiChatStreamEvent
  | { type: "card"; card: AgentCard };

export class AgentChatService {
  private runtime: PiChatRuntime | null = null;
  private runtimeScope = "";
  private sessionFile: string | null = null;
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
    private readonly permissions: PermissionService,
    private readonly research: ResearchService,
    private readonly facts: FactStore
  ) {
    this.gateway = new WorkspaceToolGateway(workspaceRoot);
  }

  private currentOnEvent?: (event: AgentStreamEvent) => void;

  /** Push a structured card into the live conversation stream. */
  private emitCard(card: AgentCard): void {
    this.currentOnEvent?.({ type: "card", card });
  }

  async prompt(
    prompt: string,
    scope: ResearchScope,
    onEvent: (event: AgentStreamEvent) => void
  ): Promise<AgentChatResult> {
    await this.ensureRuntime(scope);
    this.currentOnEvent = onEvent;
    const researchContext = await this.buildWorkingSet(scope);
    try {
      const result = await this.runtime!.prompt(
        prompt,
        onEvent,
        researchContext
      );
      this.sessionFile = result.sessionFile;
      return result;
    } finally {
      this.currentOnEvent = undefined;
    }
  }

  /**
   * Rebuild the working set every turn instead of trusting the transcript.
   * See working-set.ts for why this keeps a long conversation on direction.
   */
  private async buildWorkingSet(scope: ResearchScope): Promise<string> {
    const topics = await this.research.tree();
    const topic =
      topics.find((item) => item.id === scope.questionId) ?? topics[0] ?? null;
    const route =
      topic?.questions.find((item) =>
        item.tasks.some((task) => task.id === scope.taskId)
      ) ?? null;
    const task =
      route?.tasks.find((item) => item.id === scope.taskId) ?? null;
    const facts = topic
      ? this.facts
          .list({ topicId: topic.id })
          .map((fact) => ({
            statement: fact.statement,
            kind: fact.kind,
            importance: fact.importance,
            status: fact.status
          }))
      : [];
    const runs = this.experimentStore
      .list()
      .filter((record) => {
        const recordScope = record.scope as { taskId?: string } | null;
        return !scope.taskId || recordScope?.taskId === scope.taskId;
      })
      .map((record) => ({
        id: record.id,
        title: record.title,
        status: record.status,
        metrics: record.metrics,
        conclusion: record.conclusion,
        startedAt: record.startedAt
      }));

    return buildWorkingSet({
      topic: topic
        ? { id: topic.id, title: topic.title, description: topic.description }
        : null,
      question: route
        ? { id: route.id, title: route.title, status: route.status }
        : null,
      task: task ? { id: task.id, title: task.title, status: task.status } : null,
      literature: await this.literatureFor(scope.questionId),
      knowledge:
        topic?.knowledge.map((entry) => ({
          title: entry.title,
          body: entry.body,
          tags: entry.tags
        })) ?? [],
      facts,
      runs,
      openTasks: topic?.questions.flatMap((item) => item.tasks) ?? []
    });
  }

  dispose(): void {
    this.runtime?.dispose();
    this.runtime = null;
    this.runtimeScope = "";
  }

  /** Stop the in-flight turn; the pending prompt settles afterwards. */
  async abort(): Promise<void> {
    await this.runtime?.abort();
  }

  /** Context pressure for the conversation water-level indicator. */
  contextUsage(): {
    tokens: number | null;
    percent: number | null;
    contextWindow: number;
  } | null {
    return this.runtime?.contextUsage() ?? null;
  }

  /** Manual compaction with research-aware instructions. */
  async compact(customInstructions?: string): Promise<void> {
    await this.runtime?.compact(customInstructions);
  }

  private async literatureFor(topicId?: string): Promise<
    Array<{ title: string; url?: string; note?: string }>
  > {
    if (!topicId) return [];
    try {
      const topics = await this.research.tree();
      const topic = topics.find((item) => item.id === topicId);
      return (topic?.literature ?? []).slice(0, 12).map((item) => ({
        title: item.title,
        url: item.url,
        note: item.note
      }));
    } catch {
      return [];
    }
  }

  private sessionsDir(): string {
    return join(this.workspaceRoot, ".research", "agent", "sessions");
  }

  /** Past conversations, newest first, read straight from pi's JSONL sessions. */
  async listSessions(): Promise<
    Array<{
      file: string;
      id: string;
      title: string;
      startedAt: string;
      size: number;
      messages: number;
    }>
  > {
    const dir = this.sessionsDir();
    const entries = await readdir(dir, { withFileTypes: true }).catch(
      () => null
    );
    if (!entries) return [];
    const files = entries.filter(
      (entry) => entry.isFile() && entry.name.endsWith(".jsonl")
    );
    const sessions = await Promise.all(
      files.map(async (entry) => {
        const file = join(dir, entry.name);
        const info = await stat(file).catch(() => null);
        const messages = await this.readSession(file).catch(() => []);
        const firstUser = messages.find((item) => item.role === "user");
        return {
          file,
          id: entry.name.replace(/\.jsonl$/, ""),
          title: (firstUser?.text ?? "空会话").replace(/\s+/g, " ").slice(0, 60),
          startedAt: info?.mtime.toISOString() ?? "",
          size: info?.size ?? 0,
          messages: messages.length
        };
      })
    );
    return sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  /** Extract a readable transcript from a pi session file. */
  async readSession(
    file: string
  ): Promise<Array<{ role: "user" | "assistant"; text: string }>> {
    const dir = resolve(this.sessionsDir());
    const target = resolve(file);
    if (!target.startsWith(`${dir}${sep}`)) {
      throw new Error("会话文件不在当前工作区");
    }
    const raw = await readFile(target, "utf8");
    const messages: Array<{ role: "user" | "assistant"; text: string }> = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let entry: unknown;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (
        !entry ||
        typeof entry !== "object" ||
        (entry as { type?: string }).type !== "message"
      ) {
        continue;
      }
      const message = (entry as { message?: unknown }).message as
        | { role?: string; content?: unknown }
        | undefined;
      if (!message || (message.role !== "user" && message.role !== "assistant")) {
        continue;
      }
      const text = contentToText(message.content);
      if (!text) continue;
      messages.push({ role: message.role, text });
    }
    return messages;
  }

  reset(): void {
    this.sessionFile = null;
    this.dispose();
  }

  restoreSession(sessionFile: string | null): void {
    this.dispose();
    if (!sessionFile) {
      this.sessionFile = null;
      return;
    }
    const sessionsDir = join(this.workspaceRoot, ".research", "agent", "sessions");
    const resolved = resolve(sessionFile);
    if (!resolved.startsWith(resolve(sessionsDir))) {
      throw new Error("会话文件不在当前工作区");
    }
    if (!existsSync(resolved)) {
      throw new Error("会话文件不存在");
    }
    this.sessionFile = resolved;
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
    const similar = this.findSimilarEvidence(
      `${input.title} ${input.goal} ${input.hypothesis}`
    );
    this.emitCard({
      kind: "taskbook",
      experimentId: record.id,
      title: input.title,
      goal: input.goal,
      hypothesis: input.hypothesis,
      design: input.design,
      metrics: input.metrics,
      seeds: input.seeds,
      status: "draft",
      similar
    });
    return {
      experimentId: record.id,
      taskBookId: record.taskBook.id
    };
  }

  /**
   * Dedupe aid: surface facts and finished runs that look like this proposal,
   * so the human sees "we already tried this" before confirming.
   */
  private findSimilarEvidence(
    text: string
  ): Array<{ id: string; text: string; kind: string; score: number }> {
    const facts = this.facts.list().map((fact) => ({
      id: fact.id,
      text: `${fact.statement}`,
      kind: `fact:${fact.kind}`
    }));
    const runs = this.experimentStore
      .list()
      .filter((record) => record.status !== "pending")
      .map((record) => ({
        id: record.id,
        text: `${record.title} ${record.conclusion ?? ""}`,
        kind: "run"
      }));
    return rankSimilar(text, [...facts, ...runs], { limit: 3 }).map(
      (match) => ({
        id: match.id,
        text: match.text,
        kind: match.kind ?? "run",
        score: Math.round(match.score * 100) / 100
      })
    );
  }

  /**
   * Durable approval gate: a proposed task book must be confirmed by the human
   * before the agent is allowed to execute anything for it. This is enforced in
   * code, not in the prompt (see AGENTS.md: model proposes, researcher signs).
   */
  private async runCommand(
    scope: ResearchScope,
    command: string
  ): Promise<Awaited<ReturnType<WorkspaceService["run"]>>> {
    const drafts = this.experimentStore
      .pendingDraftTaskbooks()
      .filter((record) => {
        const recordScope = record.scope as { taskId?: string } | null;
        return (recordScope?.taskId ?? undefined) === (scope.taskId ?? undefined);
      });
    if (drafts.length > 0) {
      const draft = drafts[0]!;
      throw new Error(
        `任务书 ${draft.taskBook.id} 还没有被研究者确认，不能执行实验命令。` +
          `请先请用户确认任务书（${draft.id}），确认后再继续。`
      );
    }
    return this.workspace.run(command);
  }

  private async finishExperiment(
    scope: ResearchScope,
    input: {
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
      reusable?: { kind: string; description: string; path?: string };
      curation?: {
        facts?: Array<{
          statement: string;
          kind?: string;
          importance?: number;
        }>;
        discarded?: Array<{ what: string; reason: string }>;
      };
    }
  ): Promise<{ experimentId: string; status: string }> {
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
        artifacts: input.artifacts ?? codeChanges?.artifacts,
        reusable: input.reusable
      },
      codeChanges?.files ?? []
    );
    this.sessions.delete(input.experimentId);

    // Curated sediment: only what the agent judged worth keeping becomes a fact.
    const createdFacts = (input.curation?.facts ?? [])
      .filter((fact) => fact.statement.trim().length > 0)
      .map((fact) =>
        this.facts.create({
          statement: fact.statement,
          kind: normalizeFactKind(fact.kind),
          importance: fact.importance ?? 3,
          status: "proposed",
          topicId: scope.questionId,
          taskId: scope.taskId,
          runId: record.id
        })
      );

    this.emitCard({
      kind: "archive",
      experimentId: record.id,
      title: record.title,
      status: record.status,
      metrics: record.metrics,
      conclusion: record.conclusion,
      artifactCount: record.artifacts.length,
      seedCount: record.seedResults.length,
      reusable: record.reusable,
      facts: createdFacts.map((fact) => ({
        id: fact.id,
        statement: fact.statement,
        kind: fact.kind,
        importance: fact.importance
      })),
      discarded: input.curation?.discarded ?? []
    });

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
      sessionFile: this.sessionFile,
      tools: {
        profileData: (path) =>
          this.skills.run("data-profile", {
            scope,
            artifacts: [],
            params: { path }
          }),
        requestApproval: (input) => {
          // The permission level is the user's standing consent. Only commands
          // inside `workspace-write` need a one-off confirmation, because a
          // shell cannot be confined to the project directory the way a file
          // write can.
          if (!this.permissions.allows(input.toolName)) {
            return Promise.resolve(false);
          }
          if (!this.permissions.requiresConfirmation(input.toolName)) {
            return Promise.resolve(true);
          }
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
        runCommand: (command) => this.runCommand(scope, command),
        createExperiment: (input) =>
          this.createExperiment(scope, input),
        finishExperiment: (input) => this.finishExperiment(scope, input)
      }
    });
    this.runtimeScope = key;
  }
}

/** Flatten a pi message `content` value (string or typed parts) to plain text. */
function normalizeFactKind(
  kind?: string
): "finding" | "negative" | "method" | "constraint" {
  return kind === "negative" || kind === "method" || kind === "constraint"
    ? kind
    : "finding";
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const typed = part as { type?: string; text?: unknown };
    if (typed.type === "text" && typeof typed.text === "string") {
      parts.push(typed.text);
    }
  }
  return parts.join("\n").trim();
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
