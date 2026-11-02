import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { Type } from "@sinclair/typebox";
import {
  createModels,
  createProvider,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Credential,
  type CredentialInfo,
  type CredentialStore,
  type Model
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  defineTool
} from "@earendil-works/pi-coding-agent";
import type {
  ArtifactRef,
  ResearchScope
} from "@research-workbench/contracts";

export interface PiApprovalInput {
  toolName: string;
  title: string;
  detail: string;
  consequence?: string;
}

export interface PiWorkspaceEntry {
  path: string;
  name: string;
  type: "file" | "directory";
  depth: number;
}

export interface PiCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export interface PiChatTools {
  profileData(path: string): Promise<{
    summary: string;
    warnings: string[];
    artifacts: ArtifactRef[];
  }>;
  requestApproval(input: PiApprovalInput): Promise<boolean>;
  recordNote(input: { note: string }): Promise<ArtifactRef>;
  listFiles(): Promise<PiWorkspaceEntry[]>;
  readFile(path: string): Promise<string>;
  writeFile(
    path: string,
    content: string
  ): Promise<{ path: string; size: number }>;
  runCommand(command: string): Promise<PiCommandResult>;
  createExperiment(input: {
    title: string;
    goal: string;
    hypothesis: string;
    design: string;
    metrics: string;
    seeds: number;
  }): Promise<{ experimentId: string; taskBookId: string }>;
  finishExperiment(input: {
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
  }): Promise<{ experimentId: string; status: string }>;
}

export interface PiChatOptions {
  workspace: string;
  agentDir: string;
  scope: ResearchScope;
  tools: PiChatTools;
  provider?: PiProviderConfig;
  sessionFile?: string | null;
}

export type PiProviderMode = "deepseek" | "openai-compatible";

export interface PiProviderConfig {
  provider: PiProviderMode;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export type PiChatStreamEvent =
  | { type: "started" }
  | { type: "delta"; text: string }
  | { type: "tool-start"; toolName: string }
  | { type: "tool-end"; toolName: string; isError: boolean }
  | { type: "completed"; text: string }
  | { type: "failed"; message: string };

export interface PiChatResult {
  text: string;
  mode: "faux" | "deepseek" | "openai";
  sessionFile: string | null;
  systemPrompt: string;
}

const profileParams = Type.Object({
  path: Type.String({
    description: "Workspace-relative CSV/TSV path to profile"
  })
});

/**
 * Credentials stay in process memory. The real key comes from
 * DEEPSEEK_API_KEY and is never written to auth.json or the workspace.
 */
class MemoryCredentialStore implements CredentialStore {
  private readonly entries = new Map<string, Credential>();

  async read(providerId: string): Promise<Credential | undefined> {
    return this.entries.get(providerId);
  }

  async list(): Promise<readonly CredentialInfo[]> {
    return [...this.entries.entries()].map(([providerId, credential]) => ({
      providerId,
      type: credential.type
    }));
  }

  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>
  ): Promise<Credential | undefined> {
    const next = await fn(this.entries.get(providerId));
    if (next === undefined) return this.entries.get(providerId);
    this.entries.set(providerId, next);
    return next;
  }

  async delete(providerId: string): Promise<void> {
    this.entries.delete(providerId);
  }
}

/**
 * Long-lived pi chat session. Uses DeepSeek when DEEPSEEK_API_KEY is present,
 * otherwise a deterministic faux provider for Phase 0 demos/tests.
 */
export class PiChatRuntime {
  private constructor(
    private readonly session: Awaited<
      ReturnType<typeof createAgentSession>
    >["session"],
    private readonly faux: ReturnType<typeof fauxProvider>,
    private readonly mode: "faux" | "deepseek" | "openai",
    private readonly contextRef: { value: string; full: string }
  ) {}

  static async create(options: PiChatOptions): Promise<PiChatRuntime> {
    await mkdir(options.agentDir, { recursive: true });
    const sessionsDir = join(options.agentDir, "sessions");
    await mkdir(sessionsDir, { recursive: true });

    const faux = fauxProvider({ tokensPerSecond: 0 });
    const models = createModels();
    models.setProvider(faux.provider);
    const fauxModel = faux.getModel();
    if (!fauxModel) throw new Error("Faux model unavailable");

    const modelRuntime = await ModelRuntime.create({
      credentials: new MemoryCredentialStore(),
      modelsPath: join(options.agentDir, "models.json")
    });
    modelRuntime.registerNativeProvider(faux.provider);
    await modelRuntime.setRuntimeApiKey("faux", "faux-test-key");

    let model = fauxModel;
    let mode: "faux" | "deepseek" | "openai" = "faux";
    const providerConfig = options.provider ?? {
      provider: "deepseek" as const,
      baseUrl: "https://api.deepseek.com",
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-flash",
      apiKey: process.env.DEEPSEEK_API_KEY ?? ""
    };
    if (
      providerConfig.provider === "openai-compatible" &&
      providerConfig.baseUrl.trim() &&
      providerConfig.model.trim()
    ) {
      const baseUrl = providerConfig.baseUrl.trim().replace(/\/+$/, "");
      const modelId = providerConfig.model.trim();
      const apiKey = providerConfig.apiKey.trim();
      const customModel: Model<"openai-completions"> = {
        id: modelId,
        name: modelId,
        api: "openai-completions",
        provider: "openai-compatible",
        baseUrl,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens: 16_384,
        compat: {
          supportsStore: false,
          supportsDeveloperRole: false,
          supportsReasoningEffort: false
        }
      };
      const provider = createProvider({
        id: "openai-compatible",
        name: "OpenAI Compatible",
        baseUrl,
        auth: {
          apiKey: {
            name: "OpenAI-compatible API key",
            resolve: async () => ({
              auth: apiKey ? { apiKey } : {}
            })
          }
        },
        models: [customModel],
        api: openAICompletionsApi()
      });
      modelRuntime.registerNativeProvider(provider);
      model =
        modelRuntime.getModel("openai-compatible", modelId) ?? customModel;
      mode = "openai";
    } else {
      const deepseekKey =
        providerConfig.apiKey.trim() || process.env.DEEPSEEK_API_KEY;
      if (providerConfig.provider === "deepseek" && deepseekKey) {
        await modelRuntime.setRuntimeApiKey("deepseek", deepseekKey);
        const modelId =
          providerConfig.model.trim() ||
          process.env.DEEPSEEK_MODEL ||
          "deepseek-flash";
        const deepseekModel =
          modelRuntime.getModel("deepseek", modelId) ??
          modelRuntime.getModel("deepseek", "deepseek-v4-pro");
        if (deepseekModel) {
          model = deepseekModel;
          mode = "deepseek";
        }
      }
    }

    const scopeLabel = [
      options.scope.projectId,
      options.scope.questionId,
      options.scope.taskId
    ]
      .filter(Boolean)
      .join(" / ");
    const contextRef = { value: "", full: "" };
    const buildSystemPrompt = () => {
      const prompt =
        "You are Research Workbench, a computational research agent. " +
        "Answer as a careful research collaborator, not as a generic chatbot. " +
        `Current research scope: ${scopeLabel}. ` +
        "Use data_profile before making claims about data.csv. " +
        "Use list_files/read_file to inspect the workspace; write_file and run_command are gated by the " +
        "user's permission level and are rejected when it does not allow them. " +
        "Before changing code, read AGENTS.md if present and follow its layout, style and verification rules; " +
        "keep diffs minimal and never create loose scripts outside the documented layout. " +
        "If the user asks to run or design an experiment, call create_experiment with a task book before executing commands, " +
        "then finish_experiment with observed metrics and conclusion. Do not create an experiment for ordinary feature-code edits. " +
        "Use record_note when the user asks to save a durable note; it is gated by the same permission level. " +
        "Never claim that a dataset is clean, complete or scientifically valid " +
        "from a profile alone. Do not approve runs, claims or permission changes." +
        (contextRef.value
          ? `\n\nCurrent research state for this turn:\n${contextRef.value}`
          : "");
      contextRef.full = prompt;
      return prompt;
    };
    const resourceLoader = new DefaultResourceLoader({
      cwd: options.workspace,
      agentDir: options.agentDir,
      extensionFactories: [
        (pi) => {
          pi.on("before_agent_start", async () => ({
            systemPrompt: buildSystemPrompt()
          }));
          pi.on("tool_call", async (event) => {
            if (event.toolName === "record_note") {
              const input = (event as { input?: { note?: string } }).input;
              const approved = await options.tools.requestApproval({
                toolName: "record_note",
                title: "记录研究笔记",
                detail: input?.note ?? "Agent 请求写入一条研究笔记 artifact",
                consequence: "写入一条研究笔记 artifact，不修改原始数据"
              });
              if (!approved) {
                return {
                  block: true,
                  reason: "用户拒绝了研究笔记写入"
                };
              }
              return undefined;
            }
            if (event.toolName === "write_file") {
              const input = (event as {
                input?: { path?: string; content?: string };
              }).input;
              const approved = await options.tools.requestApproval({
                toolName: "write_file",
                title: "写入工作区文件",
                detail: input?.path ?? "(unknown path)",
                consequence: "覆盖或创建工作区文件；不会修改工作区之外的内容"
              });
              if (!approved) {
                return {
                  block: true,
                  reason: "用户拒绝或审批超时，文件未写入"
                };
              }
              return undefined;
            }
            if (event.toolName === "run_command") {
              const input = (event as { input?: { command?: string } }).input;
              const approved = await options.tools.requestApproval({
                toolName: "run_command",
                title: "执行终端命令",
                detail: input?.command ?? "(unknown command)",
                consequence:
                  "在本地工作区执行 shell 命令，可能修改文件或访问网络"
              });
              if (!approved) {
                return {
                  block: true,
                  reason: "用户拒绝或审批超时，命令未执行"
                };
              }
              return undefined;
            }
            if (
              event.toolName === "data_profile" ||
              event.toolName === "list_files" ||
              event.toolName === "read_file" ||
              event.toolName === "create_experiment" ||
              event.toolName === "finish_experiment"
            ) {
              return undefined;
            }
            return {
              block: true,
              reason: "Tool is not allowed by Research Workbench policy"
            };
          });
        }
      ]
    });
    await resourceLoader.reload();

    const dataProfileTool = defineTool({
      name: "data_profile",
      label: "Data profile",
      description:
        "Profile a workspace CSV/TSV without exposing raw rows. Returns shape, missingness and artifact references.",
      parameters: profileParams,
      execute: async (_toolCallId, params) => {
        const result = await options.tools.profileData(params.path);
        return {
          content: [
            {
              type: "text",
              text:
                `${result.summary}\n` +
                `Warnings: ${result.warnings.length === 0 ? "none" : result.warnings.join("; ")}`
            }
          ],
          details: result
        };
      }
    });

    const recordNoteTool = defineTool({
      name: "record_note",
      label: "Record research note",
      description:
        "Persist a durable research note as a workspace artifact. Requires explicit user approval before writing.",
      parameters: Type.Object({
        note: Type.String({
          description: "The research note to persist"
        })
      }),
      execute: async (_toolCallId, params) => {
        const artifact = await options.tools.recordNote({ note: params.note });
        return {
          content: [
            {
              type: "text",
              text: `研究笔记已写入 ${artifact.path}`
            }
          ],
          details: { artifact }
        };
      }
    });

    const listFilesTool = defineTool({
      name: "list_files",
      label: "List workspace files",
      description:
        "List files and directories in the research workspace, excluding hidden metadata and dependency folders.",
      parameters: Type.Object({}),
      execute: async () => {
        const entries = await options.tools.listFiles();
        return {
          content: [
            {
              type: "text",
              text:
                entries.length === 0
                  ? "(empty workspace)"
                  : entries
                      .map(
                        (entry) =>
                          `${"  ".repeat(entry.depth)}${entry.type === "directory" ? "▸" : "·"} ${entry.path}`
                      )
                      .join("\n")
            }
          ],
          details: { entries }
        };
      }
    });

    const readFileTool = defineTool({
      name: "read_file",
      label: "Read workspace file",
      description:
        "Read a UTF-8 text file inside the workspace. Paths are workspace-relative.",
      parameters: Type.Object({
        path: Type.String({ description: "Workspace-relative file path" })
      }),
      execute: async (_toolCallId, params) => {
        const text = await options.tools.readFile(params.path);
        const clipped =
          text.length > 60_000
            ? `${text.slice(0, 60_000)}\n… file output truncated at 60000 chars`
            : text;
        return {
          content: [{ type: "text", text: clipped }],
          details: { path: params.path, size: text.length }
        };
      }
    });

    const writeFileTool = defineTool({
      name: "write_file",
      label: "Write workspace file",
      description:
        "Write a UTF-8 file inside the workspace. Requires explicit user approval before writing.",
      parameters: Type.Object({
        path: Type.String({ description: "Workspace-relative file path" }),
        content: Type.String({ description: "Full file content" })
      }),
      execute: async (_toolCallId, params) => {
        const result = await options.tools.writeFile(
          params.path,
          params.content
        );
        return {
          content: [
            {
              type: "text",
              text: `已写入 ${result.path}（${result.size} B）`
            }
          ],
          details: result
        };
      }
    });

    const runCommandTool = defineTool({
      name: "run_command",
      label: "Run terminal command",
      description:
        "Run a shell command in the workspace root. Requires explicit user approval.",
      parameters: Type.Object({
        command: Type.String({ description: "Shell command to execute" })
      }),
      execute: async (_toolCallId, params) => {
        const result = await options.tools.runCommand(params.command);
        return {
          content: [
            {
              type: "text",
              text:
                `exit=${result.exitCode ?? "?"} timedOut=${result.timedOut}\n` +
                (result.stdout || "")
                + (result.stderr ? `\n[stderr]\n${result.stderr}` : "")
            }
          ],
          details: result
        };
      }
    });

    const createExperimentTool = defineTool({
      name: "create_experiment",
      label: "Create experiment record",
      description:
        "Create a task book and an experiment record before running a computational experiment. Do not use for ordinary feature-code edits.",
      parameters: Type.Object({
        title: Type.String(),
        goal: Type.String(),
        hypothesis: Type.String(),
        design: Type.String(),
        metrics: Type.String(),
        seeds: Type.Number()
      }),
      execute: async (_toolCallId, params) => {
        const result = await options.tools.createExperiment(params);
        return {
          content: [
            {
              type: "text",
              text: `实验 ${result.experimentId} 已创建，任务书 ${result.taskBookId}。`
            }
          ],
          details: result
        };
      }
    });

    const finishExperimentTool = defineTool({
      name: "finish_experiment",
      label: "Finish experiment record",
      description:
        "Archive the experiment with observed metrics, seeds and a conclusion after the experiment finishes.",
      parameters: Type.Object({
        experimentId: Type.String(),
        metrics: Type.Optional(Type.String()),
        seeds: Type.Optional(Type.Number()),
        conclusion: Type.Optional(Type.String()),
        status: Type.Optional(
          Type.Union([Type.Literal("archived"), Type.Literal("failed")])
        ),
        seedResults: Type.Optional(
          Type.Array(
            Type.Object({
              seed: Type.Union([Type.Number(), Type.String()]),
              metrics: Type.Record(
                Type.String(),
                Type.Union([Type.String(), Type.Number()])
              ),
              note: Type.Optional(Type.String())
            })
          )
        ),
        artifacts: Type.Optional(
          Type.Array(
            Type.Object({
              path: Type.String(),
              kind: Type.String()
            })
          )
        )
      }),
      execute: async (_toolCallId, params) => {
        const result = await options.tools.finishExperiment(params);
        return {
          content: [
            {
              type: "text",
              text: `实验 ${result.experimentId} 已更新为 ${result.status}。`
            }
          ],
          details: result
        };
      }
    });

    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: false }
    });
    const { session } = await createAgentSession({
      cwd: options.workspace,
      agentDir: options.agentDir,
      model,
      modelRuntime,
      thinkingLevel: mode === "deepseek" ? "medium" : "off",
      resourceLoader,
      customTools: [
        dataProfileTool,
        recordNoteTool,
        listFilesTool,
        readFileTool,
        writeFileTool,
        runCommandTool,
        createExperimentTool,
        finishExperimentTool
      ],
      tools: [
        "data_profile",
        "record_note",
        "list_files",
        "read_file",
        "write_file",
        "run_command",
        "create_experiment",
        "finish_experiment"
      ],
      settingsManager,
      sessionManager: options.sessionFile
        ? SessionManager.open(
            options.sessionFile,
            sessionsDir,
            options.workspace
          )
        : SessionManager.create(options.workspace, sessionsDir)
    });

    return new PiChatRuntime(session, faux, mode, contextRef);
  }

  get sessionFile(): string | null {
    return this.session.sessionFile ?? null;
  }

  async prompt(
    text: string,
    onEvent: (event: PiChatStreamEvent) => void,
    researchContext = ""
  ): Promise<PiChatResult> {
    this.contextRef.value = researchContext;
    if (this.mode === "faux") {
      this.faux.setResponses(this.scriptedResponses(text));
    }

    let output = "";
    const unsubscribe = this.session.subscribe((event) => {
      if (
        event.type === "message_update" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        const delta = event.assistantMessageEvent.delta;
        output += delta;
        onEvent({ type: "delta", text: delta });
      }
      if (event.type === "tool_execution_start") {
        onEvent({ type: "tool-start", toolName: event.toolName });
      }
      if (event.type === "tool_execution_end") {
        onEvent({
          type: "tool-end",
          toolName: event.toolName,
          isError: event.isError
        });
      }
    });

    onEvent({ type: "started" });
    try {
      await this.session.prompt(text);
      await this.session.waitForIdle();
      const sessionFile = this.session.sessionFile ?? null;
      if (sessionFile) {
        const info = await stat(sessionFile).catch(() => null);
        if (!info?.isFile()) {
          throw new Error(`pi session file was not persisted: ${sessionFile}`);
        }
      }
      onEvent({ type: "completed", text: output });
      return {
        text: output,
        mode: this.mode,
        sessionFile,
        systemPrompt: this.contextRef.full
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "pi 会话失败";
      onEvent({ type: "failed", message });
      throw error;
    } finally {
      unsubscribe();
    }
  }

  dispose(): void {
    this.session.dispose();
  }

  private scriptedResponses(text: string) {
    if (/实验|experiment/i.test(text)) {
      return [
        fauxAssistantMessage(
          [
            fauxToolCall("create_experiment", {
              title: "轻量增强三种子验证",
              goal: "验证轻量增强是否稳定改善跨域表现",
              hypothesis: "轻量增强在三个种子上均高于匹配基线",
              design: "三种子配对验证；固定预算；同一划分",
              metrics: "验证准确率",
              seeds: 3
            })
          ],
          { stopReason: "toolUse" }
        ),
        fauxAssistantMessage([
          fauxText(
            "实验记录和任务书已创建。运行命令与指标回填需要继续执行；当前记录状态为待决策。"
          )
        ])
      ];
    }
    if (/笔记|note|记录/i.test(text)) {
      return [
        fauxAssistantMessage(
          [
            fauxToolCall("record_note", {
              note: "数据画像只描述表面统计特征，不能证明数据干净或科学有效。"
            })
          ],
          { stopReason: "toolUse" }
        ),
        fauxAssistantMessage([
          fauxText("研究笔记已记录；写入前已经过用户审批。")
        ])
      ];
    }
    if (/profile|画像|data\.csv|数据/i.test(text)) {
      return [
        fauxAssistantMessage(
          [fauxToolCall("data_profile", { path: "data.csv" })],
          { stopReason: "toolUse" }
        ),
        fauxAssistantMessage([
          fauxText(
            "数据画像已完成。缺失和类型问题已记录到 artifact；这只是数据形状检查，不构成科学结论。"
          )
        ])
      ];
    }
    return [
      fauxAssistantMessage([
        fauxText(
          "pi 运行时已连接，但当前没有配置 DEEPSEEK_API_KEY，所以处于演示模式。" +
            "设置真实 provider 后，这个输入框会直接走模型。你也可以输入“画像 data.csv”验证工具链路。"
        )
      ])
    ];
  }
}
