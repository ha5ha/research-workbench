import { useCallback, useEffect, useMemo, useState } from "react";
import type { RpcEvent, SkillRunResult } from "@research-workbench/contracts";

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

const SCOPE = {
  projectId: "project-demo",
  questionId: "Q-01",
  taskId: "T-02"
};

const TABS: Array<{ id: View; label: string }> = [
  { id: "chat", label: "对话" },
  { id: "status", label: "状态" },
  { id: "records", label: "实验记录" },
  { id: "code", label: "代码" }
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

export default function App() {
  const [view, setView] = useState<View>("chat");
  const [navOpen, setNavOpen] = useState(false);
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
  const [error, setError] = useState<string | null>(null);

  const loadCore = useCallback(async () => {
    setError(null);
    try {
      const [nextHello, nextSkills, nextObservation] = await Promise.all([
        window.rw.request<Hello>("system.hello"),
        window.rw.request<{ skills: SkillInfo[] }>("skills.list"),
        window.rw.request<Observation>("domain.observe", { scope: SCOPE })
      ]);
      setHello(nextHello);
      setSkills(nextSkills.skills);
      setObservation(nextObservation);
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
      setEvents((current) => [...current, event].slice(-12));
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

  const online = status.state === "online";
  const runnableSkills = useMemo(
    () => skills.filter((skill) => skill.status === "runnable"),
    [skills]
  );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${navOpen ? "open" : ""}`} aria-label="研究导航">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ★
          </span>
          <strong>Research</strong>
          <span className="version-pill">0.1</span>
        </div>

        <button className="new-chat" type="button" disabled>
          <span>＋</span> 新对话
        </button>

        <button className="project-row" type="button">
          <span className="project-mark">R</span>
          <span className="project-copy">
            <strong>小样本分类的泛化研究</strong>
            <small>本地工作区</small>
          </span>
        </button>

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
          <span className="footer-meta">Phase 0</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu"
            aria-label="打开研究导航"
            onClick={() => setNavOpen(true)}
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

        <div className="workspace">
          <section className="center">
            {view === "chat" && (
              <ChatView
                result={result}
                running={running}
                error={error}
                runProfile={runProfile}
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
            {view === "records" && <RecordsView result={result} />}
            {view === "code" && <CodeView />}
          </section>

          <aside className="inspector" aria-label="研究状态">
            <div className="inspector-heading">
              <div>
                <span className="eyebrow">研究状态</span>
                <h2>当前节点</h2>
              </div>
              <span className={`status-dot ${status.state}`} />
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
              <strong>Phase 0</strong>
              <p>
                当前只连接 Core、Skill 与 artifact。模型会话、pi 工具、
                真实运行记录尚未接入。
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function ChatView(props: {
  result: SkillRunResult | null;
  running: boolean;
  error: string | null;
  runProfile: () => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const { result, running, error, runProfile, refresh } = props;
  return (
    <div className="chat-view">
      <div className="chat-scroll">
        <div className="message user">
          <div className="bubble">
            先对样例数据做一次画像，别把原始行塞进上下文。
          </div>
        </div>

        <div className="message assistant">
          <div className="message-meta">
            Research <span>Agent · Phase 0</span>
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
        </div>
      </div>

      <div className="composer-wrap">
        <div className="composer">
          <div className="composer-placeholder">
            对话接入 pi 后开放输入；当前先验证科研 Skill 链路。
          </div>
          <div className="composer-footer">
            <span>DeepSeek</span>
            <span>工作区执行</span>
            <span className="composer-send">↑</span>
          </div>
        </div>
        <div className="composer-caption">
          示例模式 · Core 已连接 · 没有真实模型调用
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

function RecordsView({ result }: { result: SkillRunResult | null }) {
  return (
    <div className="page-view">
      <div className="page-heading">
        <div>
          <span className="eyebrow">当前节点</span>
          <h1>实验记录</h1>
          <p>运行产物与任务书归档；Phase 0 先显示 Skill artifact。</p>
        </div>
        <span className="tag">1 次运行</span>
      </div>
      {!result && (
        <div className="empty-state">
          <strong>还没有可归档的运行</strong>
          <p>回到对话运行 data-profile，artifact 会出现在这里。</p>
        </div>
      )}
      {result && (
        <div className="record-card">
          <div className="record-row">
            <span className="tag green">已完成</span>
            <div>
              <strong>{result.skillId}</strong>
              <small>
                v{result.version} · {result.summary}
              </small>
            </div>
          </div>
          {result.artifacts.map((artifact) => (
            <div className="artifact-row" key={artifact.id}>
              <span className="file-mark">JSON</span>
              <div>
                <strong>{artifact.path}</strong>
                <small>
                  {artifact.kind} · {artifact.size} B · {artifact.sha256.slice(0, 12)}…
                </small>
              </div>
            </div>
          ))}
          <div className="card-note">
            任务书、运行参数和真实数据归档将在 Phase 2 接入。
          </div>
        </div>
      )}
    </div>
  );
}

function CodeView() {
  return (
    <div className="page-view code-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">工作区</span>
          <h1>代码</h1>
          <p>Phase 0 代码工作面骨架；编辑器、diff、终端在 Phase 1 接入。</p>
        </div>
        <span className="tag">只读</span>
      </div>
      <div className="code-shell">
        <aside className="code-files">
          <div className="code-group">research-workbench</div>
          <div className="code-file selected">data-profile.ts</div>
          <div className="code-file">SKILL.md</div>
          <div className="code-file">rpc.ts</div>
          <div className="code-file">workspace.ts</div>
        </aside>
        <div className="code-editor">
          <div className="code-tab">
            data-profile.ts <span>TypeScript</span>
          </div>
          <pre>
            <code>{`// Phase 0: deterministic skill boundary
export async function runDataProfile(manifest, input, context) {
  const params = DataProfileParamsSchema.parse(input.params);
  const text = await context.tools.readText(params.path);
  const rows = parse(text, { bom: true, skip_empty_lines: true });
  const report = profile(rows);
  const artifact = await context.tools.writeArtifact({
    name: "data-profile.json",
    content: JSON.stringify(report, null, 2),
    kind: "data-profile"
  });
  return { status: "succeeded", artifacts: [artifact] };
}`}</code>
          </pre>
          <div className="code-footer">
            只读预览 · 文件树 / diff / 终端将在后续接入
          </div>
        </div>
      </div>
    </div>
  );
}
