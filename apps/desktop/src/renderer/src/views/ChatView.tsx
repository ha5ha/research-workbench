import { useEffect, useRef, useState } from "react";
import {
  PermissionPicker,
  PERMISSION_LEVELS
} from "../components/PermissionPicker";
import { MODEL_PRESETS } from "../models";
import type {
  AppSettings,
  Attachment,
  ChatCard,
  ChatMessage,
  ContextUsage,
  PermissionLevel,
  SessionSummary,
  TraceStep
} from "../types";

function renderInline(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={index}>{part.slice(1, -1)}</code>;
      }
      return part;
    });
}

function modeLabel(mode: "faux" | "deepseek" | "openai" | null): string {
  if (!mode || mode === "faux") return "离线仿真";
  return mode === "deepseek" ? "DeepSeek" : "OpenAI 兼容";
}

/** Research objects rendered where the conversation happens, not on another page. */
function ResearchCard({
  card,
  onConfirmTaskbook,
  confirming
}: {
  card: ChatCard;
  onConfirmTaskbook: (experimentId: string) => void;
  confirming: boolean;
}) {
  if (card.kind === "taskbook") {
    return (
      <div className="chat-card taskbook">
        <div className="chat-card-head">
          <span className="chat-card-kind">任务书</span>
          <strong>{card.title}</strong>
          <span
            className={`tag ${card.status === "draft" ? "amber" : "green"}`}
          >
            {card.status === "draft" ? "待确认" : "已确认"}
          </span>
          <span className="muted">{card.experimentId}</span>
        </div>
        <dl className="chat-card-facts">
          <div>
            <dt>目标</dt>
            <dd title={card.goal}>{card.goal || "—"}</dd>
          </div>
          <div>
            <dt>假设</dt>
            <dd title={card.hypothesis}>{card.hypothesis || "—"}</dd>
          </div>
          <div>
            <dt>设计</dt>
            <dd title={card.design}>{card.design || "—"}</dd>
          </div>
          <div>
            <dt>指标 / 种子</dt>
            <dd title={card.metrics}>
              {card.metrics || "—"} · {card.seeds}
            </dd>
          </div>
        </dl>
        {card.status === "draft" && (
          <div className="chat-card-actions">
            <button
              type="button"
              className="primary-button"
              disabled={confirming}
              onClick={() => onConfirmTaskbook(card.experimentId)}
            >
              {confirming ? "确认中…" : "确认任务书"}
            </button>
            <span className="chat-card-muted">
              确认前 Agent 不能执行实验命令
            </span>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="chat-card archive">
      <div className="chat-card-head">
        <span className="chat-card-kind">归档</span>
        <strong>{card.title}</strong>
        <span className={`tag ${card.status === "failed" ? "amber" : "green"}`}>
          {card.status === "failed" ? "失败" : "已归档"}
        </span>
      </div>
      <div className="chat-card-metrics">
        <span>指标 {card.metrics ?? "—"}</span>
        <span>{card.artifactCount} 个产物</span>
        <span>{card.seedCount} 个种子</span>
      </div>
      {card.conclusion && <p className="chat-card-note">{card.conclusion}</p>}
      {card.facts.length > 0 && (
        <ul className="chat-card-facts-list">
          {card.facts.map((fact) => (
            <li key={fact.id}>
              <span
                className={`tag ${fact.kind === "negative" ? "amber" : "green"}`}
              >
                {fact.kind === "negative" ? "负结果" : "事实"}
              </span>
              {fact.statement}
              <small>权重 {fact.importance}</small>
            </li>
          ))}
        </ul>
      )}
      {card.reusable && (
        <p className="chat-card-note">
          可复用：{card.reusable.kind} · {card.reusable.description}
          {card.reusable.path ? ` · ${card.reusable.path}` : ""}
        </p>
      )}
      {card.discarded.length > 0 && (
        <p className="chat-card-muted">
          丢弃 {card.discarded.length} 项：
          {card.discarded.map((item) => item.what).join("、")}
        </p>
      )}
    </div>
  );
}

export function ChatView({
  conversationLabel,
  chatMessages,
  chatInput,
  setChatInput,
  chatRunning,
  chatStream,
  chatMode,
  chatError,
  agentConfig,
  onOpenSettings,
  attachments,
  attachmentBusy,
  onAttach,
  onRemoveAttachment,
  onQuickModel,
  onQuickPermissions,
  permissionBusy,
  sendChat,
  trace,
  cards,
  usage,
  onCompact,
  onConfirmTaskbook,
  confirmingId,
  onStop,
  loadSessions,
  onOpenSession
}: {
  conversationLabel: string;
  chatMessages: ChatMessage[];
  chatInput: string;
  setChatInput: (value: string) => void;
  chatRunning: boolean;
  chatStream: string;
  chatMode: "faux" | "deepseek" | "openai" | null;
  chatError: string | null;
  agentConfig: AppSettings | null;
  onOpenSettings: () => void;
  attachments: Attachment[];
  attachmentBusy: boolean;
  onAttach: () => void;
  onRemoveAttachment: (path: string) => void;
  onQuickModel: (model: string) => void;
  onQuickPermissions: (level: PermissionLevel) => void;
  permissionBusy: boolean;
  sendChat: () => Promise<void>;
  trace: TraceStep[];
  cards: ChatCard[];
  usage: ContextUsage | null;
  onCompact: () => void;
  onConfirmTaskbook: (experimentId: string) => void;
  confirmingId: string | null;
  onStop: () => void;
  loadSessions: () => Promise<SessionSummary[]>;
  onOpenSession: (session: SessionSummary) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [toolMenu, setToolMenu] = useState<"model" | "permissions" | null>(
    null
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [permissionDraft, setPermissionDraft] = useState<PermissionLevel>(
    agentConfig?.permissionLevel ?? "workspace-write"
  );
  const toolsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (agentConfig?.permissionLevel) {
      setPermissionDraft(agentConfig.permissionLevel);
    }
  }, [agentConfig?.permissionLevel]);

  useEffect(() => {
    if (!toolMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!toolsRef.current?.contains(event.target as Node)) setToolMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setToolMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [toolMenu]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [chatMessages, chatStream, chatRunning]);

  const modelLabel = agentConfig?.model ?? "未配置模型";
  const permissionLabel =
    PERMISSION_LEVELS.find(
      (item) => item.id === (agentConfig?.permissionLevel ?? "workspace-write")
    )?.title ?? "工作区内修改";

  return (
    <div className="chat-view">
      <div className="chat-scroll" ref={scrollRef}>
        <div className="live-chat">
          <div className="live-chat-heading">
            <span>Agent 对话 · {conversationLabel}</span>
            <div className="live-chat-actions">
              {usage?.percent != null && (
                <span
                  className={`tag usage-pill ${usage.percent >= 80 ? "amber" : ""}`}
                  title={`${usage.tokens ?? "?"} / ${usage.contextWindow} tokens`}
                >
                  {usage.percent > 0 && usage.percent < 1
                    ? "上下文 <1%"
                    : `上下文 ${Math.round(usage.percent)}%`}
                </span>
              )}
              <div className="history-wrap">
                <button
                  type="button"
                  className="tag history-pill"
                  title="历史会话"
                  onClick={() => {
                    const next = !historyOpen;
                    setHistoryOpen(next);
                    if (next) {
                      setHistoryBusy(true);
                      void loadSessions()
                        .then(setSessions)
                        .finally(() => setHistoryBusy(false));
                    }
                  }}
                >
                  历史 ⌄
                </button>
                {historyOpen && (
                  <div className="history-panel">
                    <div className="composer-popover-head">
                      <strong>历史会话</strong>
                      <span>{sessions.length} 个</span>
                    </div>
                    {historyBusy && <div className="empty-note">读取会话…</div>}
                    {!historyBusy && sessions.length === 0 && (
                      <div className="empty-note">还没有保存的会话。</div>
                    )}
                    {sessions.map((session) => (
                      <button
                        type="button"
                        key={session.file}
                        className="history-row"
                        onClick={() => {
                          setHistoryOpen(false);
                          onOpenSession(session);
                        }}
                      >
                        <span className="history-title">{session.title}</span>
                        <small>
                          {session.messages} 条 ·{" "}
                          {session.startedAt
                            ? new Date(session.startedAt).toLocaleString(
                                "zh-CN",
                                {
                                  month: "numeric",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit"
                                }
                              )
                            : "—"}
                        </small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                className={`tag model-pill ${
                  agentConfig?.hasApiKey ? "green" : "amber"
                }`}
                onClick={onOpenSettings}
                title="切换模型"
              >
                {modelLabel}
                <span className="model-pill-chevron">⌄</span>
              </button>
            </div>
          </div>

          {chatMessages.length === 0 && !chatStream && !chatRunning && (
            <div className="empty-note">
              输入研究问题，或描述要运行的实验。模型可点击右上角切换。
            </div>
          )}

          {chatMessages.map((message, index) =>
            message.role === "user" ? (
              <div className="live-user" key={`${message.role}-${index}`}>
                <span className="bubble">{message.text}</span>
              </div>
            ) : (
              <div className="live-assistant" key={`${message.role}-${index}`}>
                <div className="message-meta">
                  Research <span>{modeLabel(message.mode ?? null)}</span>
                </div>
                <div className="prose live-prose">
                  {renderInline(message.text)}
                </div>
              </div>
            )
          )}

          {chatStream && (
            <div className="live-assistant">
              <div className="message-meta">
                Research <span>{modeLabel(chatMode)}</span>
              </div>
              <div className="prose live-prose">
                {renderInline(chatStream)}
                <span className="stream-cursor">▍</span>
              </div>
            </div>
          )}

          {chatRunning && !chatStream && (
            <div className="empty-note">Agent 正在处理…</div>
          )}

          {chatError && (
            <div className="error-card" role="alert">
              <strong>对话失败</strong>
              <p>{chatError}</p>
            </div>
          )}

          {cards.map((card, index) => (
            <ResearchCard
              key={`${card.kind}-${index}`}
              card={card}
              onConfirmTaskbook={onConfirmTaskbook}
              confirming={
                card.kind === "taskbook" && confirmingId === card.experimentId
              }
            />
          ))}

          {usage?.percent != null && usage.percent >= 80 && (
            <div className="chat-card hint">
              <div className="chat-card-head">
                <span className="chat-card-kind">上下文</span>
                <strong>已用 {Math.round(usage.percent)}%</strong>
              </div>
              <p className="chat-card-note">
                继续下去更早的讨论会被压缩。可以先压缩已完成的讨论，再决定是否开新对话。
              </p>
              <button type="button" className="quiet-button" onClick={onCompact}>
                压缩已完成讨论
              </button>
            </div>
          )}

          {trace.length > 0 && (
            <div className="chat-trace" aria-label="执行轨迹">
              <div className="chat-trace-head">执行轨迹</div>
              {trace.map((step) => (
                <div className={`trace-row ${step.status}`} key={step.id}>
                  <span className="trace-dot" />
                  <span className="trace-label">{step.label}</span>
                  <span className="trace-state">
                    {step.status === "running"
                      ? "执行中"
                      : step.status === "error"
                        ? "失败"
                        : "完成"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="composer-wrap">
        {attachments.length > 0 && (
          <div className="composer-attachments">
            {attachments.map((file) => (
              <span className="attachment-chip" key={file.path}>
                <span className="attachment-mark">文</span>
                <span className="attachment-name">{file.name}</span>
                <small>{Math.max(1, Math.round(file.size / 1024))} KB</small>
                <button
                  type="button"
                  aria-label={`移除 ${file.name}`}
                  onClick={() => onRemoveAttachment(file.path)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            void sendChat();
          }}
        >
          <div className="composer-tools" ref={toolsRef}>
            <button
              type="button"
              className="composer-tool"
              disabled={attachmentBusy}
              onClick={onAttach}
            >
              <span className="tool-plus">＋</span>
              {attachmentBusy ? "添加中…" : "附件"}
            </button>

            <div className="composer-tool-wrap">
              <button
                type="button"
                className="composer-tool"
                aria-expanded={toolMenu === "permissions"}
                onClick={() =>
                  setToolMenu((current) =>
                    current === "permissions" ? null : "permissions"
                  )
                }
              >
                权限 · {permissionLabel}
                <span className="tool-chevron">⌄</span>
              </button>
              {toolMenu === "permissions" && (
                <div className="composer-popover permission-popover">
                  <div className="composer-popover-head">
                    <strong>Agent 权限</strong>
                    <span>由 Core 执行</span>
                  </div>
                  <PermissionPicker
                    value={permissionDraft}
                    onChange={setPermissionDraft}
                    disabled={permissionBusy}
                  />
                  <div className="composer-popover-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={permissionBusy}
                      onClick={() => {
                        onQuickPermissions(permissionDraft);
                        setToolMenu(null);
                      }}
                    >
                      {permissionBusy ? "保存中…" : "应用"}
                    </button>
                    <button
                      type="button"
                      className="quiet-button"
                      onClick={() => setToolMenu(null)}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="composer-tool-wrap">
              <button
                type="button"
                className="composer-tool model-tool"
                aria-expanded={toolMenu === "model"}
                onClick={() =>
                  setToolMenu((current) =>
                    current === "model" ? null : "model"
                  )
                }
              >
                <span className="tool-model-name">{modelLabel}</span>
                <span className="tool-chevron">⌄</span>
              </button>
              {toolMenu === "model" && (
                <div className="composer-popover model-popover">
                  <div className="composer-popover-head">
                    <strong>选择模型</strong>
                    <span>OpenAI 兼容端点</span>
                  </div>
                  {MODEL_PRESETS.map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={item === modelLabel ? "selected" : ""}
                      onClick={() => {
                        onQuickModel(item);
                        setToolMenu(null);
                      }}
                    >
                      <span>{item}</span>
                      {item === modelLabel && <small>当前</small>}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="model-custom"
                    onClick={() => {
                      setToolMenu(null);
                      onOpenSettings();
                    }}
                  >
                    自定义模型与 API Key…
                  </button>
                </div>
              )}
            </div>

            <span className="composer-workspace">工作区执行</span>
          </div>

          <input
            className="composer-input"
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder="描述研究任务，或添加附件…"
            disabled={chatRunning}
            aria-label="给 Research Agent 发消息"
          />
          <div className="composer-footer">
            <span>
              {attachments.length > 0
                ? `${attachments.length} 个附件`
                : "可添加 PDF / 表格 / 文本"}
            </span>
            <div className="composer-actions">
              {chatRunning && (
                <button
                  type="button"
                  className="quiet-button stop-button"
                  onClick={onStop}
                >
                  停止
                </button>
              )}
              <button
                className="composer-send"
                type="submit"
                disabled={
                  chatRunning ||
                  (chatInput.trim().length === 0 && attachments.length === 0)
                }
                aria-label="发送"
              >
                ↑
              </button>
            </div>
          </div>
        </form>
        <div className="composer-caption">
          {!agentConfig?.hasApiKey
            ? `${modelLabel} · 未配置 Key，将使用离线仿真`
            : `${modelLabel} · ${
                agentConfig.provider === "deepseek"
                  ? "DeepSeek"
                  : "OpenAI 兼容"
              } 真实模型会话`}
        </div>
      </div>
    </div>
  );
}
