import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RpcEvent } from "@research-workbench/contracts";
import { CodeWorkbench } from "./CodeWorkbench";
import { ApprovalDialog } from "./components/ApprovalDialog";
import { ErrorBanner } from "./components/ErrorBanner";
import { ExperimentRecords } from "./ExperimentRecords";
import { SettingsDialog } from "./settings/SettingsDialog";
import { toolLabel } from "./tool-labels";
import { ChatView } from "./views/ChatView";
import { FactBoard } from "./views/FactBoard";
import { StatusView } from "./views/StatusView";
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
  LiteratureItem,
  Milestone,
  Observation,
  PermissionLevel,
  ResearchRoute,
  ResearchTask,
  ResearchTopic,
  SessionSummary,
  SkillInfo,
  TraceStep,
  TranscriptMessage,
  View
} from "./types";

const TABS: Array<{ id: View; label: string }> = [
  { id: "chat", label: "对话" },
  { id: "status", label: "状态" },
  { id: "records", label: "实验记录" },
  { id: "facts", label: "事实" }
];

function projectNameFromRoot(root: string | null): string {
  if (!root) return "未命名研究";
  const name = root.split(/[\\/]/).filter(Boolean).at(-1) ?? "未命名研究";
  return name === "workspace" ? "未命名研究" : decodeURIComponent(name);
}

function routeStatus(route: ResearchRoute): "planned" | "active" | "done" {
  if (route.tasks.length > 0 && route.tasks.every((task) => task.status === "done")) {
    return "done";
  }
  if (route.tasks.some((task) => task.status === "active")) return "active";
  return route.status;
}

function routeStatusLabel(status: "planned" | "active" | "done"): string {
  return status === "done" ? "已完成" : status === "active" ? "进行中" : "计划中";
}

function topicStatusLabel(topic: ResearchTopic): string {
  const tasks = topic.routes.flatMap((route) => route.tasks);
  if (tasks.length > 0 && tasks.every((task) => task.status === "done")) {
    return "已完成";
  }
  if (tasks.some((task) => task.status === "active")) return "进行中";
  return "计划中";
}

function routeStatusFlags(
  topic: ResearchTopic
): "planned" | "active" | "done" {
  const label = topicStatusLabel(topic);
  return label === "已完成" ? "done" : label === "进行中" ? "active" : "planned";
}

export default function App() {
  const [view, setView] = useState<View>("chat");
  const [navOpen, setNavOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [topics, setTopics] = useState<ResearchTopic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [expandedRoutes, setExpandedRoutes] = useState<
    Record<string, boolean>
  >({});
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [topicMenuOpen, setTopicMenuOpen] = useState(false);
  const [newTopicOpen, setNewTopicOpen] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicDescription, setNewTopicDescription] = useState("");
  const [editTopicOpen, setEditTopicOpen] = useState(false);
  const [editTopicTitle, setEditTopicTitle] = useState("");
  const [editTopicDescription, setEditTopicDescription] = useState("");
  const [newRouteOpen, setNewRouteOpen] = useState(false);
  const [newRouteTitle, setNewRouteTitle] = useState("");
  const [newTaskFor, setNewTaskFor] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [literatureOpen, setLiteratureOpen] = useState(false);
  const [literatureTitle, setLiteratureTitle] = useState("");
  const [literatureUrl, setLiteratureUrl] = useState("");
  const [researchBusy, setResearchBusy] = useState(false);
  const topicMenuRef = useRef<HTMLDivElement>(null);
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
  const chatStreamRef = useRef("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentConfig, setAgentConfig] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const projectName = projectNameFromRoot(hello?.workspaceRoot ?? null);
  const projectId = hello?.projectId ?? null;
  const selectedTopic =
    topics.find((topic) => topic.id === selectedTopicId) ?? topics[0] ?? null;
  const selectedRoute =
    selectedTopic?.routes.find((route) =>
      route.tasks.some((task) => task.id === selectedTask)
    ) ?? null;
  const selectedTaskRecord =
    selectedTopic?.routes
      .flatMap((route) => route.tasks)
      .find((task) => task.id === selectedTask) ?? null;
  const topicStats = useMemo(() => {
    if (!selectedTopic) {
      return { routes: 0, tasks: 0, active: 0, done: 0 };
    }
    const tasks = selectedTopic.routes.flatMap((route) => route.tasks);
    return {
      routes: selectedTopic.routes.length,
      tasks: tasks.length,
      active: tasks.filter((task) => task.status === "active").length,
      done: tasks.filter((task) => task.status === "done").length
    };
  }, [selectedTopic]);
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
    ? `任务 ${selectedTaskRecord.id}`
    : "项目收件箱";
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
    if (!topicMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!topicMenuRef.current?.contains(event.target as Node)) {
        setTopicMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [topicMenuOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setTopicMenuOpen(false);
      setNewTopicOpen(false);
      setNewRouteOpen(false);
      setNewTaskFor(null);
      setLiteratureOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
      const nextHello = await window.rw.request<Hello>("system.hello");
      setHello(nextHello);
      const [nextSkills, nextObservation, nextExperiments, nextTopics, nextSettings] =
        await Promise.all([
          window.rw.request<{ skills: SkillInfo[] }>("skills.list"),
          window.rw.request<Observation>("domain.observe", {
            scope: { projectId: nextHello.projectId }
          }),
          window.rw.request<ExperimentRef[]>("experiments.list"),
          window.rw.request<ResearchTopic[]>("research.tree"),
          window.rw.getSettings()
        ]);
      setSkills(nextSkills.skills);
      setObservation(nextObservation);
      setExperiments(nextExperiments);
      setRecordCount(nextExperiments.length);
      setAgentConfig(nextSettings);
      setTopics(nextTopics);
      setSelectedTopicId((current) => {
        if (current && nextTopics.some((topic) => topic.id === current)) {
          return current;
        }
        return nextTopics[0]?.id ?? null;
      });
      setExpandedRoutes((current) => {
        const next = { ...current };
        for (const topic of nextTopics) {
          for (const route of topic.routes) {
            if (next[route.id] === undefined) next[route.id] = true;
          }
        }
        return next;
      });
      setSelectedTask((current) => {
        const tasks = nextTopics.flatMap((topic) =>
          topic.routes.flatMap((route) => route.tasks)
        );
        if (current && tasks.some((task) => task.id === current)) {
          return current;
        }
        return tasks[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Core 连接失败"
      );
    }
  }, []);

  const online = status.state === "online";

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
  }, [refreshMilestones]);

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
      setEvents((current) => [...current, event].slice(-50));
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
    try {
      const result = await window.rw.request<{ sessions: SessionSummary[] }>(
        "agent.sessions"
      );
      return result.sessions;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "读取历史会话失败");
      return [];
    }
  };

  const openSession = async (session: SessionSummary) => {
    if (
      !window.confirm(
        `打开历史会话「${session.title}」？当前对话会被替换，模型上下文也会切到该会话。`
      )
    ) {
      return;
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
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "打开历史会话失败");
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

  const runnableSkills = useMemo(
    () => skills.filter((skill) => skill.status === "runnable"),
    [skills]
  );

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

  const closeResearchForms = () => {
    setNewTopicOpen(false);
    setNewRouteOpen(false);
    setNewTaskFor(null);
    setLiteratureOpen(false);
    setTopicMenuOpen(false);
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
      setNewTopicOpen(false);
      setNewTopicTitle("");
      setNewTopicDescription("");
      setEditTopicOpen(false);
      setTopicMenuOpen(false);
      setNewRouteOpen(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "创建课题失败");
    } finally {
      setResearchBusy(false);
    }
  };

  const updateTopic = async () => {
    if (!selectedTopic || researchBusy) return;
    const title = editTopicTitle.trim();
    if (!title) return;
    setResearchBusy(true);
    try {
      const result = await window.rw.request<{
        topic: ResearchTopic;
        topics: ResearchTopic[];
      }>("research.updateTopic", {
        topicId: selectedTopic.id,
        title,
        description: editTopicDescription.trim()
      });
      setTopics(result.topics);
      setEditTopicOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "保存课题失败");
    } finally {
      setResearchBusy(false);
    }
  };

  const deleteTopic = async (topic: ResearchTopic) => {
    if (researchBusy) return;
    if (
      !window.confirm(
        `删除课题「${topic.title}」？其下的 ${topic.routes.length} 条研究路线与全部任务会一起删除，实验记录保留。`
      )
    ) {
      return;
    }
    setResearchBusy(true);
    try {
      const result = await window.rw.request<{ topics: ResearchTopic[] }>(
        "research.deleteTopic",
        { id: topic.id }
      );
      setTopics(result.topics);
      setSelectedTopicId(result.topics[0]?.id ?? null);
      setSelectedTask(null);
      setEditTopicOpen(false);
      closeResearchForms();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "删除课题失败");
    } finally {
      setResearchBusy(false);
    }
  };

  const deleteRoute = async (route: ResearchRoute) => {
    if (researchBusy) return;
    if (!window.confirm(`删除研究路线「${route.title}」及其 ${route.tasks.length} 个任务？`)) {
      return;
    }
    setResearchBusy(true);
    try {
      const result = await window.rw.request<{ topics: ResearchTopic[] }>(
        "research.deleteRoute",
        { id: route.id }
      );
      setTopics(result.topics);
      if (route.tasks.some((task) => task.id === selectedTask)) {
        setSelectedTask(null);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "删除研究路线失败");
    } finally {
      setResearchBusy(false);
    }
  };

  const createRoute = async () => {
    if (!selectedTopic) return;
    const title = newRouteTitle.trim();
    if (!title || researchBusy) return;
    setResearchBusy(true);
    try {
      const result = await window.rw.request<{
        route: ResearchRoute;
        topics: ResearchTopic[];
      }>("research.createRoute", {
        topicId: selectedTopic.id,
        title
      });
      setTopics(result.topics);
      setExpandedRoutes((current) => ({
        ...current,
        [result.route.id]: true
      }));
      setNewRouteOpen(false);
      setNewRouteTitle("");
      setNewTaskFor(result.route.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "创建研究路线失败");
    } finally {
      setResearchBusy(false);
    }
  };

  const updateTaskStatus = async (
    taskId: string,
    status: "todo" | "active" | "done"
  ) => {
    if (researchBusy) return;
    setResearchBusy(true);
    try {
      const result = await window.rw.request<{
        task: ResearchTask;
        topics: ResearchTopic[];
      }>("research.setTaskStatus", { taskId, status });
      setTopics(result.topics);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "更新任务状态失败");
    } finally {
      setResearchBusy(false);
    }
  };

  const deleteTask = async (task: ResearchTask) => {
    if (researchBusy) return;
    if (!window.confirm(`删除任务「${task.title}」？`)) return;
    setResearchBusy(true);
    try {
      const result = await window.rw.request<{ topics: ResearchTopic[] }>(
        "research.deleteTask",
        { id: task.id }
      );
      setTopics(result.topics);
      if (selectedTask === task.id) setSelectedTask(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "删除任务失败");
    } finally {
      setResearchBusy(false);
    }
  };

  const createTask = async (routeId: string) => {
    const title = newTaskTitle.trim();
    if (!title || researchBusy) return;
    setResearchBusy(true);
    try {
      const result = await window.rw.request<{
        task: ResearchTask;
        topics: ResearchTopic[];
      }>("research.createTask", { routeId, title });
      setTopics(result.topics);
      setExpandedRoutes((current) => ({
        ...current,
        [routeId]: true
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

  const addLiterature = async () => {
    if (!selectedTopic) return;
    const title = literatureTitle.trim();
    if (!title || researchBusy) return;
    setResearchBusy(true);
    try {
      const result = await window.rw.request<{
        literature: LiteratureItem;
        topics: ResearchTopic[];
      }>("research.addLiterature", {
        topicId: selectedTopic.id,
        title,
        url: literatureUrl.trim() || undefined
      });
      setTopics(result.topics);
      setLiteratureTitle("");
      setLiteratureUrl("");
      setLiteratureOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "添加文献失败");
    } finally {
      setResearchBusy(false);
    }
  };

  const removeLiterature = async (literatureId: string) => {
    if (!selectedTopic || researchBusy) return;
    setResearchBusy(true);
    try {
      const result = await window.rw.request<{
        topic: ResearchTopic;
        topics: ResearchTopic[];
      }>("research.removeLiterature", {
        topicId: selectedTopic.id,
        literatureId
      });
      setTopics(result.topics);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "移除文献失败");
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

  const locateConversation = (recordScope: unknown) => {
    const next = recordScope as
      | { questionId?: string; taskId?: string }
      | null;
    if (next?.questionId) setSelectedTopicId(next.questionId);
    setSelectedTask(next?.taskId ?? null);
    setView("chat");
  };

  const approvalDialog = (    <ApprovalDialog
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

        <div className="topic-switcher" ref={topicMenuRef}>
          <button
            type="button"
            className="topic-trigger"
            aria-expanded={topicMenuOpen}
            onClick={() => {
              setTopicMenuOpen((open) => !open);
              if (topics.length === 0) setNewTopicOpen(true);
            }}
          >
            <span className="topic-symbol">T</span>
            <span className="topic-trigger-copy">
              <small>课题</small>
              <strong>{selectedTopic?.title ?? "新建课题"}</strong>
            </span>
            <span className="topic-trigger-chevron">⌄</span>
          </button>

          {topicMenuOpen && (
            <div className="topic-panel">
              <div className="topic-panel-head">
                <span>课题</span>
                <button
                  type="button"
                  className="panel-close"
                  aria-label="关闭课题面板"
                  onClick={() => setTopicMenuOpen(false)}
                >
                  ×
                </button>
              </div>

              {newTopicOpen ? (
                <form
                  className="topic-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createTopic();
                  }}
                >
                  <label>
                    课题名称
                    <input
                      autoFocus
                      value={newTopicTitle}
                      placeholder="例如：小样本视觉分类的泛化"
                      onChange={(event) => setNewTopicTitle(event.target.value)}
                    />
                  </label>
                  <label>
                    一句话描述
                    <textarea
                      rows={2}
                      value={newTopicDescription}
                      placeholder="这个课题要回答什么、边界是什么…"
                      onChange={(event) =>
                        setNewTopicDescription(event.target.value)
                      }
                    />
                  </label>
                  <div className="topic-form-actions">
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={researchBusy || !newTopicTitle.trim()}
                    >
                      {researchBusy ? "创建中…" : "创建课题"}
                    </button>
                    <button
                      type="button"
                      className="quiet-button"
                      onClick={() => {
                        setNewTopicOpen(false);
                        setNewTopicTitle("");
                        setNewTopicDescription("");
                      }}
                    >
                      取消
                    </button>
                  </div>
                </form>
              ) : selectedTopic ? (
                <>
                  {editTopicOpen ? (
                    <form
                      className="topic-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void updateTopic();
                      }}
                    >
                      <label>
                        课题名称
                        <input
                          autoFocus
                          value={editTopicTitle}
                          onChange={(event) =>
                            setEditTopicTitle(event.target.value)
                          }
                        />
                      </label>
                      <label>
                        一句话描述
                        <textarea
                          rows={2}
                          value={editTopicDescription}
                          onChange={(event) =>
                            setEditTopicDescription(event.target.value)
                          }
                        />
                      </label>
                      <div className="topic-form-actions">
                        <button
                          type="submit"
                          className="primary-button"
                          disabled={researchBusy || !editTopicTitle.trim()}
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          className="quiet-button"
                          onClick={() => setEditTopicOpen(false)}
                        >
                          取消
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <p className="topic-description">
                        {selectedTopic.description || "还没有课题描述。"}
                      </p>
                      <div className="topic-edit-actions">
                        <button
                          type="button"
                          className="topic-edit-link"
                          onClick={() => {
                            setEditTopicTitle(selectedTopic.title);
                            setEditTopicDescription(selectedTopic.description);
                            setEditTopicOpen(true);
                          }}
                        >
                          编辑课题
                        </button>
                        <button
                          type="button"
                          className="topic-delete-link"
                          disabled={researchBusy}
                          onClick={() => void deleteTopic(selectedTopic)}
                        >
                          删除课题
                        </button>
                      </div>
                    </>
                  )}

                  <div className="topic-panel-section">
                    <div className="topic-panel-heading">
                      <span>文献库</span>
                      <button
                        type="button"
                        onClick={() => setLiteratureOpen((open) => !open)}
                      >
                        ＋ 文献
                      </button>
                    </div>
                    {literatureOpen && (
                      <form
                        className="literature-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void addLiterature();
                        }}
                      >
                        <input
                          autoFocus
                          value={literatureTitle}
                          placeholder="文献标题"
                          onChange={(event) =>
                            setLiteratureTitle(event.target.value)
                          }
                        />
                        <input
                          value={literatureUrl}
                          placeholder="链接或 DOI（可选）"
                          onChange={(event) =>
                            setLiteratureUrl(event.target.value)
                          }
                        />
                        <div className="topic-form-actions">
                          <button
                            type="submit"
                            disabled={researchBusy || !literatureTitle.trim()}
                          >
                            添加
                          </button>
                          <button
                            type="button"
                            className="quiet-button"
                            onClick={() => {
                              setLiteratureOpen(false);
                              setLiteratureTitle("");
                              setLiteratureUrl("");
                            }}
                          >
                            取消
                          </button>
                        </div>
                      </form>
                    )}
                    {selectedTopic.literature.length === 0 ? (
                      <p className="topic-panel-empty">还没有绑定文献。</p>
                    ) : (
                      <div className="literature-list">
                        {selectedTopic.literature.map((item) => (
                          <div className="literature-item" key={item.id}>
                            <span className="literature-mark">文</span>
                            <div>
                              <strong>{item.title}</strong>
                              <small>{item.url ?? item.path ?? "未绑定位置"}</small>
                            </div>
                            <button
                              type="button"
                              aria-label={`移除 ${item.title}`}
                              onClick={() => void removeLiterature(item.id)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {topics.length > 1 && (
                    <div className="topic-panel-section">
                      <div className="topic-panel-heading">
                        <span>切换课题</span>
                      </div>
                      <div className="topic-list">
                        {topics.map((topic) => (
                          <button
                            type="button"
                            key={topic.id}
                            className={topic.id === selectedTopic.id ? "selected" : ""}
                            onClick={() => {
                              setSelectedTopicId(topic.id);
                              setEditTopicOpen(false);
                              setSelectedTask(
                                topic.routes.flatMap((route) => route.tasks)[0]?.id ??
                                  null
                              );
                              setTopicMenuOpen(false);
                            }}
                          >
                            <span>{topic.id}</span>
                            <strong>{topic.title}</strong>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    className="topic-create-link"
                    onClick={() => setNewTopicOpen(true)}
                  >
                    ＋ 新建课题
                  </button>
                </>
              ) : (
                <p className="topic-panel-empty">
                  还没有课题。先创建课题，再建立研究路线与任务。
                </p>
              )}

              {!newTopicOpen && !selectedTopic && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setNewTopicOpen(true)}
                >
                  新建课题
                </button>
              )}
            </div>
          )}
        </div>

        <button className="new-chat" type="button" onClick={startNewChat}>
          <span>＋</span> 新对话
        </button>

        <div className="side-heading">
          <span>研究路径</span>
          <button
            type="button"
            className="side-add-button"
            disabled={!selectedTopic}
            onClick={() => {
              setNewRouteOpen((open) => !open);
              setNewRouteTitle("");
            }}
          >
            ＋ 新建路线
          </button>
        </div>

        {newRouteOpen && selectedTopic && (
          <form
            className="sidebar-form"
            onSubmit={(event) => {
              event.preventDefault();
              void createRoute();
            }}
          >
            <input
              autoFocus
              value={newRouteTitle}
              placeholder="研究路线标题…"
              onChange={(event) => setNewRouteTitle(event.target.value)}
            />
            <button
              type="submit"
              disabled={researchBusy || !newRouteTitle.trim()}
            >
              创建
            </button>
            <button
              type="button"
              className="form-close"
              aria-label="关闭新建路线"
              onClick={() => setNewRouteOpen(false)}
            >
              ×
            </button>
          </form>
        )}

        {selectedTopic ? (
          <>
            <div className="topic-overview">
              <div className="topic-overview-head">
                <span className={`route-status ${routeStatusFlags(selectedTopic)}`}>
                  {topicStatusLabel(selectedTopic)}
                </span>
                <span>
                  {topicStats.routes} 路线 · {topicStats.tasks} 任务
                </span>
              </div>
              <p>{selectedTopic.description || "还没有一句话描述。"}</p>
              <div className="topic-progress" aria-hidden="true">
                <span
                  style={{
                    width: `${
                      topicStats.tasks === 0
                        ? 0
                        : Math.round((topicStats.done / topicStats.tasks) * 100)
                    }%`
                  }}
                />
              </div>
              <div className="topic-overview-meta">
                <span>进行中 {topicStats.active}</span>
                <span>已完成 {topicStats.done}</span>
              </div>
            </div>

            <nav className="tree" aria-label="研究路径">
              {selectedTopic.routes.length === 0 && !newRouteOpen && (
                <div className="sidebar-empty">
                  <strong>还没有研究路线</strong>
                  <p>研究路线是同一课题下的验证路径。</p>
                  <button type="button" onClick={() => setNewRouteOpen(true)}>
                    ＋ 新建研究路线
                  </button>
                </div>
              )}

              {selectedTopic.routes.map((route) => {
                const expanded = expandedRoutes[route.id] ?? true;
                const status = routeStatus(route);
                return (
                  <div className="tree-group" key={route.id}>
                    <div className="route-row">
                      <button
                        type="button"
                        className="route-question"
                        aria-expanded={expanded}
                        onClick={() =>
                          setExpandedRoutes((current) => ({
                            ...current,
                            [route.id]: !expanded
                          }))
                        }
                      >
                        <span
                          className={`tree-chevron ${expanded ? "open" : ""}`}
                        >
                          ›
                        </span>
                        <span className="tree-qid">{route.id}</span>
                        <span className="tree-qtitle">{route.title}</span>
                        <span className={`route-status ${status}`}>
                          {routeStatusLabel(status)}
                        </span>
                        <span className="tree-qcount">{route.tasks.length}</span>
                      </button>
                      <button
                        type="button"
                        className="tree-delete"
                        aria-label={`删除研究路线 ${route.title}`}
                        title="删除研究路线"
                        disabled={researchBusy}
                        onClick={() => void deleteRoute(route)}
                      >
                        ×
                      </button>
                    </div>
                    {expanded && (
                      <div className="tree-children">
                        {route.tasks.map((task) => (
                          <div
                            key={task.id}
                            className={`tree-task ${task.status} ${
                              selectedTask === task.id ? "selected" : ""
                            }`}
                          >
                            <button
                              type="button"
                              className="tree-task-main"
                              onClick={() => {
                                setSelectedTask(task.id);
                                setView("chat");
                              }}
                            >
                              <span className="tree-task-dot" />
                              <span className="tree-task-title">
                                {task.title}
                              </span>
                              {selectedTask === task.id && (
                                <span className="tree-current">当前</span>
                              )}
                            </button>
                            <button
                              type="button"
                              className="task-status-cycle"
                              title="切换任务状态"
                              onClick={() =>
                                void updateTaskStatus(
                                  task.id,
                                  task.status === "todo"
                                    ? "active"
                                    : task.status === "active"
                                      ? "done"
                                      : "todo"
                                )
                              }
                            >
                              {task.status === "done"
                                ? "已完成"
                                : task.status === "active"
                                  ? "进行中"
                                  : "待开始"}
                            </button>
                            {evidenceByTask[task.id] ? (
                              <button
                                type="button"
                                className="tree-evidence"
                                title="查看该任务的实验记录"
                                onClick={() => {
                                  setSelectedTask(task.id);
                                  setView("records");
                                }}
                              >
                                {evidenceByTask[task.id]}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="tree-delete"
                              aria-label={`删除任务 ${task.title}`}
                              title="删除任务"
                              disabled={researchBusy}
                              onClick={() => void deleteTask(task)}
                            >
                              ×
                            </button>
                          </div>
                        ))}

                        {newTaskFor === route.id ? (
                          <form
                            className="sidebar-form tree-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void createTask(route.id);
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
                            <button
                              type="button"
                              className="form-close"
                              aria-label="关闭新建任务"
                              onClick={() => setNewTaskFor(null)}
                            >
                              ×
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            className="tree-add-task"
                            onClick={() => {
                              setNewTaskFor(route.id);
                              setNewTaskTitle("");
                            }}
                          >
                            ＋ 新建任务
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </>
        ) : (
          <div className="sidebar-empty">
            <strong>还没有课题</strong>
            <p>课题承载描述、文献库与研究路线。</p>
            <button
              type="button"
              onClick={() => {
                setNewTopicOpen(true);
                setTopicMenuOpen(true);
              }}
            >
              新建课题
            </button>
          </div>
        )}

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
            {selectedTopic && (
              <>
                <span className="slash">/</span>
                <span>{selectedTopic.title}</span>
              </>
            )}
            {selectedRoute && (
              <>
                <span className="slash">/</span>
                <span>{selectedRoute.title}</span>
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
                conversationLabel={conversationLabel}
                chatMessages={chatMessages}
                chatInput={chatInput}
                setChatInput={setChatInput}
                chatRunning={chatRunning}
                chatStream={chatStream}
                chatMode={chatMode}
                chatError={chatError}
                agentConfig={agentConfig}
                onOpenSettings={() => setSettingsOpen(true)}
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
                onOpenSession={(session) => void openSession(session)}
              />
            )}
            {view === "status" && (
              <StatusView
                observation={observation}
                skills={skills}
                events={events}
                hello={hello}
                status={status}
                refresh={loadCore}
              />
            )}
            {view === "records" && (
              <ExperimentRecords
                currentScope={scope}
                onOpenInIde={openInIde}
                onLocateConversation={locateConversation}
                onCountChange={setRecordCount}
                onRecordsChange={setExperiments}
              />
            )}
            {view === "facts" && <FactBoard topicId={selectedTopic?.id} />}
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
                <h3>位置</h3>
                <span className={`tag ${online ? "green" : "amber"}`}>
                  {online ? "在线" : "等待"}
                </span>
              </div>
              <dl className="facts-list">
                <div>
                  <dt>项目</dt>
                  <dd className="mono wrap">
                    {hello?.workspaceRoot ?? "等待 Core 返回"}
                  </dd>
                </div>
                <div>
                  <dt>课题</dt>
                  <dd>{selectedTopic?.title ?? "未选择"}</dd>
                </div>
                <div>
                  <dt>研究路线</dt>
                  <dd>{selectedRoute?.title ?? "未选择"}</dd>
                </div>
                <div>
                  <dt>任务</dt>
                  <dd>{selectedTaskRecord?.title ?? "项目收件箱"}</dd>
                </div>
              </dl>
            </section>

            <section className="inspector-section">
              <div className="inspector-title">
                <h3>进度</h3>
                <span className="muted">{runnableSkills.length} 可执行技能</span>
              </div>
              <dl className="facts-list">
                <div>
                  <dt>研究路线</dt>
                  <dd>{topicStats.routes} 条</dd>
                </div>
                <div>
                  <dt>任务</dt>
                  <dd>{topicStats.tasks} 个</dd>
                </div>
                <div>
                  <dt>进行中</dt>
                  <dd>{topicStats.active}</dd>
                </div>
                <div>
                  <dt>实验记录</dt>
                  <dd>{recordCount} 条</dd>
                </div>
              </dl>
              <div className="inspector-actions">
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => setView("records")}
                >
                  查看实验记录
                </button>
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => setIdeOpen(true)}
                >
                  打开项目 IDE
                </button>
              </div>
            </section>

            <section className="inspector-section">
              <div className="inspector-title">
                <h3>最近里程碑</h3>
                <span className="muted">{milestones.length}</span>
              </div>
              <div className="milestone-list">
                {milestones.length === 0 && (
                  <div className="empty-note">还没有里程碑。让 Agent 提出任务书或归档一次实验。</div>
                )}
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
            </section>
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
