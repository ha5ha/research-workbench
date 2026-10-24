import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RpcEvent, SkillRunResult } from "@research-workbench/contracts";
import { CodeWorkbench } from "./CodeWorkbench";
import { ComboBox, Segmented, Switch } from "./Controls";
import { ExperimentRecords } from "./ExperimentRecords";

type View = "chat" | "status" | "records";
type AppSettings = {
  hasApiKey: boolean;
  apiKeySource: "saved" | "env" | "none";
  provider: "deepseek" | "openai-compatible";
  baseUrl: string;
  model: string;
  workspace: string;
  isDefaultWorkspace: boolean;
  gitBinary: string;
  autoCommit: boolean;
};
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
  mode: "faux" | "deepseek" | "openai";
  sessionFile: string | null;
};
type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  mode?: "faux" | "deepseek" | "openai";
};
type ApprovalRequest = {
  id: string;
  toolName: string;
  title: string;
  detail: string;
  consequence?: string;
};
type ResearchTask = {
  id: string;
  title: string;
  status: "todo" | "active" | "done";
};
type ResearchQuestion = {
  id: string;
  title: string;
  tasks: ResearchTask[];
};

const TABS: Array<{ id: View; label: string }> = [
  { id: "chat", label: "对话" },
  { id: "status", label: "状态" },
  { id: "records", label: "实验记录" }
];

function projectNameFromRoot(root: string | null): string {
  if (!root) return "未命名研究";
  const name = root.split(/[\\/]/).filter(Boolean).at(-1) ?? "未命名研究";
  return name === "workspace" ? "未命名研究" : decodeURIComponent(name);
}

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
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [questions, setQuestions] = useState<ResearchQuestion[]>([]);
  const [expandedQuestions, setExpandedQuestions] = useState<
    Record<string, boolean>
  >({});
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [newQuestionOpen, setNewQuestionOpen] = useState(false);
  const [newQuestionTitle, setNewQuestionTitle] = useState("");
  const [newTaskFor, setNewTaskFor] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [researchBusy, setResearchBusy] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(
    () => localStorage.getItem("rw.sidebar.left") === "1"
  );
  const [rightCollapsed, setRightCollapsed] = useState(
    () => localStorage.getItem("rw.sidebar.right") === "1"
  );
  const [ideOpen, setIdeOpen] = useState(false);
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
  const [chatMode, setChatMode] = useState<
    "faux" | "deepseek" | "openai" | null
  >(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [codeOpenPath, setCodeOpenPath] = useState<{
    path: string;
    nonce: number;
  } | null>(null);
  const [recordCount, setRecordCount] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectName = projectNameFromRoot(hello?.workspaceRoot ?? null);
  const selectedTaskRecord =
    questions
      .flatMap((question) => question.tasks)
      .find((task) => task.id === selectedTask) ?? null;
  const selectedQuestion =
    questions.find((question) =>
      question.tasks.some((task) => task.id === selectedTask)
    ) ?? null;
  const scope = useMemo(
    () => ({
      projectId: "local",
      questionId: selectedQuestion?.id,
      taskId: selectedTaskRecord?.id
    }),
    [selectedQuestion?.id, selectedTaskRecord?.id]
  );

  useEffect(() => {
    localStorage.setItem("rw.sidebar.left", leftCollapsed ? "1" : "0");
  }, [leftCollapsed]);

  useEffect(() => {
    localStorage.setItem("rw.sidebar.right", rightCollapsed ? "1" : "0");
  }, [rightCollapsed]);

  useEffect(() => {
    if (!projectMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!projectMenuRef.current?.contains(event.target as Node)) {
        setProjectMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [projectMenuOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "e"
      ) {
        event.preventDefault();
        setIdeOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const loadCore = useCallback(async () => {
    setError(null);
    try {
      const [nextHello, nextSkills, nextObservation, experiments, nextQuestions] =
        await Promise.all([
          window.rw.request<Hello>("system.hello"),
          window.rw.request<{ skills: SkillInfo[] }>("skills.list"),
          window.rw.request<Observation>("domain.observe", {
            scope: { projectId: "local" }
          }),
          window.rw.request<unknown[]>("experiments.list"),
          window.rw.request<ResearchQuestion[]>("research.tree")
        ]);
      setHello(nextHello);
      setSkills(nextSkills.skills);
      setObservation(nextObservation);
      setRecordCount(experiments.length);
      setQuestions(nextQuestions);
      setExpandedQuestions((current) => {
        const next = { ...current };
        for (const question of nextQuestions) {
          if (next[question.id] === undefined) next[question.id] = true;
        }
        return next;
      });
      setSelectedTask((current) => {
        if (current && nextQuestions.some((question) =>
          question.tasks.some((task) => task.id === current)
        )) {
          return current;
        }
        return (
          nextQuestions.flatMap((question) => question.tasks)[0]?.id ?? null
        );
      });
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
      if (event.params.type === "experiments.changed") {
        const payload = event.params.payload as { count?: number };
        if (typeof payload.count === "number") {
          setRecordCount(payload.count);
        }
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
          scope,
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
        scope
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
        scope
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

  const openInIde = (path: string) => {
    setCodeOpenPath({ path, nonce: Date.now() });
    setIdeOpen(true);
  };

  const startNewChat = () => {
    setChatMessages([]);
    setChatStream("");
    setChatInput("");
    setChatError(null);
    setChatMode(null);
    setView("chat");
    setNavOpen(false);
  };

  const createQuestion = async () => {
    const title = newQuestionTitle.trim();
    if (!title || researchBusy) return;
    setResearchBusy(true);
    try {
      const result = await window.rw.request<{
        question: ResearchQuestion;
        questions: ResearchQuestion[];
      }>("research.createQuestion", { title });
      setQuestions(result.questions);
      setExpandedQuestions((current) => ({
        ...current,
        [result.question.id]: true
      }));
      setNewQuestionOpen(false);
      setNewQuestionTitle("");
      setNewTaskFor(result.question.id);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "创建研究问题失败"
      );
    } finally {
      setResearchBusy(false);
    }
  };

  const createTask = async (questionId: string) => {
    const title = newTaskTitle.trim();
    if (!title || researchBusy) return;
    setResearchBusy(true);
    try {
      const result = await window.rw.request<{
        task: ResearchTask;
        questions: ResearchQuestion[];
      }>("research.createTask", { questionId, title });
      setQuestions(result.questions);
      setExpandedQuestions((current) => ({
        ...current,
        [questionId]: true
      }));
      setSelectedTask(result.task.id);
      setNewTaskFor(null);
      setNewTaskTitle("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "创建任务失败");
    } finally {
      setResearchBusy(false);
    }
  };

  const openProjectDirectory = async () => {
    setProjectMenuOpen(false);
    try {
      const result = await window.rw.chooseWorkspace();
      if (result.canceled) return;
      // Main restarts Core and reloads the window after the switch.
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "打开项目目录失败"
      );
    }
  };

  if (ideOpen) {
    return (
      <>
        <div className="ide-window">
          <CodeWorkbench
            openPathRequest={codeOpenPath}
            workspaceRoot={hello?.workspaceRoot ?? null}
            onBack={() => setIdeOpen(false)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>
        <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      </>
    );
  }

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

        <div className="project-switcher" ref={projectMenuRef}>
          <button
            type="button"
            className="project-trigger"
            aria-haspopup="menu"
            aria-expanded={projectMenuOpen}
            onClick={() => setProjectMenuOpen((open) => !open)}
          >
            <span className="project-mark">R</span>
            <span className="project-copy">
              <strong>{projectName}</strong>
              <small>研究项目</small>
            </span>
            <svg
              className={`project-chevron ${projectMenuOpen ? "open" : ""}`}
              width="10"
              height="6"
              viewBox="0 0 10 6"
              aria-hidden="true"
            >
              <path
                d="m1 1 4 4 4-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="project-ide"
            onClick={() => {
              setProjectMenuOpen(false);
              setIdeOpen(true);
            }}
            title="打开项目 IDE（Ctrl/⌘ E）"
          >
            <span className="project-ide-glyph">{"</>"}</span>
            <span>打开项目 IDE</span>
            <kbd>Ctrl E</kbd>
          </button>

          {projectMenuOpen && (
            <div className="project-menu" role="menu">
              <div className="project-menu-label">当前项目</div>
              <div className="project-menu-current">
                <span className="project-mark">R</span>
                <span>
                  <strong>{projectName}</strong>
                  <small>研究项目</small>
                </span>
              </div>
              <div className="project-menu-divider" />
              <button
                type="button"
                role="menuitem"
                onClick={() => void openProjectDirectory()}
              >
                打开项目目录…
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setProjectMenuOpen(false);
                  setIdeOpen(true);
                }}
              >
                项目 IDE
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setProjectMenuOpen(false);
                  setSettingsOpen(true);
                }}
              >
                Agent 设置
              </button>
            </div>
          )}
        </div>

        <button className="new-chat" type="button" onClick={startNewChat}>
          <span>＋</span> 新对话
        </button>

        <div className="side-heading">
          <span>研究路径</span>
          <div className="side-heading-actions">
            <span className="side-heading-count">
              {questions.length} 问题 ·{" "}
              {questions.reduce(
                (sum, question) => sum + question.tasks.length,
                0
              )}{" "}
              任务
            </span>
            <button
              type="button"
              className="icon-quiet"
              title="新建研究问题"
              aria-label="新建研究问题"
              onClick={() => {
                setNewQuestionOpen((open) => !open);
                setNewQuestionTitle("");
              }}
            >
              +
            </button>
          </div>
        </div>

        {newQuestionOpen && (
          <form
            className="sidebar-form"
            onSubmit={(event) => {
              event.preventDefault();
              void createQuestion();
            }}
          >
            <input
              autoFocus
              value={newQuestionTitle}
              placeholder="研究问题…"
              onChange={(event) => setNewQuestionTitle(event.target.value)}
            />
            <button
              type="submit"
              disabled={researchBusy || !newQuestionTitle.trim()}
            >
              添加
            </button>
          </form>
        )}

        <nav className="tree" aria-label="研究路径">
          {questions.length === 0 && !newQuestionOpen && (
            <div className="sidebar-empty">
              <strong>还没有研究问题</strong>
              <p>从当前项目建立第一个研究问题。</p>
              <button
                type="button"
                onClick={() => setNewQuestionOpen(true)}
              >
                新建研究问题
              </button>
            </div>
          )}

          {questions.map((question) => {
            const expanded = expandedQuestions[question.id] ?? true;
            return (
              <div className="tree-group" key={question.id}>
                <button
                  type="button"
                  className="tree-question"
                  aria-expanded={expanded}
                  onClick={() =>
                    setExpandedQuestions((current) => ({
                      ...current,
                      [question.id]: !expanded
                    }))
                  }
                >
                  <span
                    className={`tree-chevron ${expanded ? "open" : ""}`}
                  >
                    ›
                  </span>
                  <span className="tree-qid">{question.id}</span>
                  <span className="tree-qtitle">{question.title}</span>
                  <span className="tree-qcount">
                    {question.tasks.length}
                  </span>
                </button>
                {expanded && (
                  <div className="tree-children">
                    {question.tasks.map((task) => (
                      <button
                        type="button"
                        key={task.id}
                        className={`tree-task ${task.status} ${
                          selectedTask === task.id ? "selected" : ""
                        }`}
                        onClick={() => {
                          setSelectedTask(task.id);
                          setView("chat");
                        }}
                      >
                        <span className="tree-task-dot" />
                        <span className="tree-task-title">{task.title}</span>
                        {selectedTask === task.id && (
                          <span className="tree-current">当前</span>
                        )}
                      </button>
                    ))}

                    {newTaskFor === question.id ? (
                      <form
                        className="sidebar-form tree-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void createTask(question.id);
                        }}
                      >
                        <input
                          autoFocus
                          value={newTaskTitle}
                          placeholder="任务标题…"
                          onChange={(event) =>
                            setNewTaskTitle(event.target.value)
                          }
                        />
                        <button
                          type="submit"
                          disabled={researchBusy || !newTaskTitle.trim()}
                        >
                          添加
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="tree-add-task"
                        onClick={() => {
                          setNewTaskFor(question.id);
                          setNewTaskTitle("");
                        }}
                      >
                        ＋ 添加任务
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="settings-entry"
            title="Agent 设置"
            onClick={() => setSettingsOpen(true)}
          >
            <span className="settings-entry-icon" aria-hidden="true">
              ⚙
            </span>
            <span className="settings-entry-copy">
              <strong>Agent 设置</strong>
              <small>模型、Key、Git 与工作目录</small>
            </span>
            <span className="settings-entry-arrow" aria-hidden="true">
              ›
            </span>
          </button>
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
            <span>{projectName}</span>
            {selectedQuestion && (
              <>
                <span className="slash">/</span>
                <span>{selectedQuestion.title}</span>
              </>
            )}
            {selectedTaskRecord && (
              <>
                <span className="slash">/</span>
                <strong>{selectedTaskRecord.title}</strong>
              </>
            )}
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
          </section>

          <aside className="inspector" aria-label="研究状态">
            <div className="inspector-heading">
              <div>
                <span className="eyebrow">研究状态</span>
                <h2>项目状态</h2>
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
              <strong>下一步</strong>
              <p>
                意图分类回归、Python LSP、并排 Git diff 与实验结论编辑仍在推进。
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

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

const DEEPSEEK_MODELS = ["deepseek-flash", "deepseek-v4-pro"];
const OPENAI_COMPATIBLE_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1-mini",
  "qwen-plus",
  "qwen2.5-72b-instruct",
  "deepseek-chat",
  "llama-3.3-70b-versatile"
];

function SettingsDialog({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<"deepseek" | "openai-compatible">(
    "deepseek"
  );
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [model, setModel] = useState("deepseek-flash");
  const [gitBinary, setGitBinary] = useState("");
  const [autoCommit, setAutoCommit] = useState(false);
  const [busy, setBusy] = useState<
    "loading" | "save" | "clear" | "workspace" | "git" | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setApiKey("");
    setError(null);
    setMessage(null);
    setBusy("loading");
    void window.rw
      .getSettings()
      .then((next) => {
        setSettings(next);
        setProvider(next.provider);
        setBaseUrl(next.baseUrl);
        setModel(next.model);
        setGitBinary(next.gitBinary);
        setAutoCommit(next.autoCommit);
      })
      .catch((failure) =>
        setError(
          failure instanceof Error ? failure.message : "读取设置失败"
        )
      )
      .finally(() => setBusy(null));
  }, [open]);

  if (!open) return null;

  const saveProvider = async () => {
    if (!model.trim()) {
      setError("请选择或输入模型");
      return;
    }
    setBusy("save");
    setError(null);
    setMessage(null);
    try {
      const next = await window.rw.saveProvider({
        provider,
        baseUrl:
          provider === "deepseek" ? "https://api.deepseek.com" : baseUrl,
        model: model.trim(),
        apiKey: apiKey.trim() || undefined
      });
      setSettings(next);
      setProvider(next.provider);
      setBaseUrl(next.baseUrl);
      setModel(next.model);
      setApiKey("");
      setMessage("模型配置已应用，下一条消息生效。");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "保存模型配置失败"
      );
    } finally {
      setBusy(null);
    }
  };

  const saveGit = async () => {
    setBusy("git");
    setError(null);
    setMessage(null);
    try {
      const next = await window.rw.saveGit({
        gitBinary: gitBinary.trim(),
        autoCommit
      });
      setSettings(next);
      setGitBinary(next.gitBinary);
      setAutoCommit(next.autoCommit);
      setMessage("Git 设置已应用。");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "保存 Git 设置失败"
      );
    } finally {
      setBusy(null);
    }
  };

  const chooseGitBinary = async () => {
    try {
      const result = await window.rw.chooseGitBinary();
      if (!result.canceled && result.path) {
        setGitBinary(result.path);
      }
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "选择 Git 失败"
      );
    }
  };

  const clearKey = async () => {    setBusy("clear");
    setError(null);
    setMessage(null);
    try {
      const next = await window.rw.clearApiKey();
      setSettings(next);
      setMessage("已清除 API Key，Agent 回到未配置模型状态。");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "清除 API Key 失败"
      );
    } finally {
      setBusy(null);
    }
  };

  const chooseWorkspace = async () => {
    setBusy("workspace");
    setError(null);
    setMessage(null);
    try {
      const result = await window.rw.chooseWorkspace();
      if (result.canceled) {
        setBusy(null);
        return;
      }
      setMessage("工作目录已切换，应用正在重启…");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "切换工作目录失败"
      );
      setBusy(null);
    }
  };

  const resetWorkspace = async () => {
    setBusy("workspace");
    setError(null);
    setMessage(null);
    try {
      await window.rw.resetWorkspace();
      setMessage("正在恢复默认工作区，应用将重启…");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "恢复默认工作区失败"
      );
      setBusy(null);
    }
  };

  return (
    <div className="approval-backdrop" onClick={onClose}>
      <div
        className="approval-dialog settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-head">
          <div>
            <span className="eyebrow">Agent 设置</span>
            <h2 id="settings-title">模型与工作目录</h2>
          </div>
          <button
            type="button"
            className="icon-quiet"
            aria-label="关闭设置"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {busy === "loading" && <div className="empty-note">读取设置…</div>}

        {settings && (
          <>
            <section className="settings-section">
              <div className="settings-section-head">
                <div>
                  <h3>Agent 模型</h3>
                  <p>DeepSeek 内置，或任意 OpenAI 兼容端点。</p>
                </div>
                <span
                  className={`settings-status ${
                    settings.hasApiKey ||
                    provider === "openai-compatible"
                      ? "on"
                      : ""
                  }`}
                >
                  {settings.hasApiKey
                    ? "已配置"
                    : provider === "openai-compatible"
                      ? "自定义端点"
                      : "未配置模型"}
                </span>
              </div>

              <div className="settings-field">
                <span>Provider</span>
                <Segmented
                  label="Provider"
                  value={provider}
                  options={[
                    { value: "deepseek", label: "DeepSeek" },
                    {
                      value: "openai-compatible",
                      label: "OpenAI 兼容"
                    }
                  ]}
                  onChange={(next) => {
                    const selected = next as
                      | "deepseek"
                      | "openai-compatible";
                    setProvider(selected);
                    if (selected === "deepseek") {
                      setBaseUrl("https://api.deepseek.com");
                      setModel("deepseek-flash");
                    } else {
                      setBaseUrl("https://api.openai.com/v1");
                      setModel("gpt-4o-mini");
                    }
                  }}
                />
              </div>

              {provider === "openai-compatible" && (
                <label className="settings-field">
                  <span>Base URL</span>
                  <input
                    value={baseUrl}
                    spellCheck={false}
                    placeholder="https://api.openai.com/v1"
                    onChange={(event) => setBaseUrl(event.target.value)}
                  />
                </label>
              )}

              <div className="settings-field">
                <span>模型</span>
                <ComboBox
                  value={model}
                  ariaLabel="模型"
                  placeholder="模型 ID"
                  options={
                    provider === "deepseek"
                      ? DEEPSEEK_MODELS
                      : OPENAI_COMPATIBLE_MODELS
                  }
                  onChange={setModel}
                />
              </div>

              <label className="settings-field">
                <span>API Key</span>
                <input
                  type="password"
                  value={apiKey}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={
                    settings.hasApiKey
                      ? "已保存，留空保持不变"
                      : provider === "openai-compatible"
                        ? "可选（本地端点可留空）"
                        : "sk-..."
                  }
                  onChange={(event) => setApiKey(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void saveProvider();
                    }
                  }}
                />
              </label>
              <div className="settings-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy !== null || !model.trim()}
                  onClick={() => void saveProvider()}
                >
                  {busy === "save" ? "应用中…" : "保存并应用"}
                </button>
                {settings.hasApiKey && (
                  <button
                    type="button"
                    className="quiet-button"
                    disabled={busy !== null}
                    onClick={() => void clearKey()}
                  >
                    {busy === "clear" ? "清除中…" : "清除 Key"}
                  </button>
                )}
              </div>
              <p className="settings-hint">
                配置写入本机设置，Key 使用 safeStorage 加密；不写入仓库，也不回显。
                {settings.apiKeySource === "env"
                  ? " 当前 Key 来自环境变量。"
                  : ""}
              </p>
            </section>

            <section className="settings-section">
              <div className="settings-section-head">
                <div>
                  <h3>项目工作目录</h3>
                  <p>Agent、实验记录、Git 和 IDE 都基于这个目录。</p>
                </div>
                <span className="settings-status">
                  {settings.isDefaultWorkspace ? "默认示例" : "自定义项目"}
                </span>
              </div>
              <code className="settings-path">{settings.workspace}</code>
              <div className="settings-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy !== null}
                  onClick={() => void chooseWorkspace()}
                >
                  {busy === "workspace" ? "切换中…" : "选择目录…"}
                </button>
                {!settings.isDefaultWorkspace && (
                  <button
                    type="button"
                    className="quiet-button"
                    disabled={busy !== null}
                    onClick={() => void resetWorkspace()}
                  >
                    恢复默认
                  </button>
                )}
              </div>
              <p className="settings-hint">
                切换后立即重启 Core 并重载当前窗口，不关闭应用。自定义目录不会被写入默认
                data.csv；已有 AGENTS.md 会继续生效。
              </p>
            </section>

            <section className="settings-section">
              <div className="settings-section-head">
                <div>
                  <h3>Git</h3>
                  <p>系统 Git 路径，以及 Agent 改完代码后是否自动提交。</p>
                </div>
                <span className="settings-status">
                  {autoCommit ? "自动提交开启" : "手动提交"}
                </span>
              </div>
              <label className="settings-field">
                <span>Git 可执行文件（留空使用 PATH 中的 git）</span>
                <div className="settings-inline">
                  <input
                    value={gitBinary}
                    spellCheck={false}
                    placeholder="git"
                    onChange={(event) => setGitBinary(event.target.value)}
                  />
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={() => void chooseGitBinary()}
                  >
                    浏览…
                  </button>
                </div>
              </label>
              <Switch
                checked={autoCommit}
                onChange={setAutoCommit}
                label="Agent/终端运行成功后自动 commit"
                description="默认关闭；开启后会把工作区所有改动一起提交，不做逐文件确认。"
              />
              <div className="settings-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy !== null}
                  onClick={() => void saveGit()}
                >
                  {busy === "git" ? "应用中…" : "保存 Git 设置"}
                </button>
              </div>
              <p className="settings-hint">
                路径会在保存时用 `git --version` 验证；自动提交仍受项目
                .gitignore 和内部路径过滤约束。
              </p>
            </section>

            <section className="settings-section settings-readonly">
              <div>
                <span>代码规范</span>
                <strong>AGENTS.md · 内置科研规范</strong>
              </div>
            </section>
          </>
        )}

        {error && (
          <div className="error-card" role="alert">
            <p>{error}</p>
          </div>
        )}
        {message && <p className="settings-message">{message}</p>}
      </div>
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
  chatMode: "faux" | "deepseek" | "openai" | null;
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
        <div className="message assistant">
          <div className="quick-actions-label">快捷操作</div>

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
                <strong>Agent 运行时自检</strong>
                <small>离线仿真 · 自定义工具 · 不调用网络</small>
              </div>
              <span className="tag amber">自检</span>
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
                {piRunning ? "正在运行自检…" : "运行运行时自检"}
              </button>
            </div>

            {piError && (
              <div className="error-card" role="alert">
                <strong>运行时自检失败</strong>
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
                  pi 已真实执行工具会话；当前使用离线仿真模型，真实模型可在左下角设置中配置。
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="live-chat">
          <div className="live-chat-heading">
            <span>Agent 对话</span>
            <span
              className={`tag ${
                chatMode === "deepseek" || chatMode === "openai"
                  ? "green"
                  : "amber"
              }`}
            >
              {chatMode === "deepseek"
                ? "DeepSeek"
                : chatMode === "openai"
                  ? "OpenAI 兼容"
                  : chatMode === "faux"
                    ? "未配置模型"
                    : "待连接"}
            </span>
          </div>

          {chatMessages.length === 0 && !chatStream && !chatRunning && (
            <div className="empty-note">
              输入研究问题，或让 Agent 画像 data.csv。模型在左下角
              Agent 设置中配置。
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
                    {message.mode === "deepseek"
                      ? "DeepSeek"
                      : message.mode === "openai"
                        ? "OpenAI 兼容"
                        : "未配置模型"}
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
                <span>
                  {chatMode === "deepseek"
                    ? "DeepSeek"
                    : chatMode === "openai"
                      ? "OpenAI 兼容"
                      : "未配置模型"}
                </span>
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
            <span>
              {chatMode === "deepseek"
                ? "DeepSeek"
                : chatMode === "openai"
                  ? "OpenAI 兼容"
                  : "未配置模型"}
            </span>
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
            : chatMode === "openai"
              ? "OpenAI 兼容 · 真实模型会话"
              : chatMode === "faux"
                ? "未配置模型 · 在左下角设置中配置 Provider/模型"
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
          <span className="eyebrow">项目状态</span>
          <h1>{observation?.summary ?? "当前项目状态"}</h1>
          <p>工作区、Skills 与运行事件</p>
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
        <span className="tag">实时</span>
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
