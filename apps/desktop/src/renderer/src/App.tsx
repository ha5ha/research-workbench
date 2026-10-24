import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RpcEvent, SkillRunResult } from "@research-workbench/contracts";
import { CodeWorkbench } from "./CodeWorkbench";
import { ExperimentRecords } from "./ExperimentRecords";

type View = "chat" | "status" | "records" | "code";
type CoreStatus = {
  state: "starting" | "online" | "stopped" | "error";
  message: string;
};
type SkillInfo = {
  id: string;
  name: string;
  description: string;
  version: string;
  status: "runnable" | "planned" | "disabled";
  allowedTools: string[];
  lastReviewed: string;
};
type ActionInfo = {
  id: string;
  title: string;
  risk: string;
  approval: string;
};
type Observation = {
  summary: string;
  facts: string[];
  artifactCount: number;
  actions: ActionInfo[];
};
type Hello = {
  name: string;
  version: string;
  workspaceRoot: string;
  capabilities: string[];
};
type PiResult = {
  text: string;
  toolNames: string[];
  toolCallAttempts: string[];
  blockedTools: string[];
  artifacts: Array<{ path: string; id: string; sha256: string }>;
  sessionFile: string | null;
  systemPrompts: string[];
  eventTypes: string[];
};
type AgentChatResult = {
  text: string;
  mode: "faux" | "deepseek";
  sessionFile: string | null;
};
type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  mode?: "faux" | "deepseek";
};
type ApprovalRequest = {
  id: string;
  toolName: string;
  title: string;
  detail: string;
  consequence?: string;
};

const SCOPE = {
  projectId: "project-demo",
  questionId: "Q-01",
  taskId: "T-02"
};

const TABS: Array<{ id: View; label: string }> = [
  { id: "chat", label: "对话" },
  { id: "status", label: "状态" },
  { id: "records", label: "实验记录" }
];

const TREE = [
  { title: "数据增强能稳定改善跨域表现吗？", kind: "question", active: false },
  { title: "建立匹配基线", kind: "task", active: false },
  { title: "三种子配对验证", kind: "task", active: true },
  { title: "验证增强强度边界", kind: "task", active: false },
  { title: "改善是否集中在少数困难样本？", kind: "question", active: false },
  { title: "逐样本差异分析", kind: "task", active: false },
  { title: "异常子组复核", kind: "task", active: false }
];

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

export default function App() {
  const [view, setView] = useState<View>("chat");
  const [navOpen, setNavOpen] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(
    () => localStorage.getItem("rw.sidebar.left") === "1"
  );
  const [rightCollapsed, setRightCollapsed] = useState(
    () => localStorage.getItem("rw.sidebar.right") === "1"
  );
  const rightBeforeCode = useRef<boolean | null>(null);
  const [status, setStatus] = useState<CoreStatus>({
    state: "starting",
    message: "正在连接 Core"
  });
  const [hello, setHello] = useState<Hello | null>(null);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [observation, setObservation] = useState<Observation | null>(null);
  const [events, setEvents] = useState<RpcEvent[]>([]);
  const [result, setResult] = useState<SkillRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [piResult, setPiResult] = useState<PiResult | null>(null);
  const [piRunning, setPiRunning] = useState(false);
  const [piError, setPiError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatRunning, setChatRunning] = useState(false);
  const [chatStream, setChatStream] = useState("");
  const [chatMode, setChatMode] = useState<"faux" | "deepseek" | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [codeOpenPath, setCodeOpenPath] = useState<{
    path: string;
    nonce: number;
  } | null>(null);
  const [recordCount, setRecordCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("rw.sidebar.left", leftCollapsed ? "1" : "0");
  }, [leftCollapsed]);

  useEffect(() => {
    localStorage.setItem("rw.sidebar.right", rightCollapsed ? "1" : "0");
  }, [rightCollapsed]);

  useEffect(() => {
    if (view === "code") {
      if (rightBeforeCode.current === null) {
        rightBeforeCode.current = rightCollapsed;
        setRightCollapsed(true);
      }
    } else if (rightBeforeCode.current !== null) {
      setRightCollapsed(rightBeforeCode.current);
      rightBeforeCode.current = null;
    }
  }, [view]);

  const loadCore = useCallback(async () => {
    setError(null);
    try {
      const [nextHello, nextSkills, nextObservation, experiments] =
        await Promise.all([
          window.rw.request<Hello>("system.hello"),
          window.rw.request<{ skills: SkillInfo[] }>("skills.list"),
          window.rw.request<Observation>("domain.observe", { scope: SCOPE }),
          window.rw.request<unknown[]>("experiments.list")
        ]);
      setHello(nextHello);
      setSkills(nextSkills.skills);
      setObservation(nextObservation);
      setRecordCount(experiments.length);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Core 连接失败"
      );
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const offEvent = window.rw.onEvent((event) => {
      if (!alive) return;
      if (event.params.type === "agent.delta") {
        const payload = event.params.payload as { text?: string };
        if (payload.text) {
          setChatStream((current) => current + payload.text);
        }
        return;
      }
      if (event.params.type === "agent.approval-required") {
        setApproval(event.params.payload as ApprovalRequest);
        setApprovalError(null);
      }
      if (
        event.params.type === "agent.approval-resolved" ||
        event.params.type === "agent.approval-timeout"
      ) {
        setApproval(null);
      }
      setEvents((current) => [...current, event].slice(-12));
      if (event.params.type === "experiment.completed") {
        setRecordCount((current) => current + 1);
      }
      if (event.params.type === "skill.failed") {
        const payload = event.params.payload as { message?: string };
        setError(payload.message ?? "Skill 执行失败");
      }
    });
    const offStatus = window.rw.onStatus((next) => {
      if (alive) setStatus(next);
    });

    void window.rw.status().then((next) => {
      if (alive && next) setStatus(next);
    });
    void loadCore();

    return () => {
      alive = false;
      offEvent();
      offStatus();
    };
  }, [loadCore]);

  const runProfile = async () => {
    setRunning(true);
    setError(null);
    try {
      const next = await window.rw.request<SkillRunResult>("skills.run", {
        skillId: "data-profile",
        input: {
          scope: SCOPE,
          artifacts: [],
          params: { path: "data.csv" }
        }
      });
      setResult(next);
      setView("chat");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Skill 执行失败");
    } finally {
      setRunning(false);
    }
  };

  const runPiSpike = async () => {
    setPiRunning(true);
    setPiError(null);
    try {
      const next = await window.rw.request<PiResult>("agent.spike", {
        scope: SCOPE
      });
      setPiResult(next);
    } catch (spikeError) {
      setPiError(
        spikeError instanceof Error ? spikeError.message : "pi spike 失败"
      );
    } finally {
      setPiRunning(false);
    }
  };

  const sendChat = async () => {
    const prompt = chatInput.trim();
    if (!prompt || chatRunning) return;
    setChatMessages((current) => [
      ...current,
      { role: "user", text: prompt }
    ]);
    setChatInput("");
    setChatStream("");
    setChatError(null);
    setChatRunning(true);
    try {
      const result = await window.rw.request<AgentChatResult>("agent.chat", {
        prompt,
        scope: SCOPE
      });
      setChatMode(result.mode);
      setChatMessages((current) => [
        ...current,
        { role: "assistant", text: result.text, mode: result.mode }
      ]);
    } catch (chatFailure) {
      setChatError(
        chatFailure instanceof Error ? chatFailure.message : "Agent 对话失败"
      );
    } finally {
      setChatStream("");
      setChatRunning(false);
    }
  };

  const respondApproval = async (approved: boolean) => {
    if (!approval || approvalBusy) return;
    setApprovalBusy(true);
    setApprovalError(null);
    try {
      await window.rw.request("approval.respond", {
        id: approval.id,
        approved
      });
      setApproval(null);
    } catch (failure) {
      setApprovalError(
        failure instanceof Error ? failure.message : "审批响应失败"
      );
    } finally {
      setApprovalBusy(false);
    }
  };

  const online = status.state === "online";
  const runnableSkills = useMemo(
    () => skills.filter((skill) => skill.status === "runnable"),
    [skills]
  );

  const toggleCodeFocus = () => {
    if (leftCollapsed && rightCollapsed) {
      setLeftCollapsed(false);
      setRightCollapsed(false);
    } else {
      setLeftCollapsed(true);
      setRightCollapsed(true);
    }
  };

  const openInIde = (path: string) => {
    setCodeOpenPath({ path, nonce: Date.now() });
    setView("code");
  };

  return (
    <div className={`app-shell ${leftCollapsed ? "left-collapsed" : ""}`}>
      <aside className={`sidebar ${navOpen ? "open" : ""}`} aria-label="研究导航">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ★
          </span>
          <strong>Research</strong>
          <span className="version-pill">0.1</span>
          <button
            type="button"
            className="sidebar-collapse"
            aria-label="收起左侧研究导航"
            title="收起左侧栏"
            onClick={() => {
              setLeftCollapsed(true);
              setNavOpen(false);
            }}
          >
            ‹
          </button>
        </div>

        <button className="new-chat" type="button" disabled>
          <span>＋</span> 新对话
        </button>

        <div className="project-row">
          <button
            type="button"
            className="project-main"
            onClick={() => setView("chat")}
          >
            <span className="project-mark">R</span>
            <span className="project-copy">
              <strong>小样本分类的泛化研究</strong>
              <small>本地工作区</small>
            </span>
          </button>
          <button
            type="button"
            className="project-code"
            title="打开项目 IDE"
            aria-label="打开项目 IDE"
            onClick={() => setView("code")}
          >
            {"</>"}
          </button>
        </div>

        <div className="side-links">
          <span className="side-link active">课题概览</span>
          <span className="side-link">材料 <b>5</b></span>
        </div>

        <div className="side-heading">
          <span>研究路径</span>
          <button type="button" className="icon-quiet" disabled>
            +
          </button>
        </div>

        <nav className="tree" aria-label="研究路径">
          {TREE.map((item) => (
            <div
              className={`tree-row ${item.kind} ${item.active ? "selected" : ""}`}
              key={item.title}
            >
              <span className="tree-dot" />
              <span>{item.title}</span>
            </div>
          ))}
        </nav>

        <div className="side-heading session-heading">
          <span>当前节点的对话</span>
          <button type="button" className="icon-quiet" disabled>
            +
          </button>
        </div>
        <div className="session-list">
          <div className="session-row selected">本轮分析与下一步</div>
          <div className="session-row">检查子组异常与证据范围</div>
          <div className="session-row">重复分析与口径</div>
        </div>

        <div className="sidebar-footer">
          <span className="footer-dot" />
          本地示例
          <span className="footer-meta">Phase 1</span>
        </div>
      </aside>

      {leftCollapsed && (
        <button
          type="button"
          className="collapsed-handle left-handle"
          aria-label="展开左侧研究导航"
          title="展开左侧栏"
          onClick={() => setLeftCollapsed(false)}
        >
          ›
        </button>
      )}

      <main className="main">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu"
            aria-label="打开研究导航"
            onClick={() => {
              setLeftCollapsed(false);
              setNavOpen(true);
            }}
          >
            ☰
          </button>
          <div className="breadcrumb">
            <span>小样本分类的泛化研究</span>
            <span className="slash">/</span>
            <span>数据增强能稳定改善跨域表现吗？</span>
            <span className="slash">/</span>
            <strong>三种子配对验证</strong>
          </div>
          <div className="topbar-right">
            <div className="view-tabs" role="tablist" aria-label="工作区视图">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={view === tab.id}
                  className={view === tab.id ? "selected" : ""}
                  onClick={() => {
                    setView(tab.id);
                    setNavOpen(false);
                  }}
                >
                  {tab.label}
                  {tab.id === "records" && recordCount > 0 && (
                    <span className="tab-count">{recordCount}</span>
                  )}
                </button>
              ))}
            </div>
            <span
              className={`connection ${status.state}`}
              title={status.message}
            >
              <i />
              {status.state === "online"
                ? "Core 已连接"
                : status.state === "error"
                  ? "Core 异常"
                  : "连接中"}
            </span>
          </div>
        </header>

        {navOpen && (
          <button
            type="button"
            className="nav-backdrop"
            aria-label="关闭研究导航"
            onClick={() => setNavOpen(false)}
          />
        )}

        <div
          className={`workspace ${rightCollapsed ? "right-collapsed" : ""}`}
        >
          <section className="center">
            {view === "chat" && (
              <ChatView
                result={result}
                running={running}
                error={error}
                runProfile={runProfile}
                piResult={piResult}
                piRunning={piRunning}
                piError={piError}
                runPiSpike={runPiSpike}
                chatMessages={chatMessages}
                chatInput={chatInput}
                setChatInput={setChatInput}
                chatRunning={chatRunning}
                chatStream={chatStream}
                chatMode={chatMode}
                chatError={chatError}
                sendChat={sendChat}
                refresh={loadCore}
              />
            )}
            {view === "status" && (
              <StatusView
                observation={observation}
                skills={skills}
                refresh={loadCore}
              />
            )}
            {view === "records" && (
              <ExperimentRecords
                onOpenInIde={openInIde}
                onLocateConversation={() => setView("chat")}
              />
            )}
            {view === "code" && (
              <CodeWorkbench
                focus={leftCollapsed && rightCollapsed}
                onToggleFocus={toggleCodeFocus}
                openPathRequest={codeOpenPath}
              />
            )}
          </section>

          <aside className="inspector" aria-label="研究状态">
            <div className="inspector-heading">
              <div>
                <span className="eyebrow">研究状态</span>
                <h2>当前节点</h2>
              </div>
              <div className="inspector-heading-actions">
                <span className={`status-dot ${status.state}`} />
                <button
                  type="button"
                  className="sidebar-collapse"
                  aria-label="收起右侧研究状态"
                  title="收起右侧栏"
                  onClick={() => setRightCollapsed(true)}
                >
                  ›
                </button>
              </div>
            </div>

            <section className="inspector-section">
              <div className="inspector-title">
                <h3>Core</h3>
                <span className={`tag ${online ? "green" : "amber"}`}>
                  {online ? "在线" : "等待"}
                </span>
              </div>
              <dl className="facts-list">
                <div>
                  <dt>工作区</dt>
                  <dd className="mono wrap">
                    {hello?.workspaceRoot ?? "等待 Core 返回"}
                  </dd>
                </div>
                <div>
                  <dt>技能</dt>
                  <dd>{skills.length} 个</dd>
                </div>
                <div>
                  <dt>可执行</dt>
                  <dd>{runnableSkills.length} 个</dd>
                </div>
              </dl>
            </section>

            <section className="inspector-section">
              <div className="inspector-title">
                <h3>Skills</h3>
                <span className="muted">v0.1</span>
              </div>
              <div className="skill-list">
                {skills.length === 0 && (
                  <div className="empty-note">尚未读取到 skill。</div>
                )}
                {skills.map((skill) => (
                  <div className="skill-row" key={skill.id}>
                    <div>
                      <strong>{skill.id}</strong>
                      <small>{skill.description}</small>
                    </div>
                    <span
                      className={`tag ${skill.status === "runnable" ? "green" : "amber"}`}
                    >
                      {skill.status === "runnable" ? "可执行" : "计划中"}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="inspector-section">
              <div className="inspector-title">
                <h3>事件</h3>
                <span className="muted">{events.length}</span>
              </div>
              <div className="event-list">
                {events.length === 0 && (
                  <div className="empty-note">运行 skill 后这里会出现事件。</div>
                )}
                {events
                  .slice()
                  .reverse()
                  .map((event) => (
                    <div className="event-row" key={event.params.seq}>
                      <span className="event-seq">{event.params.seq}</span>
                      <div>
                        <strong>{event.params.type}</strong>
                        <small>
                          {new Date(event.params.at).toLocaleTimeString("zh-CN", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit"
                          })}
                        </small>
                      </div>
                    </div>
                  ))}
              </div>
            </section>

            <div className="inspector-note">
              <strong>Phase 1</strong>
              <p>
                代码工作面、终端与写文件审批已接通。任务书、受管运行、
                SQLite 归档与 diff 尚未接入。
              </p>
            </div>
          </aside>
        </div>

        {rightCollapsed && (
          <button
            type="button"
            className="collapsed-handle right-handle"
            aria-label="展开右侧研究状态"
            title="展开右侧栏"
            onClick={() => setRightCollapsed(false)}
          >
            ‹
          </button>
        )}
      </main>

      {approval && (
        <div className="approval-backdrop">
          <div
            className="approval-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-title"
          >
            <span className="eyebrow">需要你的批准</span>
            <h2 id="approval-title">{approval.title}</h2>
            <p>{approval.detail}</p>
            <div className="approval-meta">
              <span>工具</span>
              <code>{approval.toolName}</code>
              <span>后果</span>
              <span>
                {approval.consequence ??
                  "写入研究 artifact，不修改原始数据"}
              </span>
            </div>
            {approvalError && (
              <div className="error-card" role="alert">
                <p>{approvalError}</p>
              </div>
            )}
            <div className="approval-actions">
              <button
                type="button"
                className="quiet-button"
                disabled={approvalBusy}
                onClick={() => void respondApproval(false)}
              >
                拒绝
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={approvalBusy}
                onClick={() => void respondApproval(true)}
              >
                {approvalBusy ? "处理中…" : "批准写入"}
              </button>
            </div>
            <p className="approval-note">
              Agent 不能替你做这个决定。超时或拒绝时工具不会执行。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ChatView(props: {
  result: SkillRunResult | null;
  running: boolean;
  error: string | null;
  runProfile: () => Promise<void>;
  piResult: PiResult | null;
  piRunning: boolean;
  piError: string | null;
  runPiSpike: () => Promise<void>;
  chatMessages: ChatMessage[];
  chatInput: string;
  setChatInput: (value: string) => void;
  chatRunning: boolean;
  chatStream: string;
  chatMode: "faux" | "deepseek" | null;
  chatError: string | null;
  sendChat: () => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const {
    result,
    running,
    error,
    runProfile,
    piResult,
    piRunning,
    piError,
    runPiSpike,
    chatMessages,
    chatInput,
    setChatInput,
    chatRunning,
    chatStream,
    chatMode,
    chatError,
    sendChat,
    refresh
  } = props;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [chatMessages, chatStream, chatRunning]);

  return (
    <div className="chat-view">
      <div className="chat-scroll" ref={scrollRef}>
        <div className="message user">
          <div className="bubble">
            先对样例数据做一次画像，别把原始行塞进上下文。
          </div>
        </div>

        <div className="message assistant">
          <div className="message-meta">
            Research <span>Agent · Phase 1</span>
          </div>
          <div className="prose">
            这一步先验证最小科研链路：<strong>工作区文件 → 受控 Skill → 可追溯
            artifact</strong>。数据画像只返回形状、缺失和类型，不把单元格内容带进聊天。
          </div>

          <div className="card skill-card">
            <div className="card-header">
              <span className="card-icon">▦</span>
              <div>
                <strong>data-profile</strong>
                <small>CSV / TSV 画像 · 确定性执行</small>
              </div>
              <span className="tag green">可执行</span>
            </div>
            <div className="skill-meta">
              <span>输入：data.csv</span>
              <span>输出：JSON artifact</span>
              <span>不读取原始行内容</span>
            </div>
            <div className="card-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => void runProfile()}
                disabled={running}
              >
                {running ? "正在执行…" : "运行数据画像"}
              </button>
              <button
                type="button"
                className="quiet-button"
                onClick={() => void refresh()}
              >
                刷新连接
              </button>
            </div>
          </div>

          {error && (
            <div className="error-card" role="alert">
              <strong>执行失败</strong>
              <p>{error}</p>
            </div>
          )}

          {result && (
            <div className="card result-card">
              <div className="card-header">
                <span className="card-icon">↗</span>
                <div>
                  <strong>数据画像结果</strong>
                  <small>
                    {result.skillId} · v{result.version}
                  </small>
                </div>
                <span className="tag green">完成</span>
              </div>
              <p className="result-summary">{result.summary}</p>
              {result.warnings.length > 0 && (
                <ul className="warning-list">
                  {result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
              {result.artifacts.map((artifact) => (
                <div className="artifact-row" key={artifact.id}>
                  <span className="file-mark">JSON</span>
                  <div>
                    <strong>{artifact.path}</strong>
                    <small>
                      {artifact.size} B · {artifact.sha256.slice(0, 12)}…
                    </small>
                  </div>
                </div>
              ))}
              <div className="card-note">
                这是数据画像，不是数据清洗，也不构成科学结论。
              </div>
            </div>
          )}

          <div className="card pi-card">
            <div className="card-header">
              <span className="card-icon">π</span>
              <div>
                <strong>pi 运行时验证</strong>
                <small>faux model · 自定义工具 · 不调用网络</small>
              </div>
              <span className="tag amber">spike</span>
            </div>
            <div className="skill-meta">
              <span>系统提示注入</span>
              <span>自定义工具循环</span>
              <span>未授权工具拦截</span>
              <span>会话文件持久化</span>
            </div>
            <div className="card-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => void runPiSpike()}
                disabled={piRunning}
              >
                {piRunning ? "正在运行 pi…" : "运行 pi 工具循环"}
              </button>
            </div>

            {piError && (
              <div className="error-card" role="alert">
                <strong>pi spike 失败</strong>
                <p>{piError}</p>
              </div>
            )}

            {piResult && (
              <div className="pi-result">
                <p className="result-summary">{piResult.text}</p>
                <dl className="pi-facts">
                  <div>
                    <dt>工具调用</dt>
                    <dd className="mono">
                      {piResult.toolNames.join(", ") || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>被拦截</dt>
                    <dd className="mono">
                      {piResult.blockedTools.join(", ") || "无"}
                    </dd>
                  </div>
                  <div>
                    <dt>Session</dt>
                    <dd className="mono wrap">
                      {piResult.sessionFile ?? "in-memory"}
                    </dd>
                  </div>
                  <div>
                    <dt>Artifact</dt>
                    <dd className="mono wrap">
                      {piResult.artifacts[0]?.path ?? "无"}
                    </dd>
                  </div>
                </dl>
                <div className="card-note">
                  pi 已真实执行工具会话；当前使用 faux provider，真实模型接入仍在下一步。
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="live-chat">
          <div className="live-chat-heading">
            <span>pi 对话</span>
            <span
              className={`tag ${chatMode === "deepseek" ? "green" : "amber"}`}
            >
              {chatMode === "deepseek"
                ? "DeepSeek"
                : chatMode === "faux"
                  ? "faux demo"
                  : "待连接"}
            </span>
          </div>

          {chatMessages.length === 0 && !chatStream && !chatRunning && (
            <div className="empty-note">
              输入“画像 data.csv”验证工具链路；配置 `DEEPSEEK_API_KEY`
              后会走真实模型。
            </div>
          )}

          {chatMessages.map((message, index) =>
            message.role === "user" ? (
              <div className="live-user" key={`${message.role}-${index}`}>
                <span className="bubble">{message.text}</span>
              </div>
            ) : (
              <div
                className="live-assistant"
                key={`${message.role}-${index}`}
              >
                <div className="message-meta">
                  Research{" "}
                  <span>
                    {message.mode === "deepseek" ? "DeepSeek" : "faux"}
                  </span>
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
                Research{" "}
                <span>{chatMode === "deepseek" ? "DeepSeek" : "faux"}</span>
              </div>
              <div className="prose live-prose">
                {renderInline(chatStream)}
                <span className="stream-cursor">▍</span>
              </div>
            </div>
          )}

          {chatRunning && !chatStream && (
            <div className="empty-note">pi 正在处理…</div>
          )}

          {chatError && (
            <div className="error-card" role="alert">
              <strong>对话失败</strong>
              <p>{chatError}</p>
            </div>
          )}
        </div>
      </div>

      <div className="composer-wrap">
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            void sendChat();
          }}
        >
          <input
            className="composer-input"
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder="输入研究问题，或输入“画像 data.csv”"
            disabled={chatRunning}
            aria-label="给 Research Agent 发消息"
          />
          <div className="composer-footer">
            <span>{chatMode === "deepseek" ? "DeepSeek" : "faux demo"}</span>
            <span>工作区执行</span>
            <button
              className="composer-send"
              type="submit"
              disabled={chatRunning || chatInput.trim().length === 0}
              aria-label="发送"
            >
              ↑
            </button>
          </div>
        </form>
        <div className="composer-caption">
          {chatMode === "deepseek"
            ? "DeepSeek · 真实模型会话"
            : chatMode === "faux"
              ? "faux 演示 · 配置 DEEPSEEK_API_KEY 后切换到真实模型"
              : "首次对话后确认模型模式"}
        </div>
      </div>
    </div>
  );
}

function StatusView(props: {
  observation: Observation | null;
  skills: SkillInfo[];
  refresh: () => Promise<void>;
}) {
  const { observation, skills, refresh } = props;
  return (
    <div className="page-view">
      <div className="page-heading">
        <div>
          <span className="eyebrow">研究问题 · Q-01</span>
          <h1>数据增强能稳定改善跨域表现吗？</h1>
          <p>三种子配对验证 · 当前节点状态</p>
        </div>
        <button
          type="button"
          className="quiet-button"
          onClick={() => void refresh()}
        >
          刷新
        </button>
      </div>

      <div className="section-title">
        <h2>当前状态</h2>
        <span className="tag">内存示例</span>
      </div>
      <div className="fact-card">
        <p>{observation?.summary ?? "等待 Core 返回研究状态…"}</p>
        <ul>
          {observation?.facts.map((fact) => <li key={fact}>{fact}</li>)}
        </ul>
      </div>

      <div className="section-title">
        <h2>可执行动作</h2>
        <span className="muted">{observation?.actions.length ?? 0}</span>
      </div>
      <div className="action-grid">
        {observation?.actions.map((action) => (
          <div className="action-card" key={action.id}>
            <div>
              <strong>{action.title}</strong>
              <code>{action.id}</code>
            </div>
            <div className="action-tags">
              <span className="tag">{action.risk}</span>
              <span className="tag amber">
                {action.approval === "required" ? "需审批" : "自动"}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="section-title">
        <h2>已注册 Skills</h2>
        <span className="muted">{skills.length}</span>
      </div>
      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>版本</th>
              <th>状态</th>
              <th>工具</th>
            </tr>
          </thead>
          <tbody>
            {skills.map((skill) => (
              <tr key={skill.id}>
                <td>
                  <strong>{skill.id}</strong>
                  <small>{skill.description}</small>
                </td>
                <td className="mono">v{skill.version}</td>
                <td>
                  <span
                    className={`tag ${skill.status === "runnable" ? "green" : "amber"}`}
                  >
                    {skill.status}
                  </span>
                </td>
                <td className="mono">{skill.allowedTools.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
