import { useEffect, useState } from "react";
import { ComboBox, Switch } from "../Controls";
import { PermissionPicker } from "../components/PermissionPicker";
import { MODEL_PRESETS } from "../models";
import type {
  AppSettings,
  PermissionLevel,
  UploadedFile
} from "../types";

type Section = "model" | "permissions" | "workspace" | "git" | "schedule" | "about";

const SECTIONS: Array<{ id: Section; label: string; title: string }> = [
  { id: "model", label: "模型", title: "模型与接口协议" },
  { id: "permissions", label: "权限", title: "工具权限" },
  { id: "workspace", label: "工作区", title: "项目工作目录" },
  { id: "git", label: "Git", title: "版本控制" },
  { id: "schedule", label: "检测", title: "定时检测" },
  { id: "about", label: "关于", title: "运行信息" }
];

const SECTION_DESCRIPTION: Record<Section, string> = {
  model: "当前接入 OpenAI Chat Completions 协议；Anthropic Messages 后续支持。",
  permissions: "按工具类别控制 Agent 的写文件、终端、Git 与笔记行为。",
  workspace: "Agent、实验记录、Git 和 IDE 都基于这个目录。",
  git: "配置 Git 可执行文件，以及运行后的自动提交策略。",
  schedule: "定期检查是否有任务书待确认、运行停滞或事实待确认。",
  about: "本地优先的科研工作台。"
};

const PROTOCOLS = [
  {
    id: "openai-compatible" as const,
    mark: "O",
    title: "OpenAI 兼容",
    detail: "Chat Completions；适用于 OpenAI、OpenRouter、Ollama、vLLM 等。"
  },
  {
    id: "deepseek" as const,
    mark: "D",
    title: "DeepSeek 原生",
    detail: "使用 pi 内置 DeepSeek Provider，保留其 thinking 配置。"
  }
];

export function SettingsDialog({
  open,
  onClose,
  onSaved
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (settings: AppSettings) => void;
}) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [section, setSection] = useState<Section>("model");
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<
    "deepseek" | "openai-compatible"
  >("openai-compatible");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [gitBinary, setGitBinary] = useState("");
  const [autoCommit, setAutoCommit] = useState(false);
  const [permissions, setPermissions] = useState<PermissionLevel>(
    "workspace-write"
  );
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  const [uploadsBusy, setUploadsBusy] = useState(false);
  const [schedules, setSchedules] = useState<
    Array<{
      id: string;
      kind: string;
      intervalSeconds: number;
      enabled: boolean;
      lastRunAt: string | null;
      nextRunAt: string;
    }>
  >([]);
  const [scheduleBusy, setScheduleBusy] = useState(false);
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
        // Show exactly what is stored. Previously every non
        // "openai-compatible" provider was replaced with OpenAI defaults here,
        // so pressing "保存并应用" silently overwrote the saved endpoint.
        setProvider(next.provider);
        setBaseUrl(next.baseUrl);
        setModel(next.model);
        setGitBinary(next.gitBinary);
        setAutoCommit(next.autoCommit);
        setPermissions(next.permissionLevel);
      })
      .catch((failure) =>
        setError(failure instanceof Error ? failure.message : "读取设置失败")
      )
      .finally(() => setBusy(null));
  }, [open]);

  const loadUploads = async () => {
    setUploadsBusy(true);
    try {
      const result = await window.rw.request<{ uploads: UploadedFile[] }>(
        "workspace.uploads"
      );
      setUploads(result.uploads);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "读取附件失败");
    } finally {
      setUploadsBusy(false);
    }
  };

  useEffect(() => {
    if (!open || section !== "workspace") return;
    void loadUploads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, section]);

  const loadSchedules = async () => {
    setScheduleBusy(true);
    try {
      const result = await window.rw.request<{ schedules: typeof schedules }>(
        "schedules.list"
      );
      setSchedules(result.schedules);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "读取定时任务失败");
    } finally {
      setScheduleBusy(false);
    }
  };

  useEffect(() => {
    if (!open || section !== "schedule") return;
    void loadSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, section]);

  const updateSchedule = async (input: {
    enabled?: boolean;
    intervalSeconds?: number;
  }) => {
    const current = schedules[0];
    if (!current) return;
    setScheduleBusy(true);
    try {
      await window.rw.request("schedules.update", {
        id: current.id,
        ...input
      });
      await loadSchedules();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "更新定时任务失败");
    } finally {
      setScheduleBusy(false);
    }
  };

  const runScheduleNow = async () => {
    const current = schedules[0];
    if (!current) return;
    setScheduleBusy(true);
    try {
      await window.rw.request("schedules.runNow", { id: current.id });
      await loadSchedules();
      setMessage("已执行一次巡检，结果在“最近里程碑”里。");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "执行巡检失败");
    } finally {
      setScheduleBusy(false);
    }
  };

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
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiKey: apiKey.trim() || undefined
      });
      setSettings(next);
      setProvider(next.provider);
      setBaseUrl(next.baseUrl);
      setModel(next.model);
      setApiKey("");
      onSaved(next);
      setMessage("模型配置已应用，下一条消息生效。");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "保存模型配置失败");
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
      setError(failure instanceof Error ? failure.message : "保存 Git 设置失败");
    } finally {
      setBusy(null);
    }
  };

  const chooseGitBinary = async () => {
    try {
      const result = await window.rw.chooseGitBinary();
      if (!result.canceled && result.path) setGitBinary(result.path);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "选择 Git 失败");
    }
  };

  const savePermissions = async () => {
    setBusy("permissions");
    setError(null);
    setMessage(null);
    try {
      const next = await window.rw.savePermissions(permissions);
      setSettings(next);
      setPermissions(next.permissionLevel);
      onSaved(next);
      setMessage("权限级别已应用。");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "保存权限设置失败");
    } finally {
      setBusy(null);
    }
  };

  const clearKey = async () => {
    setBusy("clear");
    setError(null);
    setMessage(null);
    try {
      const next = await window.rw.clearApiKey();
      setSettings(next);
      onSaved(next);
      setMessage("已清除 API Key，Agent 回到未配置模型状态。");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "清除 API Key 失败");
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
      setMessage("工作目录已切换，应用正在重载…");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "切换工作目录失败");
      setBusy(null);
    }
  };

  const resetWorkspace = async () => {
    setBusy("workspace");
    setError(null);
    setMessage(null);
    try {
      await window.rw.resetWorkspace();
      setMessage("正在恢复默认工作区，应用将重载…");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "恢复默认工作区失败");
      setBusy(null);
    }
  };

  const deleteUpload = async (path: string) => {
    setUploadsBusy(true);
    try {
      const result = await window.rw.request<{ uploads: UploadedFile[] }>(
        "workspace.deleteUpload",
        { path }
      );
      setUploads(result.uploads);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "删除附件失败");
    } finally {
      setUploadsBusy(false);
    }
  };

  const current =
    SECTIONS.find((entry) => entry.id === section) ?? {
      id: "model" as Section,
      label: "模型",
      title: "模型与接口协议"
    };

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
            {SECTIONS.map((entry) => (
              <button
                type="button"
                key={entry.id}
                className={section === entry.id ? "selected" : ""}
                onClick={() => {
                  setSection(entry.id);
                  setError(null);
                  setMessage(null);
                }}
              >
                <span>{entry.label}</span>
                <small>{entry.title}</small>
              </button>
            ))}
          </nav>
          <div className="settings-sidebar-foot">
            <span>v0.1.0</span>
            <span>本地优先</span>
          </div>
        </aside>

        <main className="settings-content">
          <header className="settings-content-head">
            <span className="eyebrow">{current.label}</span>
            <h2 id="settings-title">{current.title}</h2>
            <p>{SECTION_DESCRIPTION[section]}</p>
          </header>

          {busy === "loading" && <div className="empty-note">读取设置…</div>}

          {settings && section === "model" && (
            <section className="settings-section settings-section-flat">
              <div className="protocol-grid">
                {PROTOCOLS.map((protocol) => (
                  <button
                    type="button"
                    key={protocol.id}
                    className={`protocol-card ${
                      provider === protocol.id ? "selected" : ""
                    }`}
                    onClick={() => setProvider(protocol.id)}
                  >
                    <span className="protocol-mark">{protocol.mark}</span>
                    <span>
                      <strong>{protocol.title}</strong>
                      <small>{protocol.detail}</small>
                    </span>
                    {provider === protocol.id && (
                      <span className="tag green">当前</span>
                    )}
                  </button>
                ))}
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
                  placeholder={
                    provider === "deepseek"
                      ? "https://api.deepseek.com"
                      : "https://api.openai.com/v1"
                  }
                  onChange={(event) => setBaseUrl(event.target.value)}
                />
              </label>

              <div className="settings-field">
                <span>模型</span>
                <ComboBox
                  value={model}
                  ariaLabel="模型"
                  placeholder="模型 ID"
                  options={MODEL_PRESETS}
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
                {settings.apiKeySource === "env" ? " 当前 Key 来自环境变量。" : ""}
              </p>
            </section>
          )}

          {settings && section === "permissions" && (
            <section className="settings-section settings-section-flat">
              <PermissionPicker
                value={permissions}
                onChange={setPermissions}
                disabled={busy !== null}
              />

              <div className="settings-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy !== null}
                  onClick={() => void savePermissions()}
                >
                  {busy === "permissions" ? "应用中…" : "保存权限级别"}
                </button>
              </div>
              <p className="settings-hint">
                权限级别由 Core 强制执行，对 Agent 生效。你在 IDE
                里自己保存文件、输入命令或提交 Git 都不需要审批——执行动作的人本身就是授权。
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
                自定义目录不会被写入演示数据；已有 AGENTS.md 继续生效。
                `.research/`、`.agent/` 与 `uploads/` 会自动写入 .gitignore。
              </p>

              <div className="settings-section-head uploads-head">
                <div>
                  <h3>附件</h3>
                  <p>输入框添加的附件会复制到 `uploads/`，这里可以清理。</p>
                </div>
                <span className="settings-status">{uploads.length} 个</span>
              </div>
              {uploadsBusy && <div className="empty-note">读取附件…</div>}
              {!uploadsBusy && uploads.length === 0 && (
                <p className="settings-hint">还没有附件。</p>
              )}
              {uploads.length > 0 && (
                <div className="uploads-list">
                  {uploads.map((file) => (
                    <div className="uploads-row" key={file.path}>
                      <span className="uploads-name" title={file.path}>
                        {file.name}
                      </span>
                      <small>{Math.max(1, Math.round(file.size / 1024))} KB</small>
                      <button
                        type="button"
                        className="quiet-button"
                        disabled={uploadsBusy}
                        onClick={() => void deleteUpload(file.path)}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
                路径会在保存时用 `git --version` 验证；`.research/`、`.agent/`
                与 `uploads/` 永不进入提交。
              </p>
            </section>
          )}

          {settings && section === "schedule" && (
            <section className="settings-section settings-section-flat">
              <div className="settings-section-head">
                <div>
                  <h3>定时巡检</h3>
                  <p>
                    定期汇总：待确认任务书、停滞运行、待确认事实。只汇报，不会自动跑实验。
                  </p>
                </div>
                <span className="settings-status">
                  {schedules[0]?.enabled ? "已开启" : "已关闭"}
                </span>
              </div>
              {scheduleBusy && <div className="empty-note">读取定时任务…</div>}
              {schedules[0] && (
                <>
                  <div className="settings-field">
                    <span>巡检间隔</span>
                    <ComboBox
                      value={`${Math.round(schedules[0].intervalSeconds / 60)}`}
                      ariaLabel="巡检间隔"
                      placeholder="分钟"
                      options={["5", "15", "30", "60", "180"]}
                      onChange={(value) => {
                        const minutes = Number(value);
                        if (!Number.isFinite(minutes) || minutes < 1) return;
                        void updateSchedule({ intervalSeconds: minutes * 60 });
                      }}
                    />
                  </div>
                  <p className="settings-hint">
                    上次巡检：
                    {schedules[0].lastRunAt
                      ? new Date(schedules[0].lastRunAt).toLocaleString("zh-CN")
                      : "还没跑过"}
                    ；下次约
                    {new Date(schedules[0].nextRunAt).toLocaleString("zh-CN")}
                  </p>
                  <div className="settings-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={scheduleBusy}
                      onClick={() =>
                        void updateSchedule({ enabled: !schedules[0]?.enabled })
                      }
                    >
                      {schedules[0].enabled ? "关闭巡检" : "开启巡检"}
                    </button>
                    <button
                      type="button"
                      className="quiet-button"
                      disabled={scheduleBusy}
                      onClick={() => void runScheduleNow()}
                    >
                      立即检查
                    </button>
                  </div>
                </>
              )}
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
                当前版本支持 OpenAI Chat Completions 协议与 DeepSeek
                原生 Provider；Anthropic Messages 协议尚未接入。
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
