import { useTaskMilestones } from "./shell/useTaskMilestones";
import { useCoreEvents } from "./shell/useCoreEvents";
import { useResearchTree } from "./shell/useResearchTree";
import { ResearchNavigation } from "./shell/ResearchNavigation";
import {
  Button,
  Icon,
  IconButton,
  MenuItem,
  Popover,
  TextInput,
  TextArea,
  DisclosureSummary
} from "@research-workbench/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CodeWorkbench } from "./CodeWorkbench";
import { ApprovalDialog } from "./components/ApprovalDialog";
import { ErrorBanner } from "./components/ErrorBanner";
import { ExperimentRecords } from "./ExperimentRecords";
import { SettingsDialog } from "./settings/SettingsDialog";
import { useConversation } from "./chat/useConversation";
import { projectNameFromRoot } from "./project-selection";
import { ChatView } from "./views/ChatView";
import { FactBoard } from "./views/FactBoard";
import { ResearchLoop } from "./views/ResearchLoop";
import type {
  AppSettings,
  Attachment,
  ExperimentRef,
  Hello,
  PermissionLevel,
  SessionSummary,
  View
} from "./types";

const TABS: Array<{ id: View; label: string }> = [
  { id: "chat", label: "对话" },
  { id: "status", label: "研究罗盘" },
  { id: "records", label: "实验记录" }
];

export default function App() {
  const [view, setView] = useState<View>("chat");
  const [managedRunId, setManagedRunId] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tree = useResearchTree(setError);
  const {
    setSelectedTopicId,
    setSelectedTask,
    setSelectedRouteId,
    newTopicTitle,
    setNewTopicTitle,
    newTopicDescription,
    setNewTopicDescription,
    newQuestionTitle,
    setNewQuestionTitle,
    newTaskTitle,
    setNewTaskTitle,
    researchBusy,
    selectedTopic,
    selectedRoute,
    selectedTaskRecord,
    createTopic,
    createQuestion,
    createTask,
    applyTopics
  } = tree;
  const [leftCollapsed, setLeftCollapsed] = useState(
    () => localStorage.getItem("rw.sidebar.left") === "1"
  );
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [ideOpen, setIdeOpen] = useState(false);
  const [hello, setHello] = useState<Hello | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [codeOpenPath, setCodeOpenPath] = useState<{
    path: string;
    nonce: number;
  } | null>(null);
  const {
    status,
    approval,
    approvalBusy,
    approvalError,
    respondApproval,
    recordCount,
    setRecordCount,
    milestoneTick
  } = useCoreEvents(setError);
  const [experiments, setExperiments] = useState<ExperimentRef[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentConfig, setAgentConfig] = useState<AppSettings | null>(null);

  const projectName = projectNameFromRoot(hello?.workspaceRoot ?? null);
  const projectId = hello?.projectId ?? null;
  /** Experiment-record count per task, shown as an evidence badge in the tree. */
  const evidenceByTask = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const record of experiments) {
      const taskId = record.scope?.taskId;
      if (!taskId) continue;
      counts[taskId] = (counts[taskId] ?? 0) + 1;
    }
    return counts;
  }, [experiments]);
  const scope = useMemo(
    () => ({
      projectId: projectId ?? "pending",
      questionId: selectedTopic?.id,
      taskId: selectedTaskRecord?.id
    }),
    [projectId, selectedTopic?.id, selectedTaskRecord?.id]
  );
  /**
   * A conversation belongs to the selected task, or to the project inbox when
   * no task is selected. It is keyed by the workspace-derived project id so two
   * different directories with the same folder name never share history.
   */
  const chatStorageKey = projectId
    ? `rw.chat.${projectId}.${selectedTaskRecord?.id ?? "inbox"}`
    : null;
  const conversationLabel = selectedTaskRecord
    ? selectedTaskRecord.title
    : "项目对话";
  const conversation = useConversation(chatStorageKey);
  const {
    messages: chatMessages,
    mode: chatMode,
    stream: chatStream,
    running: chatRunning,
    error: chatError,
    trace: chatTrace,
    cards: chatCards
  } = conversation;
  const setChatMode = (_mode: null) => {
    if (chatStorageKey) conversation.store.clearMode(chatStorageKey);
  };
  useEffect(() => {
    setAttachments([]);
    setChatInput("");
  }, [chatStorageKey]);

  useEffect(() => {
    localStorage.setItem("rw.sidebar.left", leftCollapsed ? "1" : "0");
  }, [leftCollapsed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setNavOpen(false);
      setRightCollapsed(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e") {
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
      const nextHello = await window.rw.request("system.hello");
      setHello(nextHello);
      const [nextExperiments, nextTopics, nextSettings] = await Promise.all([
        window.rw.request("experiments.list"),
        window.rw.request("research.tree"),
        window.rw.getSettings()
      ]);
      setExperiments(nextExperiments);
      setRecordCount(nextExperiments.length);
      setAgentConfig(nextSettings);
      applyTopics(nextTopics);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "连接研究服务失败"
      );
    }
  }, [applyTopics, setRecordCount]);

  const online =
    status.state === "online" && hello !== null && agentConfig !== null;

  const { milestones, refreshMilestones } = useTaskMilestones(
    selectedTaskRecord?.id,
    milestoneTick
  );
  const contextUsage = conversation.contextUsage;
  const refreshUsage = () =>
    chatStorageKey
      ? conversation.store.refreshUsage(chatStorageKey)
      : Promise.resolve();

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  const sendChat = async () => {
    const key = chatStorageKey;
    const prompt = chatInput.trim();
    if (!key || (!prompt && attachments.length === 0) || chatRunning) return;
    const context = attachments.length
      ? `工作区附件（相对路径）：\n${attachments.map((file) => `- ${file.path}`).join("\n")}\n\n`
      : "";
    const text = prompt || "请阅读附件并总结研究相关内容。";
    const display = attachments.length
      ? `${text}\n\n附件：${attachments.map((file) => file.name).join("、")}`
      : text;
    setChatInput("");
    setAttachments([]);
    await conversation.store.send(key, context + text, display, scope);
    void refreshUsage();
    void refreshMilestones();
  };

  const compactContext = async () => {
    try {
      if (!chatStorageKey) return;
      await conversation.store.compact(
        chatStorageKey,
        "保留：已做出的决定及理由、被否决的方向、未决问题、关键数字。" +
          "丢弃：工具输出正文、被推翻的中间假设、寒暄。"
      );
      await refreshUsage();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "压缩失败");
    }
  };

  const stopChat = async () => {
    try {
      if (chatStorageKey) await conversation.store.stop(chatStorageKey);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "停止失败");
    }
  };

  const loadSessions = async (): Promise<SessionSummary[]> => {
    const result = await window.rw.request("agent.sessions");
    return result.sessions;
  };

  const openSession = async (session: SessionSummary) => {
    if (
      !window.confirm(
        `打开历史会话「${session.title}」？当前对话会被替换，模型上下文也会切到该会话。`
      )
    ) {
      return false;
    }
    return chatStorageKey
      ? conversation.store.open(chatStorageKey, session.file)
      : false;
  };

  const openInIde = (path: string) => {
    setCodeOpenPath({ path, nonce: Date.now() });
    setIdeOpen(true);
  };

  const startNewChat = () => {
    if (chatStorageKey) conversation.store.reset(chatStorageKey);
    setChatInput("");
    setAttachments([]);
    setView("chat");
    setNavOpen(false);
  };

  const askAgent = (prompt: string) => {
    setView("chat");
    setChatInput(prompt);
    setNavOpen(false);
    setRightCollapsed(true);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>(".composer-input")?.focus();
    });
  };

  const pickAttachments = async () => {
    if (attachmentBusy) return;
    setAttachmentBusy(true);
    try {
      const result = await window.rw.pickAttachments();
      if (!result.canceled) {
        setAttachments((current) => {
          const byPath = new Map(current.map((file) => [file.path, file]));
          for (const file of result.files) byPath.set(file.path, file);
          return [...byPath.values()];
        });
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "添加附件失败");
    } finally {
      setAttachmentBusy(false);
    }
  };

  const quickSaveModel = async (nextModel: string) => {
    if (!agentConfig || !nextModel.trim()) return;
    try {
      const next = await window.rw.saveProvider({
        provider: agentConfig.provider,
        baseUrl: agentConfig.baseUrl,
        model: nextModel.trim()
      });
      setAgentConfig(next);
      setChatMode(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "切换模型失败");
    }
  };

  const quickSavePermissions = async (nextLevel: PermissionLevel) => {
    setPermissionBusy(true);
    try {
      const next = await window.rw.savePermissions(nextLevel);
      setAgentConfig(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "保存权限失败");
    } finally {
      setPermissionBusy(false);
    }
  };

  const openProjectDirectory = async () => {
    try {
      const result = await window.rw.chooseWorkspace();
      if (result.canceled) return;
      // Main restarts Core and reloads the window after the switch.
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "打开项目目录失败");
    }
  };

  const locateConversation = (recordScope: unknown) => {
    const next = recordScope as { questionId?: string; taskId?: string } | null;
    if (next?.questionId) setSelectedTopicId(next.questionId);
    setSelectedRouteId(null);
    setSelectedTask(next?.taskId ?? null);
    setView("chat");
  };

  const approvalDialog = (
    <ApprovalDialog
      approval={approval}
      busy={approvalBusy}
      error={approvalError}
      onRespond={(approved) => void respondApproval(approved)}
    />
  );

  if (ideOpen) {
    return (
      <>
        <div className="ide-window">
          <CodeWorkbench
            openPathRequest={codeOpenPath}
            workspaceRoot={hello?.workspaceRoot ?? null}
            projectName={projectName}
            onBack={() => setIdeOpen(false)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>
        <SettingsDialog
          open={settingsOpen}
          onSaved={(next) => {
            setAgentConfig(next);
            setChatMode(null);
          }}
          onClose={() => setSettingsOpen(false)}
        />
        {approvalDialog}
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
      </>
    );
  }

  return (
    <div className={`app-shell ${leftCollapsed ? "left-collapsed" : ""}`}>
      <aside
        className={`sidebar ${navOpen ? "open" : ""}`}
        aria-label="研究导航"
      >
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            R
          </span>
          <strong>Research</strong>
          <IconButton
            type="button"
            className="sidebar-collapse"
            aria-label="收起左侧研究导航"
            title="收起导航"
            onClick={() => {
              setLeftCollapsed(true);
              setNavOpen(false);
            }}
          >
            <Icon name="panel-left-close" />
          </IconButton>
        </div>

        <Popover
          className="project-switcher"
          triggerClassName="project-trigger"
          panelClassName="project-menu"
          ariaLabel="切换研究项目"
          label={
            <>
              <span className="project-mark" aria-hidden="true">
                R
              </span>
              <span className="project-copy">
                <strong>{projectName}</strong>
                <small>研究项目</small>
              </span>
            </>
          }
        >
          {(close) => (
            <>
              <div className="ui-menu-header">
                <strong>当前项目</strong>
              </div>
              <div className="ui-menu-note mono wrap">
                {hello?.workspaceRoot ?? "正在连接…"}
              </div>
              <div className="ui-menu-separator" />
              <MenuItem
                onClick={() => {
                  close();
                  void openProjectDirectory();
                }}
              >
                <Icon name="folder" />
                打开项目目录…
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close();
                  setRightCollapsed(false);
                }}
              >
                项目详情与研究资料
              </MenuItem>
            </>
          )}
        </Popover>

        <Button
          variant="ghost"
          type="button"
          className="new-chat"
          onClick={startNewChat}
          disabled={chatRunning || !online}
        >
          <Icon name="plus" />
          新对话
        </Button>

        <ResearchNavigation
          tree={tree}
          evidenceByTask={evidenceByTask}
          onSelectConversation={() => {
            setView("chat");
            setNavOpen(false);
          }}
        />

        <div className="sidebar-footer">
          <Button
            variant="ghost"
            type="button"
            className="project-ide"
            onClick={() => setIdeOpen(true)}
            title="打开项目 IDE（Ctrl/⌘ E）"
          >
            <Icon name="code-xml" />
            <span>打开项目 IDE</span>
            <kbd>Ctrl E</kbd>
          </Button>
          <Button
            variant="ghost"
            type="button"
            className="settings-entry"
            onClick={() => setSettingsOpen(true)}
          >
            <Icon name="settings" />
            <span className="settings-entry-copy">
              <strong>Agent 设置</strong>
              <small>模型、Key、Git 与工作目录</small>
            </span>
          </Button>
        </div>
      </aside>

      {leftCollapsed && (
        <IconButton
          type="button"
          className="collapsed-handle left-handle"
          aria-label="展开左侧研究导航"
          title="展开导航"
          onClick={() => setLeftCollapsed(false)}
        >
          <Icon name="panel-left-open" />
        </IconButton>
      )}

      <main className="main">
        <header className="topbar">
          <IconButton
            type="button"
            className="mobile-menu"
            aria-label="打开研究导航"
            onClick={() => {
              setLeftCollapsed(false);
              setNavOpen(true);
            }}
          >
            <Icon name="menu" />
          </IconButton>
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
          <div className="topbar-actions">
            <span
              className={`connection ${status.state}`}
              title={status.message}
            >
              <i />
              <span>
                {online
                  ? "已连接"
                  : status.state === "error"
                    ? "连接异常"
                    : "连接中"}
              </span>
            </span>
            <button
              type="button"
              className={`workspace-details ${!rightCollapsed ? "active" : ""}`}
              aria-expanded={!rightCollapsed}
              aria-controls="project-inspector"
              onClick={() => setRightCollapsed((collapsed) => !collapsed)}
            >
              项目详情
            </button>
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

        <div className={`workspace ${rightCollapsed ? "right-collapsed" : ""}`}>
          <section className="center">
            {view === "chat" && (
              <ChatView
                key={chatStorageKey}
                conversationLabel={conversationLabel}
                connected={online}
                chatMessages={chatMessages}
                chatInput={chatInput}
                setChatInput={setChatInput}
                chatRunning={chatRunning}
                chatStream={chatStream}
                chatMode={chatMode}
                chatError={chatError}
                agentConfig={agentConfig}
                onOpenSettings={() => setSettingsOpen(true)}
                onOpenResearch={(runId) => {
                  setManagedRunId(runId ?? null);
                  setView("status");
                }}
                onAskAgent={askAgent}
                attachments={attachments}
                attachmentBusy={attachmentBusy}
                onAttach={() => void pickAttachments()}
                onRemoveAttachment={(path) =>
                  setAttachments((current) =>
                    current.filter((file) => file.path !== path)
                  )
                }
                onQuickModel={(nextModel) => void quickSaveModel(nextModel)}
                onQuickPermissions={(nextPermissions) =>
                  void quickSavePermissions(nextPermissions)
                }
                permissionBusy={permissionBusy}
                sendChat={sendChat}
                trace={chatTrace}
                cards={chatCards}
                usage={contextUsage}
                onCompact={() => void compactContext()}
                onStop={() => void stopChat()}
                loadSessions={loadSessions}
                onOpenSession={openSession}
              />
            )}
            {view === "status" && (
              <ResearchLoop
                connected={online}
                initialRunId={managedRunId}
                onAskAgent={askAgent}
              />
            )}
            {view === "records" && (
              <ExperimentRecords
                currentScope={scope}
                onOpenInIde={openInIde}
                onLocateConversation={locateConversation}
                onCountChange={setRecordCount}
                onRecordsChange={setExperiments}
                onOpenManagedRun={(id) => {
                  setManagedRunId(id);
                  setView("status");
                }}
              />
            )}
            {view === "facts" && <FactBoard topicId={selectedTopic?.id} />}
          </section>

          {!rightCollapsed && (
            <>
              <button
                type="button"
                className="inspector-backdrop"
                aria-label="关闭项目详情"
                onClick={() => setRightCollapsed(true)}
              />
              <aside
                className="inspector"
                id="project-inspector"
                aria-label="项目详情"
              >
                <div className="inspector-heading">
                  <h2>项目详情</h2>
                  <IconButton
                    type="button"
                    className="sidebar-collapse"
                    aria-label="关闭项目详情"
                    onClick={() => setRightCollapsed(true)}
                  >
                    <Icon name="x" />
                  </IconButton>
                </div>
                <section className="inspector-section">
                  <dl className="facts-list">
                    <div>
                      <dt>工作目录</dt>
                      <dd className="mono wrap">
                        {hello?.workspaceRoot ?? "正在连接…"}
                      </dd>
                    </div>
                    {selectedTopic && (
                      <div>
                        <dt>课题</dt>
                        <dd>{selectedTopic.title}</dd>
                      </div>
                    )}
                    {selectedRoute && (
                      <div>
                        <dt>子问题</dt>
                        <dd>{selectedRoute.title}</dd>
                      </div>
                    )}
                    {selectedTaskRecord && (
                      <div>
                        <dt>任务</dt>
                        <dd>{selectedTaskRecord.title}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="inspector-actions">
                    <Button
                      variant="default"
                      type="button"

                      onClick={() => {
                        setView("facts");
                        setRightCollapsed(true);
                      }}
                    >
                      事实与证据
                    </Button>
                    <Button
                      variant="default"
                      type="button"

                      onClick={() => {
                        setView("status");
                        setRightCollapsed(true);
                      }}
                    >
                      研究罗盘
                    </Button>
                  </div>
                </section>
                {selectedTopic && (
                  <details className="inspector-section inspector-disclosure">
                    <DisclosureSummary>课题资料</DisclosureSummary>
                    {selectedTopic.description && (
                      <p className="inspector-description">
                        {selectedTopic.description}
                      </p>
                    )}
                    {selectedTopic.literature.map((item) => (
                      <div className="inspector-material" key={item.id}>
                        <strong>{item.title}</strong>
                        {item.path && (
                          <span className="mono wrap">{item.path}</span>
                        )}
                        {item.url && (
                          <a href={item.url} target="_blank" rel="noreferrer">
                            查看来源 <Icon name="external-link" size={14} />
                          </a>
                        )}
                      </div>
                    ))}
                    {selectedTopic.knowledge.map((entry) => (
                      <div className="inspector-material" key={entry.id}>
                        <strong>{entry.title}</strong>
                        <p>{entry.body}</p>
                      </div>
                    ))}
                    {selectedTopic.projects.map((project) => (
                      <div className="inspector-material" key={project.id}>
                        <strong>{project.name}</strong>
                        {project.path && (
                          <span className="mono wrap">{project.path}</span>
                        )}
                      </div>
                    ))}
                    {!selectedTopic.description &&
                      selectedTopic.literature.length === 0 &&
                      selectedTopic.knowledge.length === 0 &&
                      selectedTopic.projects.length === 0 && (
                        <p className="empty-note">尚无课题资料。</p>
                      )}
                  </details>
                )}
                <details className="inspector-section inspector-disclosure">
                  <DisclosureSummary>管理研究路径</DisclosureSummary>
                  <p className="empty-note">按需要记录课题、子问题与任务。</p>
                  <details className="path-management">
                    <DisclosureSummary>添加课题</DisclosureSummary>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void createTopic();
                      }}
                    >
                      <label>
                        课题名称
                        <TextInput
                          value={newTopicTitle}
                          onChange={(event) =>
                            setNewTopicTitle(event.target.value)
                          }
                          required
                        />
                      </label>
                      <label>
                        一句话描述
                        <TextArea
                          rows={2}
                          value={newTopicDescription}
                          onChange={(event) =>
                            setNewTopicDescription(event.target.value)
                          }
                        />
                      </label>
                      <Button
                        variant="default"

                        type="submit"
                        disabled={
                          !online || researchBusy || !newTopicTitle.trim()
                        }
                      >
                        添加课题
                      </Button>
                    </form>
                  </details>
                  {selectedTopic && (
                    <details className="path-management">
                      <DisclosureSummary>
                        为当前课题添加子问题
                      </DisclosureSummary>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void createQuestion();
                        }}
                      >
                        <label>
                          子问题
                          <TextInput
                            value={newQuestionTitle}
                            onChange={(event) =>
                              setNewQuestionTitle(event.target.value)
                            }
                            required
                          />
                        </label>
                        <Button
                          variant="default"

                          type="submit"
                          disabled={
                            !online || researchBusy || !newQuestionTitle.trim()
                          }
                        >
                          添加子问题
                        </Button>
                      </form>
                    </details>
                  )}
                  {selectedRoute && (
                    <details className="path-management">
                      <DisclosureSummary>
                        为当前子问题添加任务
                      </DisclosureSummary>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void createTask();
                        }}
                      >
                        <label>
                          任务名称
                          <TextInput
                            value={newTaskTitle}
                            onChange={(event) =>
                              setNewTaskTitle(event.target.value)
                            }
                            required
                          />
                        </label>
                        <Button
                          variant="default"

                          type="submit"
                          disabled={
                            !online || researchBusy || !newTaskTitle.trim()
                          }
                        >
                          添加任务
                        </Button>
                      </form>
                    </details>
                  )}
                </details>
                {milestones.length > 0 && (
                  <details className="inspector-section inspector-disclosure">
                    <DisclosureSummary>最近里程碑</DisclosureSummary>
                    <div className="milestone-list">
                      {milestones.map((milestone) => (
                        <div className="milestone-row" key={milestone.id}>
                          <span className={`milestone-dot ${milestone.kind}`} />
                          <div>
                            <strong>{milestone.title}</strong>
                            <small>
                              {new Date(milestone.at).toLocaleString("zh-CN", {
                                month: "numeric",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit"
                              })}
                            </small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </aside>
            </>
          )}
        </div>
      </main>

      {approvalDialog}
      <SettingsDialog
        open={settingsOpen}
        onSaved={(next) => {
          setAgentConfig(next);
          setChatMode(null);
        }}
        onClose={() => setSettingsOpen(false)}
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
    </div>
  );
}
