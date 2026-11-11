import { Button, IconButton } from "@research-workbench/ui";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import {
  PermissionPicker,
  PERMISSION_LEVELS
} from "../components/PermissionPicker";
import { ModelPicker } from "../components/ModelPicker";
import { SessionHistory } from "../components/SessionHistory";
import { Icon, Popover } from "@research-workbench/ui";
import { ResearchActivity } from "../research/ResearchActivity";
import { researchRequests } from "../research/agent-requests";
import { useResearchOverview } from "../research/useResearchOverview";
import { experimentPlanState } from "../research/plan-state";
import { RUN_STATES } from "../research/RunDetailView";
import type { LoopOverview } from "@research-workbench/contracts";
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
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

/** Research objects rendered where the conversation happens, not on another page. */
function ResearchCard({
  card,
  overview,
  onReviewPlan,
  onAskAgent,
  onOpenResearch
}: {
  card: ChatCard;
  overview: LoopOverview | null;
  onReviewPlan: (id: string) => void;
  onAskAgent: (prompt: string) => void;
  onOpenResearch: (runId?: string) => void;
}) {
  const state =
    card.kind === "taskbook" || card.kind === "run_plan"
      ? experimentPlanState(overview, card.experimentId)
      : null;
  if (card.kind === "run_plan")
    return (
      <button
        className="chat-plan-link"
        onClick={() =>
          state?.pending ? onReviewPlan(state.pending.id) : onOpenResearch()
        }
      >
        <Icon name="file" /> {card.title} ·{" "}
        {state?.pending
          ? "审阅当前方案"
          : state?.plan?.closure
            ? "方案已关闭 · 查看研究记录"
            : "查看研究工作区"}{" "}
        <Icon name="arrow-right" />
      </button>
    );
  if (card.kind === "taskbook") {
    const status = !overview
      ? "读取科研状态…"
      : state?.pending
        ? state.pending.approvedAt
          ? "已批准，待启动"
          : "方案待审阅"
        : state?.run
          ? RUN_STATES[state.run.state]
          : state?.plan?.closure
            ? state.plan.closure.kind === "dismissed"
              ? "方案已撤回"
              : "方案已替代"
            : card.status === "draft"
              ? "草案"
              : "已确认";
    return (
      <div className="chat-card taskbook">
        <div className="chat-card-head">
          <span className="chat-card-kind">任务书</span>
          <strong>{card.title}</strong>
          <span
            className={`tag ${state?.run?.state === "succeeded" ? "green" : "amber"}`}
          >
            {status}
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
        {card.similar.length > 0 && (
          <div className="chat-card-similar">
            <strong>历史证据（可能是同一实验）</strong>
            <ul>
              {card.similar.map((item) => (
                <li key={item.id}>
                  <span className="tag amber">{item.id}</span>
                  {item.text}
                  <small>{Math.round(item.score * 100)}%</small>
                </li>
              ))}
            </ul>
          </div>
        )}
        {overview && (
          <div className="chat-card-actions">
            <Button
              variant="primary"
              type="button"

              onClick={() =>
                state?.pending
                  ? onReviewPlan(state.pending.id)
                  : state?.run
                    ? onOpenResearch(state.run.id)
                    : onAskAgent(researchRequests.prepareRun(card.experimentId))
              }
            >
              {state?.pending
                ? "审阅当前方案"
                : state?.run
                  ? "查看运行"
                  : state?.plan?.closure
                    ? "让 Agent 重新准备方案"
                    : "让 Agent 准备运行方案"}
            </Button>
            <span className="chat-card-muted">
              {state?.plan?.closure?.reason ??
                (state?.run
                  ? "运行状态来自科研记录"
                  : "审阅冻结方案后再批准运行")}
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
  connected,
  onOpenResearch,
  onAskAgent,
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
  connected: boolean;
  onOpenResearch: (runId?: string) => void;
  onAskAgent: (prompt: string) => void;
  onStop: () => void;
  loadSessions: () => Promise<SessionSummary[]>;
  onOpenSession: (session: SessionSummary) => Promise<boolean>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Adapted from alphaXiv/OpenResearch ChatPanel.tsx (MIT), revision
  // 92d6423a14b02cc6de85d3e2383dce6cb4dcb7fd. See ADR-0019 / THIRD_PARTY_NOTICES.
  const stickToBottom = useRef(true);
  const programmaticScroll = useRef<number | null>(null);
  const pinTranscriptToBottom = useCallback(() => {
    stickToBottom.current = true;
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
    programmaticScroll.current = node.scrollTop;
  }, []);
  const researchState = useResearchOverview(connected);
  const [reviewPlanId, setReviewPlanId] = useState<string | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<PermissionLevel>(
    agentConfig?.permissionLevel ?? "workspace-write"
  );

  useEffect(() => {
    if (agentConfig?.permissionLevel) {
      setPermissionDraft(agentConfig.permissionLevel);
    }
  }, [agentConfig?.permissionLevel]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    const content = contentRef.current;
    if (!node || !content) return;
    let viewport = [
      innerWidth,
      innerHeight,
      node.clientWidth,
      node.clientHeight
    ];
    const updateTranscriptBottom = () => {
      const nextViewport = [
        innerWidth,
        innerHeight,
        node.clientWidth,
        node.clientHeight
      ];
      const resized = nextViewport.some(
        (size, index) => size !== viewport[index]
      );
      viewport = nextViewport;
      // Reflow can emit a scroll before ResizeObserver. It is not a reading gesture.
      if (resized) {
        if (stickToBottom.current) pinTranscriptToBottom();
        return;
      }
      const atBottom =
        node.scrollHeight - node.scrollTop - node.clientHeight < 60;
      const programmatic =
        programmaticScroll.current !== null &&
        Math.abs(node.scrollTop - programmaticScroll.current) <= 1;
      programmaticScroll.current = null;
      if (!programmatic) stickToBottom.current = atBottom;
    };
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) pinTranscriptToBottom();
    });
    node.addEventListener("scroll", updateTranscriptBottom, { passive: true });
    observer.observe(node);
    observer.observe(content);
    pinTranscriptToBottom();
    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", updateTranscriptBottom);
    };
  }, [pinTranscriptToBottom]);

  useLayoutEffect(() => {
    if (chatMessages.length === 0 && !chatRunning) pinTranscriptToBottom();
  }, [chatMessages.length, chatRunning, pinTranscriptToBottom]);

  const submitChat = () => {
    if (
      chatRunning ||
      !connected ||
      (!chatInput.trim() && attachments.length === 0)
    )
      return;
    pinTranscriptToBottom();
    void sendChat();
  };

  const modelLabel = agentConfig?.model ?? "未配置模型";
  const permissionLabel =
    PERMISSION_LEVELS.find(
      (item) => item.id === (agentConfig?.permissionLevel ?? "workspace-write")
    )?.title ?? "工作区内修改";

  return (
    <div className="chat-view">
      <div
        className="chat-scroll"
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label="对话记录"
      >
        <div className="live-chat" ref={contentRef}>
          <div className="live-chat-heading">
            <span>{conversationLabel}</span>
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
              <SessionHistory
                loadSessions={loadSessions}
                onOpenSession={async (session) => {
                  if (await onOpenSession(session)) pinTranscriptToBottom();
                }}
              />
              <ModelPicker
                value={modelLabel}
                onChange={onQuickModel}
                onOpenSettings={onOpenSettings}
              />
            </div>
          </div>

          {chatMessages.length === 0 && !chatStream && !chatRunning && (
            <div className="chat-welcome">
              <span className="welcome-mark" aria-hidden="true">
                <Icon name="arrow-up-right" size={24} />
              </span>
              <h1>今天想研究什么？</h1>
              <p>从一个问题开始，或让 Agent 先读懂你的项目。</p>
              <div className="welcome-actions">
                <Button
                  variant="default"
                  onClick={() => onAskAgent(researchRequests.understandProject)}
                >
                  梳理当前项目 <Icon name="arrow-right" />
                </Button>
                <Button
                  variant="default"
                  onClick={() => onAskAgent(researchRequests.prepareBaseline)}
                >
                  准备一个实验 <Icon name="arrow-right" />
                </Button>
              </div>
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
                  Research
                  {message.mode === "faux" && <span>离线演示</span>}
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
                Research {chatMode === "faux" && <span>离线演示</span>}
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
              overview={researchState.overview}
              onReviewPlan={setReviewPlanId}
              onAskAgent={onAskAgent}
              onOpenResearch={onOpenResearch}
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
              <Button
                variant="default"
                type="button"

                onClick={onCompact}
              >
                压缩已完成讨论
              </Button>
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
        <ResearchActivity
          connected={connected}
          state={researchState}
          openId={reviewPlanId}
          onOpenIdChange={setReviewPlanId}
          onOpenResearch={onOpenResearch}
          onAskAgent={onAskAgent}
        />
        {attachments.length > 0 && (
          <div className="composer-attachments">
            {attachments.map((file) => (
              <span className="attachment-chip" key={file.path}>
                <span className="attachment-mark">文</span>
                <span className="attachment-name">{file.name}</span>
                <small>{Math.max(1, Math.round(file.size / 1024))} KB</small>
                <IconButton
                  type="button"
                  aria-label={`移除 ${file.name}`}
                  onClick={() => onRemoveAttachment(file.path)}
                >
                  <Icon name="x" size={14} />
                </IconButton>
              </span>
            ))}
          </div>
        )}
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            submitChat();
          }}
        >
          <div className="composer-tools">
            <Button
              type="button"
              variant="ghost"
              disabled={attachmentBusy}
              onClick={onAttach}
            >
              <Icon name="paperclip" />
              {attachmentBusy ? "添加中…" : "附件"}
            </Button>
            <Popover
              ariaLabel="Agent 权限"
              kind="dialog"
              side="top"
              panelClassName="permission-menu"
              onOpenChange={(open) => {
                if (open)
                  setPermissionDraft(
                    agentConfig?.permissionLevel ?? "workspace-write"
                  );
              }}
              label={
                <>
                  <Icon name="shield" />
                  <span className="ui-control-label">{permissionLabel}</span>
                </>
              }
            >
              {(close) => (
                <>
                  <div className="ui-menu-header">
                    <strong>Agent 权限</strong>
                  </div>
                  <PermissionPicker
                    value={permissionDraft}
                    onChange={setPermissionDraft}
                    disabled={permissionBusy}
                  />
                  <div className="ui-menu-footer">
                    <Button type="button" variant="default" onClick={close}>
                      取消
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      disabled={permissionBusy}
                      onClick={() => {
                        onQuickPermissions(permissionDraft);
                        close();
                      }}
                    >
                      {permissionBusy ? "保存中…" : "应用"}
                    </Button>
                  </div>
                </>
              )}
            </Popover>
            <ModelPicker
              value={modelLabel}
              onChange={onQuickModel}
              onOpenSettings={onOpenSettings}
              side="top"
              ariaLabel="输入区选择模型"
            />
          </div>

          <textarea
            className="composer-input"
            rows={2}
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder="描述研究任务…"
            disabled={chatRunning || !connected}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                event.nativeEvent.keyCode !== 229
              ) {
                event.preventDefault();
                submitChat();
              }
            }}
            aria-label="给 Research Agent 发消息"
          />
          <div className="composer-footer">
            {attachments.length > 0 && <span>{attachments.length} 个附件</span>}
            <div className="composer-actions">
              {chatRunning && (
                <Button
                  variant="default"
                  type="button"
                  className=" stop-button"
                  onClick={onStop}
                >
                  停止
                </Button>
              )}
              <IconButton
                variant="primary"
                className="composer-send"
                type="submit"
                disabled={
                  chatRunning ||
                  !connected ||
                  (chatInput.trim().length === 0 && attachments.length === 0)
                }
                aria-label="发送"
              >
                <Icon name="arrow-up" />
              </IconButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
