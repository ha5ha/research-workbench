import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { Type } from "@sinclair/typebox";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Credential,
  type CredentialInfo,
  type CredentialStore
} from "@earendil-works/pi-ai";
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
}

export interface PiChatTools {
  profileData(path: string): Promise<{
    summary: string;
    warnings: string[];
    artifacts: ArtifactRef[];
  }>;
  requestApproval(input: PiApprovalInput): Promise<boolean>;
  recordNote(input: { note: string }): Promise<ArtifactRef>;
}

export interface PiChatOptions {
  workspace: string;
  agentDir: string;
  scope: ResearchScope;
  tools: PiChatTools;
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
  mode: "faux" | "deepseek";
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
    private readonly mode: "faux" | "deepseek",
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
    let mode: "faux" | "deepseek" = "faux";
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (deepseekKey) {
      await modelRuntime.setRuntimeApiKey("deepseek", deepseekKey);
      const modelId = process.env.DEEPSEEK_MODEL ?? "deepseek-flash";
      const deepseekModel =
        modelRuntime.getModel("deepseek", modelId) ??
        modelRuntime.getModel("deepseek", "deepseek-v4-pro");
      if (deepseekModel) {
        model = deepseekModel;
        mode = "deepseek";
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
        "Use record_note when the user asks to save a durable note; it requires approval. " +
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
                detail: input?.note ?? "Agent 请求写入一条研究笔记 artifact"
              });
              if (!approved) {
                return {
                  block: true,
                  reason: "用户拒绝了研究笔记写入"
                };
              }
              return undefined;
            }
            if (event.toolName !== "data_profile") {
              return {
                block: true,
                reason: "Tool is not allowed by Research Workbench policy"
              };
            }
            return undefined;
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
      customTools: [dataProfileTool, recordNoteTool],
      tools: ["data_profile", "record_note"],
      settingsManager,
      sessionManager: SessionManager.create(options.workspace, sessionsDir)
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
