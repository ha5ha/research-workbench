import type {
  RpcRequestFunction,
  ContextUsage
} from "@research-workbench/contracts";
import type {
  AgentChatResult,
  ChatCard,
  ChatMessage,
  ResearchScope,
  TraceStep
} from "../types";
import { toolLabel } from "../tool-labels";

export interface ConversationState {
  messages: ChatMessage[];
  mode: AgentChatResult["mode"] | null;
  sessionFile: string | null;
  stream: string;
  trace: TraceStep[];
  cards: ChatCard[];
  running: boolean;
  error: string | null;
  generation: number;
  turnId: string | null;
  contextUsage: ContextUsage | null;
}
interface RequestApi {
  request: RpcRequestFunction;
}
type StorageApi = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const empty = (): ConversationState => ({
  messages: [],
  mode: null,
  sessionFile: null,
  stream: "",
  trace: [],
  cards: [],
  running: false,
  error: null,
  generation: 0,
  turnId: null,
  contextUsage: null
});

/** One state owner per conversation. Async continuations carry its generation. */
export class ConversationStore {
  private states = new Map<string, ConversationState>();
  private listeners = new Set<() => void>();
  private turnQueue: Promise<unknown> = Promise.resolve();
  private active: { key: string; turnId: string } | null = null;
  private runtimeOwner: { key: string; generation: number } | null = null;
  private sequence = 0;
  private readonly pending = empty();
  constructor(
    private readonly storage: StorageApi,
    private readonly api: RequestApi
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot(key: string | null): ConversationState {
    if (!key) return this.pending;
    let state = this.states.get(key);
    if (!state) {
      state = empty();
      try {
        const saved = JSON.parse(this.storage.getItem(key) ?? "null");
        if (saved && Array.isArray(saved.messages)) {
          state.messages = saved.messages;
          state.mode = saved.mode ?? null;
          // Old absolute session paths cannot be sent to Core. Preserve the transcript.
          state.sessionFile =
            typeof saved.sessionFile === "string" &&
            /^[a-zA-Z0-9_-]+$/.test(saved.sessionFile)
              ? saved.sessionFile
              : null;
        }
      } catch {
        /* Invalid local cache must never replace another conversation. */
      }
      this.states.set(key, state);
    }
    return state;
  }
  private update(key: string, patch: Partial<ConversationState>) {
    const next = { ...this.snapshot(key), ...patch };
    this.states.set(key, next);
    this.storage.setItem(
      key,
      JSON.stringify({
        messages: next.messages,
        mode: next.mode,
        sessionFile: next.sessionFile
      })
    );
    for (const listener of this.listeners) listener();
  }
  private current(key: string, generation: number, turnId: string) {
    const state = this.snapshot(key);
    return state.generation === generation && state.turnId === turnId;
  }
  event(payload: {
    conversationId?: string;
    turnId?: string;
    type?: string;
    text?: string;
    card?: ChatCard;
    toolName?: string;
    toolCallId?: string;
    isError?: boolean;
  }) {
    const key = payload.conversationId;
    if (!key || !payload.turnId) return;
    const state = this.snapshot(key);
    if (!state.running || state.turnId !== payload.turnId) return;
    if (payload.type === "delta" && payload.text)
      this.update(key, { stream: state.stream + payload.text });
    if (payload.type === "card" && payload.card)
      this.update(key, { cards: [...state.cards, payload.card] });
    if (payload.type === "tool-start" && payload.toolCallId)
      this.update(key, {
        trace: [
          ...state.trace,
          {
            id: payload.toolCallId,
            toolName: payload.toolName ?? "tool",
            label: toolLabel(payload.toolName ?? "tool"),
            status: "running"
          }
        ]
      });
    if (payload.type === "tool-end" && payload.toolCallId)
      this.update(key, {
        trace: state.trace.map((step) =>
          step.id === payload.toolCallId
            ? { ...step, status: payload.isError ? "error" : "done" }
            : step
        )
      });
  }
  send(
    key: string,
    prompt: string,
    display: string,
    scope: ResearchScope
  ): Promise<void> {
    const before = this.snapshot(key);
    if (before.running) return Promise.resolve();
    const generation = before.generation;
    const turnId = `turn-${Date.now()}-${++this.sequence}`;
    this.update(key, {
      running: true,
      turnId,
      stream: "",
      trace: [],
      cards: [],
      error: null,
      messages: [...before.messages, { role: "user", text: display }]
    });
    const operation = this.turnQueue
      .catch(() => {})
      .then(async () => {
        if (!this.current(key, generation, turnId)) return;
        this.active = { key, turnId };
        try {
          const sessionFile = this.snapshot(key).sessionFile;
          if (sessionFile)
            await this.api.request("agent.restoreSession", { sessionFile });
          else await this.api.request("agent.reset");
          if (!this.current(key, generation, turnId)) return;
          this.runtimeOwner = { key, generation };
          const result = await this.api.request("agent.chat", {
            prompt,
            scope,
            conversationId: key,
            turnId
          });
          if (!this.current(key, generation, turnId)) return;
          const state = this.snapshot(key);
          this.update(key, {
            mode: result.mode,
            sessionFile: result.sessionFile,
            messages: [
              ...state.messages,
              { role: "assistant", text: result.text, mode: result.mode }
            ]
          });
          await this.refreshUsage(key);
        } catch (failure) {
          if (!this.current(key, generation, turnId)) return;
          const state = this.snapshot(key);
          this.update(key, {
            error:
              failure instanceof Error ? failure.message : "Agent 对话失败",
            messages: state.stream.trim()
              ? [
                  ...state.messages,
                  {
                    role: "assistant",
                    text: state.stream,
                    mode: state.mode ?? undefined
                  }
                ]
              : state.messages
          });
        } finally {
          if (this.current(key, generation, turnId))
            this.update(key, { running: false, stream: "" });
          if (this.active?.turnId === turnId) this.active = null;
        }
      });
    this.turnQueue = operation;
    return operation;
  }
  reset(key: string) {
    const generation = this.snapshot(key).generation + 1;
    this.update(key, { ...empty(), generation });
    if (this.runtimeOwner?.key === key) this.runtimeOwner = null;
    if (this.active?.key === key)
      void this.api.request("agent.abort").catch(() => {});
  }
  clearMode(key: string) {
    this.update(key, { mode: null });
  }
  async refreshUsage(key: string) {
    const owner = this.runtimeOwner;
    if (!owner || owner.key !== key) return;
    try {
      const contextUsage = await this.api.request("agent.contextUsage");
      if (
        this.runtimeOwner === owner &&
        this.snapshot(key).generation === owner.generation
      )
        this.update(key, { contextUsage });
    } catch {
      /* Usage is optional; never replace another conversation's value. */
    }
  }
  compact(key: string, instructions: string): Promise<void> {
    const generation = this.snapshot(key).generation;
    const operation = this.turnQueue
      .catch(() => {})
      .then(async () => {
        const state = this.snapshot(key);
        if (state.generation !== generation || !state.sessionFile) return;
        await this.api.request("agent.restoreSession", {
          sessionFile: state.sessionFile
        });
        if (this.snapshot(key).generation !== generation) return;
        this.runtimeOwner = { key, generation };
        await this.api.request("agent.compact", { instructions });
        await this.refreshUsage(key);
      });
    this.turnQueue = operation;
    return operation;
  }
  async open(key: string, file: string): Promise<boolean> {
    this.reset(key);
    const generation = this.snapshot(key).generation;
    try {
      const result = await this.api.request("agent.sessionMessages", { file });
      if (this.snapshot(key).generation !== generation) return false;
      this.update(key, { messages: result.messages, sessionFile: file });
      return true;
    } catch (failure) {
      if (this.snapshot(key).generation === generation)
        this.update(key, {
          error: failure instanceof Error ? failure.message : "打开会话失败"
        });
      return false;
    }
  }
  async stop(key: string) {
    if (this.active?.key === key) await this.api.request("agent.abort");
    else this.reset(key);
  }
}
