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
  permissions: {
    fileWrite: "ask" | "allow" | "deny";
    command: "ask" | "allow" | "deny";
    gitCommit: "ask" | "allow" | "deny";
    note: "ask" | "allow" | "deny";
  };
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
type Attachment = {
  name: string;
  path: string;
  size: number;
};
type ResearchRoute = {
  id: string;
  title: string;
  status: "planned" | "active" | "done";
  tasks: ResearchTask[];
};
type LiteratureItem = {
  id: string;
  title: string;
  path?: string;
  url?: string;
  note?: string;
  addedAt: string;
};
type ResearchTopic = {
  id: string;
  title: string;
  description: string;
  literature: LiteratureItem[];
  routes: ResearchRoute[];
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentConfig, setAgentConfig] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const projectName = projectNameFromRoot(hello?.workspaceRoot ?? null);
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
  const scope = useMemo(
    () => ({
      projectId: "local",
      questionId: selectedTopic?.id,
      taskId: selectedTaskRecord?.id
    }),
    [selectedTopic?.id, selectedTaskRecord?.id]
  );
  const chatStorageKey = selectedTaskRecord
    ? `rw.chat.${projectName}.${selectedTaskRecord.id}`
    : null;
  const loadedChatKey = useRef<string | null>(null);
  const skipChatSave = useRef<string | null>(null);

  useEffect(() => {
    if (!chatStorageKey) {
      loadedChatKey.current = null;
      setChatMessages([]);
      setChatMode(null);
      setChatSessionFile(null);
      return;
    }
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
      const [nextHello, nextSkills, nextObservation, experiments, nextTopics, nextSettings] =
        await Promise.all([
          window.rw.request<Hello>("system.hello"),
          window.rw.request<{ skills: SkillInfo[] }>("skills.list"),
          window.rw.request<Observation>("domain.observe", {
            scope: { projectId: "local" }
          }),
          window.rw.request<unknown[]>("experiments.list"),
          window.rw.request<ResearchTopic[]>("research.tree"),
          window.rw.getSettings()
        ]);
      setHello(nextHello);
      setSkills(nextSkills.skills);
      setObservation(nextObservation);
      setRecordCount(experiments.length);
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
    if ((!prompt && attachments.length === 0) || chatRunning) return;
    const attachmentContext =
      attachments.length > 0
        ? `工作区附件（相对路径）：\n${attachments
            .map((file) => `- ${file.path}`)
            .join("\n")}\n\n`
        : "";
    const agentPrompt = `${attachmentContext}${prompt || "请阅读附件并总结研究相关内容。"}`;
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
        provider: "openai-compatible",
        baseUrl: agentConfig.baseUrl || "https://api.openai.com/v1",
        model: nextModel.trim()
      });
      setAgentConfig(next);
      setChatMode(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "切换模型失败");
    }
  };

  const quickSavePermissions = async (
    nextPermissions: AppSettings["permissions"]
  ) => {
    setPermissionBusy(true);
    try {
      const next = await window.rw.savePermissions(nextPermissions);
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
          onSaved={(next) => {
            setAgentConfig(next);
            setChatMode(null);
          }}
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
        onSaved={(next) => {
          setAgentConfig(next);
          setChatMode(null);
        }}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

const OPENAI_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1-mini",
  "gpt-4.1",
  "o3-mini",
  "o4-mini"
];

function SettingsDialog({
  open,
  onClose,
  onSaved
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (settings: AppSettings) => void;
}) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [section, setSection] = useState<
    "model" | "permissions" | "workspace" | "git" | "about"
  >("model");
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<"deepseek" | "openai-compatible">(
    "openai-compatible"
  );
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-4o-mini");
  const [gitBinary, setGitBinary] = useState("");
  const [autoCommit, setAutoCommit] = useState(false);
  const [permissions, setPermissions] = useState({
    fileWrite: "ask" as "ask" | "allow" | "deny",
    command: "ask" as "ask" | "allow" | "deny",
    gitCommit: "ask" as "ask" | "allow" | "deny",
    note: "ask" as "ask" | "allow" | "deny"
  });
  const [busy, setBusy] = useState<
    "loading" | "save" | "clear" | "workspace" | "git" | "permissions" | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setApiKey("");
    setError(null);
    setMessage(null);
    setSection("model");
    setBusy("loading");
    void window.rw
      .getSettings()
      .then((next) => {
        setSettings(next);
        setProvider("openai-compatible");
        setBaseUrl(
          next.provider === "openai-compatible" && next.baseUrl
            ? next.baseUrl
            : "https://api.openai.com/v1"
        );
        setModel(
          next.provider === "openai-compatible" && next.model
            ? next.model
            : "gpt-4o-mini"
        );
        setGitBinary(next.gitBinary);
        setAutoCommit(next.autoCommit);
        setPermissions(next.permissions);
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
        provider: "openai-compatible",
        baseUrl: baseUrl.trim() || "https://api.openai.com/v1",
        model: model.trim(),
        apiKey: apiKey.trim() || undefined
      });
      setSettings(next);
      setProvider("openai-compatible");
      setBaseUrl(next.baseUrl);
      setModel(next.model);
      setApiKey("");
      onSaved(next);
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
      onSaved(next);
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

  const savePermissions = async () => {
    setBusy("permissions");
    setError(null);
    setMessage(null);
    try {
      const next = await window.rw.savePermissions(permissions);
      setSettings(next);
      setPermissions(next.permissions);
      onSaved(next);
      setMessage("权限设置已应用。");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "保存权限设置失败"
      );
    } finally {
      setBusy(null);
    }
  };

  const clearKey = async () => {    setBusy("clear");
    setError(null);
    setMessage(null);
    try {
      const next = await window.rw.clearApiKey();
      setSettings(next);
      onSaved(next);
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

  const sectionInfo = {
    model: {
      label: "模型",
      title: "模型与接口协议",
      description: "当前版本接入 OpenAI Chat Completions 协议；Anthropic 协议后续支持。"
    },
    permissions: {
      label: "权限",
      title: "工具权限",
      description: "按工具控制 Agent 的写文件、终端、Git 与笔记行为。"
    },
    workspace: {
      label: "工作区",
      title: "项目工作目录",
      description: "Agent、实验记录、Git 和 IDE 都基于这个目录。"
    },
    git: {
      label: "Git",
      title: "版本控制",
      description: "配置 Git 可执行文件，以及运行后的自动提交策略。"
    },
    about: {
      label: "关于",
      title: "运行信息",
      description: "本地优先的科研工作台。"
    }
  } as const;

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        className="settings-dialog settings-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <aside className="settings-sidebar">
          <div className="settings-sidebar-head">
            <div>
              <span className="eyebrow">Agent 设置</span>
              <strong>Research Workbench</strong>
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
          <nav className="settings-nav" aria-label="设置分类">
            {(Object.keys(sectionInfo) as Array<keyof typeof sectionInfo>).map(
              (key) => (
                <button
                  type="button"
                  key={key}
                  className={section === key ? "selected" : ""}
                  onClick={() => {
                    setSection(key);
                    setError(null);
                    setMessage(null);
                  }}
                >
                  <span>{sectionInfo[key].label}</span>
                  <small>{sectionInfo[key].title}</small>
                </button>
              )
            )}
          </nav>
          <div className="settings-sidebar-foot">
            <span>v0.1.0</span>
            <span>本地优先</span>
          </div>
        </aside>

        <main className="settings-content">
          <header className="settings-content-head">
            <span className="eyebrow">{sectionInfo[section].label}</span>
            <h2 id="settings-title">{sectionInfo[section].title}</h2>
            <p>{sectionInfo[section].description}</p>
          </header>

          {busy === "loading" && <div className="empty-note">读取设置…</div>}

          {settings && section === "model" && (
            <section className="settings-section settings-section-flat">
              <div className="protocol-grid">
                <button type="button" className="protocol-card selected">
                  <span className="protocol-mark">O</span>
                  <span>
                    <strong>OpenAI 兼容</strong>
                    <small>Chat Completions；也适用于任意兼容该协议的服务。</small>
                  </span>
                  <span className="tag green">当前</span>
                </button>
                <button type="button" className="protocol-card" disabled>
                  <span className="protocol-mark">A</span>
                  <span>
                    <strong>Anthropic</strong>
                    <small>Messages API；协议适配将在后续版本接入。</small>
                  </span>
                  <span className="tag">即将支持</span>
                </button>
              </div>

              <label className="settings-field">
                <span>接口地址</span>
                <input
                  value={baseUrl}
                  spellCheck={false}
                  placeholder="https://api.openai.com/v1"
                  onChange={(event) => setBaseUrl(event.target.value)}
                />
              </label>

              <div className="settings-field">
                <span>模型</span>
                <ComboBox
                  value={model}
                  ariaLabel="模型"
                  placeholder="模型 ID"
                  options={OPENAI_MODELS}
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
                      : "sk-...（本地端点可留空）"
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
          )}

          {settings && section === "permissions" && (
            <section className="settings-section settings-section-flat">
              {(
                [
                  {
                    key: "fileWrite" as const,
                    label: "写入文件",
                    detail: "Agent 覆盖或创建文件"
                  },
                  {
                    key: "command" as const,
                    label: "终端命令",
                    detail: "Agent 和 IDE 终端执行命令"
                  },
                  {
                    key: "gitCommit" as const,
                    label: "Git 提交",
                    detail: "创建本地 commit"
                  },
                  {
                    key: "note" as const,
                    label: "研究笔记",
                    detail: "写入 durable note artifact"
                  }
                ] as const
              ).map((item) => (
                <div className="permission-row" key={item.key}>
                  <div className="permission-copy">
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </div>
                  <Segmented
                    label={`${item.label}权限`}
                    value={permissions[item.key]}
                    options={[
                      { value: "ask", label: "询问" },
                      { value: "allow", label: "允许" },
                      { value: "deny", label: "拒绝" }
                    ]}
                    onChange={(next) =>
                      setPermissions((current) => ({
                        ...current,
                        [item.key]: next as "ask" | "allow" | "deny"
                      }))
                    }
                  />
                </div>
              ))}

              <div className="settings-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy !== null}
                  onClick={() => void savePermissions()}
                >
                  {busy === "permissions" ? "应用中…" : "保存权限设置"}
                </button>
              </div>
              <p className="settings-hint">
                默认全部询问；允许会跳过审批，拒绝会阻止工具执行。权限由
                Core 强制执行，不只是 UI 状态。
              </p>
            </section>
          )}

          {settings && section === "workspace" && (
            <section className="settings-section settings-section-flat">
              <div className="settings-section-head">
                <div>
                  <h3>当前项目目录</h3>
                  <p>切换后 Core 会重启，窗口重载，不关闭应用。</p>
                </div>
                <span className="settings-status">
                  {settings.isDefaultWorkspace ? "默认工作区" : "自定义项目"}
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
                自定义目录不会被写入演示数据；已有 AGENTS.md 会继续生效。
              </p>
            </section>
          )}

          {settings && section === "git" && (
            <section className="settings-section settings-section-flat">
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
          )}

          {section === "about" && (
            <section className="settings-section settings-section-flat">
              <div className="settings-about-grid">
                <div>
                  <span>代码规范</span>
                  <strong>AGENTS.md · 内置科研规范</strong>
                </div>
                <div>
                  <span>研究结构</span>
                  <strong>.research/research.json</strong>
                </div>
                <div>
                  <span>实验记录</span>
                  <strong>.research/workbench.db</strong>
                </div>
                <div>
                  <span>Agent 会话</span>
                  <strong>.research/agent/sessions</strong>
                </div>
              </div>
              <p className="settings-hint">
                当前版本支持 OpenAI Chat Completions 协议；Anthropic
                Messages 协议尚未接入。
              </p>
            </section>
          )}

          {error && (
            <div className="error-card" role="alert">
              <p>{error}</p>
            </div>
          )}
          {message && <p className="settings-message">{message}</p>}
        </main>
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
  agentConfig: AppSettings | null;
  onOpenSettings: () => void;
  attachments: Attachment[];
  attachmentBusy: boolean;
  onAttach: () => void;
  onRemoveAttachment: (path: string) => void;
  onQuickModel: (model: string) => void;
  onQuickPermissions: (permissions: AppSettings["permissions"]) => void;
  permissionBusy: boolean;
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
    refresh
  } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const modelLabel =
    chatMode === "deepseek"
      ? agentConfig?.model ?? "模型会话"
      : chatMode === "openai"
        ? agentConfig?.model ?? "OpenAI 兼容"
        : chatMode === "faux"
          ? "未配置模型"
          : agentConfig?.hasApiKey ||
              agentConfig?.provider === "openai-compatible"
            ? agentConfig.model
            : "未配置模型";
  const [toolMenu, setToolMenu] = useState<"model" | "permissions" | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<
    AppSettings["permissions"]
  >(
    agentConfig?.permissions ?? {
      fileWrite: "ask",
      command: "ask",
      gitCommit: "ask",
      note: "ask"
    }
  );
  const toolsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (agentConfig?.permissions) {
      setPermissionDraft(agentConfig.permissions);
    }
  }, [agentConfig?.permissions]);

  useEffect(() => {
    if (!toolMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!toolsRef.current?.contains(event.target as Node)) {
        setToolMenu(null);
      }
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

  const permissionValues = Object.values(
    agentConfig?.permissions ?? {}
  ) as Array<"ask" | "allow" | "deny">;
  const permissionSummary =
    permissionValues.length === 0
      ? "询问"
      : permissionValues.every((value) => value === "allow")
        ? "允许"
        : permissionValues.every((value) => value === "deny")
          ? "拒绝"
          : permissionValues.every((value) => value === "ask")
            ? "询问"
            : "混合";

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [chatMessages, chatStream, chatRunning]);

  return (
    <div className="chat-view">
      <div className="chat-scroll" ref={scrollRef}>

        <div className="live-chat">
          <div className="live-chat-heading">
            <span>Agent 对话</span>
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
              <div
                className="live-assistant"
                key={`${message.role}-${index}`}
              >
                <div className="message-meta">
                  Research{" "}
                  <span>
                    {message.mode === "deepseek"
                      ? "模型会话"
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
                    ? "模型会话"
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
            <div className="empty-note">Agent 正在处理…</div>
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
                权限 · {permissionSummary}
                <span className="tool-chevron">⌄</span>
              </button>
              {toolMenu === "permissions" && (
                <div className="composer-popover permission-popover">
                  <div className="composer-popover-head">
                    <strong>工具权限</strong>
                    <span>由 Core 执行</span>
                  </div>
                  {(
                    [
                      ["fileWrite", "写文件"],
                      ["command", "终端"],
                      ["gitCommit", "Git 提交"],
                      ["note", "研究笔记"]
                    ] as const
                  ).map(([key, label]) => (
                    <div className="quick-permission-row" key={key}>
                      <span>{label}</span>
                      <Segmented
                        label={`${label}权限`}
                        value={permissionDraft[key]}
                        options={[
                          { value: "ask", label: "询问" },
                          { value: "allow", label: "允许" },
                          { value: "deny", label: "拒绝" }
                        ]}
                        onChange={(next) =>
                          setPermissionDraft((current) => ({
                            ...current,
                            [key]: next as "ask" | "allow" | "deny"
                          }))
                        }
                      />
                    </div>
                  ))}
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
                    <span>OpenAI 兼容</span>
                  </div>
                  {OPENAI_MODELS.map((item) => (
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
        </form>
        <div className="composer-caption">
          {modelLabel === "未配置模型"
            ? "未配置模型 · 点击输入框上方的模型按钮或左下角设置"
            : agentConfig?.hasApiKey
              ? `${modelLabel} · 真实模型会话`
              : `${modelLabel} · 未配置 Key，将使用离线仿真`}
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
