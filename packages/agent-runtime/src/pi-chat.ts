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
  ModelRuntime,
  SessionManager,
  SettingsManager,
  defineTool
} from "@earendil-works/pi-coding-agent";
import type {
  AgentDemoResponse,
  AgentToolAuthorization,
  AgentToolDefinition
} from "@research-workbench/contracts";
import { HostResourceLoader } from "./host-resource-loader.js";

export interface PiChatOptions {
  workspace: string;
  agentDir: string;
  systemPrompt: string;
  tools: AgentToolDefinition[];
  authorizeToolCall(
    name: string,
    input: Record<string, unknown>
  ): Promise<AgentToolAuthorization>;
  demoResponses?(text: string): AgentDemoResponse[];
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

function isToolInput(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

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
 * Long-lived generic pi chat session. Uses DeepSeek when DEEPSEEK_API_KEY is present,
 * otherwise a deterministic faux provider for Phase 0 demos/tests.
 */
export class PiChatRuntime {
  private constructor(
    private readonly session: Awaited<
      ReturnType<typeof createAgentSession>
    >["session"],
    private readonly faux: ReturnType<typeof fauxProvider>,
    private readonly mode: "faux" | "deepseek" | "openai",
    private readonly contextRef: { value: string; full: string },
    private readonly demoResponses?: (text: string) => AgentDemoResponse[]
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
      // Disk models.json supports command-valued headers/auth; only host config is trusted.
      // null also selects the SDK's in-memory model catalog store.
      modelsPath: null,
      allowModelNetwork: false
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
    const configuredDeepseek = modelRuntime.getModel(
      "deepseek",
      providerConfig.model.trim()
    );
    const customDeepseek =
      providerConfig.provider === "deepseek" &&
      Boolean(providerConfig.apiKey.trim() || process.env.DEEPSEEK_API_KEY) &&
      (!configuredDeepseek ||
        providerConfig.baseUrl.trim().replace(/\/+$/, "") !==
          configuredDeepseek.baseUrl);
    if (
      (providerConfig.provider === "openai-compatible" || customDeepseek) &&
      providerConfig.baseUrl.trim() &&
      providerConfig.model.trim() &&
      // A cloud OpenAI-compatible endpoint is unusable without a key, and
      // pretending otherwise produced a 401 on the very first message. Without
      // a key we fall through to the offline provider instead. Local endpoints
      // (Ollama, vLLM, LM Studio) legitimately need no key.
      (providerConfig.apiKey.trim() ||
        isLocalEndpoint(providerConfig.baseUrl.trim()))
    ) {
      const baseUrl = providerConfig.baseUrl.trim().replace(/\/+$/, "");
      const modelId = providerConfig.model.trim();
      const providerId = providerConfig.provider;
      const apiKey =
        providerConfig.apiKey.trim() ||
        (providerId === "deepseek"
          ? process.env.DEEPSEEK_API_KEY
          : undefined) ||
        "sk-local";
      const customModel: Model<"openai-completions"> = {
        id: modelId,
        name: modelId,
        api: "openai-completions",
        provider: providerId,
        baseUrl,
        reasoning:
          providerId === "deepseek" && /reasoner|reasoning/i.test(modelId),
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens: 16_384,
        compat: {
          supportsStore: false,
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
          ...(providerId === "deepseek"
            ? {
                requiresReasoningContentOnAssistantMessages: true,
                thinkingFormat: "deepseek" as const,
                maxTokensField: "max_tokens" as const
              }
            : {})
        }
      };
      const provider = createProvider({
        id: providerId,
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
      model = modelRuntime.getModel(providerId, modelId) ?? customModel;
      mode = providerId === "deepseek" ? "deepseek" : "openai";
    } else {
      const deepseekKey =
        providerConfig.apiKey.trim() || process.env.DEEPSEEK_API_KEY;
      if (providerConfig.provider === "deepseek" && deepseekKey) {
        await modelRuntime.setRuntimeApiKey("deepseek", deepseekKey);
        const modelId =
          providerConfig.model.trim() ||
          process.env.DEEPSEEK_MODEL ||
          "deepseek-flash";
        const deepseekModel = modelRuntime.getModel("deepseek", modelId);
        if (deepseekModel) {
          model = deepseekModel;
          mode = "deepseek";
        }
      }
    }

    const contextRef = { value: "", full: "" };
    const buildSystemPrompt = () => {
      const prompt =
        options.systemPrompt +
        (contextRef.value ? `\n\nCurrent context:\n${contextRef.value}` : "");
      contextRef.full = prompt;
      return prompt;
    };
    const resourceLoader = new HostResourceLoader({
      systemPrompt: buildSystemPrompt,
      toolNames: options.tools.map((tool) => tool.name),
      authorizeToolCall: options.authorizeToolCall
    });
    await resourceLoader.reload();
    const customTools = options.tools.map((tool) => {
      const parameters = Type.Unsafe<Record<string, unknown>>(tool.parameters);
      return defineTool<typeof parameters>({
        name: tool.name,
        label: tool.label,
        description: tool.description,
        parameters,
        execute: async (_id, input) => {
          if (!isToolInput(input))
            throw new Error("Tool input must be a JSON object");
          const result = await tool.execute(input);
          return { content: result.content, details: result.details };
        }
      });
    });

    const settingsManager = SettingsManager.inMemory(
      {
        // Compaction is what keeps a long research conversation usable: keep the
        // recent tail verbatim and summarise the older part instead of discarding.
        compaction: {
          enabled: true,
          reserveTokens: 8_000,
          keepRecentTokens: 20_000
        },
        retry: { enabled: false }
      },
      { projectTrusted: false }
    );
    const { session } = await createAgentSession({
      cwd: options.workspace,
      agentDir: options.agentDir,
      model,
      modelRuntime,
      thinkingLevel: mode === "deepseek" ? "medium" : "off",
      resourceLoader,
      customTools,
      tools: options.tools.map((tool) => tool.name),
      settingsManager,
      sessionManager: options.sessionFile
        ? SessionManager.open(
            options.sessionFile,
            sessionsDir,
            options.workspace
          )
        : SessionManager.create(options.workspace, sessionsDir)
    });

    return new PiChatRuntime(
      session,
      faux,
      mode,
      contextRef,
      options.demoResponses
    );
  }

  get sessionFile(): string | null {
    return this.session.sessionFile ?? null;
  }

  async prompt(
    text: string,
    onEvent: (event: PiChatStreamEvent) => void,
    context = ""
  ): Promise<PiChatResult> {
    this.contextRef.value = context;
    if (this.mode === "faux") {
      const responses = this.demoResponses?.(text) ?? [
        { text: "No model provider is configured." }
      ];
      this.faux.setResponses(
        responses.map((response) =>
          fauxAssistantMessage(
            response.toolCalls?.length
              ? response.toolCalls.map((call) =>
                  fauxToolCall(call.name, call.arguments)
                )
              : [fauxText(response.text ?? "")],
            response.toolCalls?.length ? { stopReason: "toolUse" } : undefined
          )
        )
      );
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

  /** Abort the in-flight turn; the pending `prompt()` settles afterwards. */
  async abort(): Promise<void> {
    await this.session.abort();
  }

  /** Current context pressure, used to drive the UI water-level indicator. */
  contextUsage(): {
    tokens: number | null;
    percent: number | null;
    contextWindow: number;
  } | null {
    const usage = this.session.getContextUsage();
    if (!usage) return null;
    return {
      tokens: usage.tokens,
      percent: usage.percent,
      contextWindow: usage.contextWindow
    };
  }

  /** Manual compaction with host-provided instructions. */
  async compact(customInstructions?: string): Promise<void> {
    await this.session.compact(customInstructions);
  }
}

/** Loopback or RFC1918 host: an OpenAI-compatible server that needs no key. */
function isLocalEndpoint(baseUrl: string): boolean {
  try {
    const { hostname } = new URL(baseUrl);
    const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return (
      host === "localhost" ||
      host === "::1" ||
      host === "0.0.0.0" ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return false;
  }
}
