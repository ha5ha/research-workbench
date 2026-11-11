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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CodeWorkbench } from "./CodeWorkbench";
import { ApprovalDialog } from "./components/ApprovalDialog";
import { ErrorBanner } from "./components/ErrorBanner";
import { ExperimentRecords } from "./ExperimentRecords";
import { SettingsDialog } from "./settings/SettingsDialog";
import { toolLabel } from "./tool-labels";
import { ChatView } from "./views/ChatView";
import { FactBoard } from "./views/FactBoard";
import { ResearchLoop } from "./views/ResearchLoop";
import type {
  AgentChatResult,
  AppSettings,
  ApprovalRequest,
  Attachment,
  ChatCard,
  ChatMessage,
  ContextUsage,
  CoreStatus,
  ExperimentRef,
  Hello,
  Milestone,
  PermissionLevel,
  ResearchQuestion,
  ResearchTask,
  ResearchTopic,
  SessionSummary,
  TraceStep,
  TranscriptMessage,
  View
} from "./types";

const TABS: Array<{ id: View; label: string }> = [
  { id: "chat", label: "对话" },
  { id: "status", label: "研究罗盘" },
  { id: "records", label: "实验记录" }
];

function projectNameFromRoot(root: string | null): string {
  if (!root) return "未命名研究";
  const name = root.split(/[\\/]/).filter(Boolean).at(-1) ?? "未命名研究";
  return name === "workspace" ? "未命名研究" : decodeURIComponent(name);
}

function routeStatus(route: ResearchQuestion): "planned" | "active" | "done" {
  if (
    route.tasks.length > 0 &&
    route.tasks.every((task) => task.status === "done")
  ) {
    return "done";
  }
  if (route.tasks.some((task) => task.status === "active")) return "active";
  return route.status;
}

function routeStatusLabel(status: "planned" | "active" | "done"): string {
  return status === "done"
    ? "已完成"
    : status === "active"
      ? "进行中"
      : "计划中";
}

export default function App() {
  const [view, setView] = useState<View>("chat");
  const [managedRunId, setManagedRunId] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [topics, setTopics] = useState<ResearchTopic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [expandedRoutes, setExpandedRoutes] = useState<Record<string, boolean>>(
    {}
  );
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicDescription, setNewTopicDescription] = useState("");
  const [newQuestionTitle, setNewQuestionTitle] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [researchBusy, setResearchBusy] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(
    () => localStorage.getItem("rw.sidebar.left") === "1"
  );
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [ideOpen, setIdeOpen] = useState(false);
  const [status, setStatus] = useState<CoreStatus>({
    state: "starting",
    message: "正在连接研究服务"
  });
  const [hello, setHello] = useState<Hello | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatRunning, setChatRunning] = useState(false);
  const [chatStream, setChatStream] = useState("");
  const [chatMode, setChatMode] = useState<
    "faux" | "deepseek" | "openai" | null
  >(null);
  const [chatSessionFile, setChatSessionFile] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [codeOpenPath, setCodeOpenPath] = useState<{
    path: string;
    nonce: number;
  } | null>(null);
  const [recordCount, setRecordCount] = useState(0);
  const [experiments, setExperiments] = useState<ExperimentRef[]>([]);
  const [chatTrace, setChatTrace] = useState<TraceStep[]>([]);
  const [chatCards, setChatCards] = useState<ChatCard[]>([]);
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [milestoneTick, setMilestoneTick] = useState(0);
  const chatStreamRef = useRef("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentConfig, setAgentConfig] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const projectName = projectNameFromRoot(hello?.workspaceRoot ?? null);
  const projectId = hello?.projectId ?? null;
  const selectedTopic =
    topics.find((topic) => topic.id === selectedTopicId) ?? null;
  const selectedRoute =
    selectedTopic?.questions.find((question) =>
      question.tasks.some((task) => task.id === selectedTask)
    ) ??
    selectedTopic?.questions.find(
      (question) => question.id === selectedRouteId
    ) ??
    null;
  const selectedTaskRecord =
    selectedTopic?.questions
      .flatMap((question) => question.tasks)
      .find((task) => task.id === selectedTask) ?? null;
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
  const loadedChatKey = useRef<string | null>(null);
  const skipChatSave = useRef<string | null>(null);

  useEffect(() => {
    if (!chatStorageKey) return;
    if (loadedChatKey.current === chatStorageKey) return;
    loadedChatKey.current = chatStorageKey;
    setChatStream("");
    setChatError(null);
    try {
      const raw = localStorage.getItem(chatStorageKey);
      const saved = raw
        ? (JSON.parse(raw) as {
            messages?: ChatMessage[];
            mode?: "faux" | "deepseek" | "openai" | null;
            sessionFile?: string | null;
          })
        : null;
      setChatMessages(saved?.messages ?? []);
      setChatMode(saved?.mode ?? null);
      setChatSessionFile(saved?.sessionFile ?? null);
      if (saved?.sessionFile) {
        void window.rw
          .request("agent.restoreSession", {
            sessionFile: saved.sessionFile
          })
          .catch(() => setChatSessionFile(null));
      } else {
        void window.rw.request("agent.reset").catch(() => {});
      }
    } catch {
      setChatMessages([]);
      setChatMode(null);
      setChatSessionFile(null);
    }
  }, [chatStorageKey]);

  useEffect(() => {
    if (!chatStorageKey || loadedChatKey.current !== chatStorageKey) return;
    if (skipChatSave.current === chatStorageKey) {
      skipChatSave.current = null;
      return;
    }
    localStorage.setItem(
      chatStorageKey,
      JSON.stringify({
        messages: chatMessages,
        mode: chatMode,
        sessionFile: chatSessionFile
      })
    );
  }, [chatMessages, chatMode, chatSessionFile, chatStorageKey]);

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
      const nextHello = await window.rw.request<Hello>("system.hello");
      setHello(nextHello);
      const [nextExperiments, nextTopics, nextSettings] = await Promise.all([
        window.rw.request<ExperimentRef[]>("experiments.list"),
        window.rw.request<ResearchTopic[]>("research.tree"),
        window.rw.getSettings()
      ]);
      setExperiments(nextExperiments);
      setRecordCount(nextExperiments.length);
      setAgentConfig(nextSettings);
      setTopics(nextTopics);
      setSelectedTopicId((current) => {
        if (current && nextTopics.some((topic) => topic.id === current)) {
          return current;
        }
        return null;
      });
      setExpandedRoutes((current) => {
        const next = { ...current };
        for (const topic of nextTopics) {
          for (const question of topic.questions) {
            if (next[question.id] === undefined) next[question.id] = true;
          }
        }
        return next;
      });
      setSelectedTask((current) => {
        const tasks = nextTopics.flatMap((topic) =>
          topic.questions.flatMap((question) => question.tasks)
        );
        if (current && tasks.some((task) => task.id === current)) {
          return current;
        }
        return null;
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "连接研究服务失败"
      );
    }
  }, []);

  const online =
    status.state === "online" && hello !== null && agentConfig !== null;

  const refreshUsage = useCallback(async () => {
    try {
      const usage = await window.rw.request<ContextUsage | null>(
        "agent.contextUsage"
      );
      setContextUsage(usage ?? null);
    } catch {
      setContextUsage(null);
    }
  }, []);

  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage, chatStorageKey]);

  const refreshMilestones = useCallback(async () => {
    try {
      // Milestones belong to a task when the turn ran inside one, but the
      // project inbox has no task — show the most recent ones either way.
      const result = await window.rw.request<{ milestones: Milestone[] }>(
        "milestones.list",
        selectedTaskRecord?.id
          ? { taskId: selectedTaskRecord.id, limit: 8 }
          : { limit: 8 }
      );
      setMilestones(result.milestones);
    } catch {
      setMilestones([]);
    }
  }, [selectedTaskRecord?.id]);

  useEffect(() => {
    void refreshMilestones();
  }, [refreshMilestones, milestoneTick]);

  useEffect(() => {
    let alive = true;
    const offEvent = window.rw.onEvent((event) => {
      if (!alive) return;
      if (event.params.type === "agent.delta") {
        const payload = event.params.payload as { text?: string };
        if (payload.text) {
          chatStreamRef.current += payload.text;
          setChatStream(chatStreamRef.current);
        }
        return;
      }
      if (event.params.type === "agent.card") {
        const payload = event.params.payload as { card?: ChatCard };
        if (payload.card) {
          setChatCards((current) => [...current, payload.card as ChatCard]);
        }
        return;
      }
      if (event.params.type === "agent.tool-start") {
        const payload = event.params.payload as { toolName?: string };
        const toolName = payload.toolName ?? "tool";
        setChatTrace((current) => [
          ...current,
          {
            id: `${event.params.seq}`,
            toolName,
            label: toolLabel(toolName),
            status: "running"
          }
        ]);
        return;
      }
      if (event.params.type === "agent.tool-end") {
        const payload = event.params.payload as {
          toolName?: string;
          isError?: boolean;
        };
        const toolName = payload.toolName ?? "tool";
        setChatTrace((current) => {
          let index = -1;
          for (let i = current.length - 1; i >= 0; i -= 1) {
            if (
              current[i]?.toolName === toolName &&
              current[i]?.status === "running"
            ) {
              index = i;
              break;
            }
          }
          if (index < 0) return current;
          const next = [...current];
          const existing = next[index]!;
          next[index] = {
            ...existing,
            status: payload.isError ? "error" : "done"
          };
          return next;
        });
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
      if (event.params.type === "experiments.changed") {
        const payload = event.params.payload as { count?: number };
        if (typeof payload.count === "number") {
          setRecordCount(payload.count);
        }
      }
      if (event.params.type === "schedule.digest") {
        // A scheduled check produced a digest; it is stored as a milestone too.
        setMilestoneTick((tick) => tick + 1);
      }
      if (event.params.type === "skill.failed") {
        const payload = event.params.payload as { message?: string };
        setError(payload.message ?? "Skill 执行失败");
      }
      if (event.params.type === "git.auto-commit-failed") {
        const payload = event.params.payload as { message?: string };
        setError(payload.message ?? "自动提交失败");
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

  const sendChat = async () => {
    const prompt = chatInput.trim();
    if ((!prompt && attachments.length === 0) || chatRunning) return;
    const attachmentContext =
      attachments.length > 0
        ? `工作区附件（相对路径）：\n${attachments
            .map((file) => `- ${file.path}`)
            .join("\n")}\n\n`
        : "";
    const agentPrompt = `${attachmentContext}${prompt || "请阅读附件并总结研究相关内容。"}`;
    setChatTrace([]);
    setChatCards([]);
    chatStreamRef.current = "";
    setChatMessages((current) => [
      ...current,
      {
        role: "user",
        text:
          attachments.length > 0
            ? `${prompt || "请阅读附件并总结研究相关内容。"}\n\n附件：${attachments
                .map((file) => file.name)
                .join("、")}`
            : prompt
      }
    ]);
    setChatInput("");
    setChatStream("");
    chatStreamRef.current = "";
    setChatError(null);
    setChatRunning(true);
    try {
      const result = await window.rw.request<AgentChatResult>("agent.chat", {
        prompt: agentPrompt,
        scope
      });
      setChatMode(result.mode);
      setChatSessionFile(result.sessionFile);
      setAttachments([]);
      setChatMessages((current) => [
        ...current,
        { role: "assistant", text: result.text, mode: result.mode }
      ]);
    } catch (chatFailure) {
      // Keep whatever the model already produced instead of discarding it.
      const partial = chatStreamRef.current.trim();
      if (partial) {
        setChatMessages((current) => [
          ...current,
          { role: "assistant", text: partial, mode: chatMode ?? undefined }
        ]);
        chatStreamRef.current = "";
      }
      setChatError(
        chatFailure instanceof Error ? chatFailure.message : "Agent 对话失败"
      );
    } finally {
      setChatStream("");
      setChatRunning(false);
      void refreshUsage();
      void refreshMilestones();
    }
  };

  const compactContext = async () => {
    try {
      await window.rw.request("agent.compact", {
        instructions:
          "保留：已做出的决定及理由、被否决的方向、未决问题、关键数字。" +
          "丢弃：工具输出正文、被推翻的中间假设、寒暄。"
      });
      await refreshUsage();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "压缩失败");
    }
  };

  const stopChat = async () => {
    try {
      await window.rw.request("agent.abort");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "停止失败");
    }
  };

  const loadSessions = async (): Promise<SessionSummary[]> => {
    const result = await window.rw.request<{ sessions: SessionSummary[] }>(
      "agent.sessions"
    );
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
    try {
      const result = await window.rw.request<{
        messages: TranscriptMessage[];
      }>("agent.sessionMessages", { file: session.file });
      await window.rw.request("agent.restoreSession", {
        sessionFile: session.file
      });
      setChatMessages(result.messages);
      chatStreamRef.current = "";
      setChatStream("");
      setChatError(null);
      setChatTrace([]);
      setChatSessionFile(session.file);
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "打开历史会话失败");
      return false;
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

  const openInIde = (path: string) => {
    setCodeOpenPath({ path, nonce: Date.now() });
    setIdeOpen(true);
  };

  const startNewChat = () => {
    if (chatStorageKey) {
      localStorage.removeItem(chatStorageKey);
      loadedChatKey.current = chatStorageKey;
      skipChatSave.current = chatStorageKey;
    }
    void window.rw.request("agent.reset").catch(() => {});
    setChatMessages([]);
    setChatStream("");
    setChatInput("");
    setChatError(null);
    setChatMode(null);
    setChatSessionFile(null);
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

  const createTopic = async () => {
    const title = newTopicTitle.trim();
    if (!title || researchBusy) return;
    setResearchBusy(true);
    try {
      const result = await window.rw.request<{
        topic: ResearchTopic;
        topics: ResearchTopic[];
      }>("research.createTopic", {
        title,
        description: newTopicDescription.trim()
      });
      setTopics(result.topics);
      setSelectedTopicId(result.topic.id);
      setSelectedTask(null);
      setSelectedRouteId(null);
      setNewTopicTitle("");
      setNewTopicDescription("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "创建课题失败");
    } finally {
      setResearchBusy(false);
    }
  };

  const createQuestion = async () => {
    const title = newQuestionTitle.trim();
    if (!selectedTopic || !title || researchBusy) return;
    setResearchBusy(true);
    try {
      const result = await window.rw.request<{
        question: ResearchQuestion;
        topics: ResearchTopic[];
      }>("research.createQuestion", { topicId: selectedTopic.id, title });
      setTopics(result.topics);
      setSelectedRouteId(result.question.id);
      setSelectedTask(null);
      setExpandedRoutes((current) => ({
        ...current,
        [result.question.id]: true
      }));
      setNewQuestionTitle("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "创建子问题失败");
    } finally {
      setResearchBusy(false);
    }
  };

  const createTask = async () => {
    const title = newTaskTitle.trim();
    if (!selectedRoute || !title || researchBusy) return;
    setResearchBusy(true);
    try {
      const result = await window.rw.request<{
        task: ResearchTask;
        topics: ResearchTopic[];
      }>("research.createTask", { routeId: selectedRoute.id, title });
      setTopics(result.topics);
      setSelectedTask(result.task.id);
      setExpandedRoutes((current) => ({
        ...current,
        [selectedRoute.id]: true
      }));
      setNewTaskTitle("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "创建任务失败");
    } finally {
      setResearchBusy(false);
    }
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

        <details className="research-paths" open>
          <DisclosureSummary>
            研究路径 <span>{topics.length > 0 ? topics.length : ""}</span>
          </DisclosureSummary>
          <nav className="tree" aria-label="研究路径">
            <button
              type="button"
              className={`tree-project-chat ${!selectedTask && !selectedTopic ? "selected" : ""}`}
              onClick={() => {
                setSelectedTopicId(null);
                setSelectedRouteId(null);
                setSelectedTask(null);
                setView("chat");
                setNavOpen(false);
              }}
            >
              项目对话
            </button>
            {topics.length === 0 && (
              <p className="path-empty">从对话开始。需要时再整理研究路径。</p>
            )}
            {topics.map((topic) => (
              <div className="tree-group" key={topic.id}>
                <button
                  type="button"
                  className={`path-topic ${selectedTopicId === topic.id ? "selected" : ""}`}
                  aria-expanded={selectedTopicId === topic.id}
                  onClick={() => {
                    setSelectedTopicId(
                      selectedTopicId === topic.id ? null : topic.id
                    );
                    setSelectedRouteId(null);
                    setSelectedTask(null);
                  }}
                >
                  <Icon
                    name="chevron-right"
                    size={14}
                    className={`tree-chevron ${selectedTopicId === topic.id ? "open" : ""}`}
                  />
                  <span className="tree-qtitle">{topic.title}</span>
                </button>
                {selectedTopicId === topic.id &&
                  topic.questions.map((question) => {
                    const expanded = expandedRoutes[question.id] ?? true;
                    const state = routeStatus(question);
                    return (
                      <div className="path-route" key={question.id}>
                        <button
                          type="button"
                          className="tree-question"
                          aria-expanded={expanded}
                          title={routeStatusLabel(state)}
                          onClick={() => {
                            setSelectedRouteId(question.id);
                            setSelectedTask(null);
                            setExpandedRoutes((current) => ({
                              ...current,
                              [question.id]: !expanded
                            }));
                          }}
                        >
                          <Icon
                            name="chevron-right"
                            size={14}
                            className={`tree-chevron ${expanded ? "open" : ""}`}
                          />
                          <span className="tree-qtitle">{question.title}</span>
                          <span
                            className={`path-state ${state}`}
                            aria-label={routeStatusLabel(state)}
                          />
                        </button>
                        {expanded && (
                          <div className="tree-children">
                            {question.tasks.map((task) => (
                              <button
                                type="button"
                                key={task.id}
                                className={`tree-task ${task.status} ${selectedTask === task.id ? "selected" : ""}`}
                                aria-current={
                                  selectedTask === task.id ? "page" : undefined
                                }
                                onClick={() => {
                                  setSelectedTopicId(topic.id);
                                  setSelectedRouteId(question.id);
                                  setSelectedTask(task.id);
                                  setView("chat");
                                  setNavOpen(false);
                                }}
                              >
                                <span
                                  className="tree-task-dot"
                                  aria-hidden="true"
                                />
                                <span className="tree-task-title">
                                  {task.title}
                                </span>
                                <span className="tree-task-meta">
                                  {task.status === "done"
                                    ? "完成"
                                    : task.status === "active"
                                      ? "进行中"
                                      : "待做"}
                                  {evidenceByTask[task.id]
                                    ? ` · ${evidenceByTask[task.id]}`
                                    : ""}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            ))}
          </nav>
        </details>

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
