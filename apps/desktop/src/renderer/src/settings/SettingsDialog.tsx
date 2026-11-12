import {
  Button,
  ComboBox,
  Switch,
  Icon,
  IconButton,
  TextInput
} from "@research-workbench/ui";
import { useCallback, useEffect, useRef, useState } from "react";

import { PermissionPicker } from "../components/PermissionPicker";
import { MODEL_PRESETS } from "../models";
import { SshSettings } from "./SshSettings";
import type { Schedule } from "@research-workbench/contracts";
import type { AppSettings, PermissionLevel, UploadedFile } from "../types";

type Section =
  "model" | "permissions" | "workspace" | "git" | "ssh" | "schedule" | "about";

const SECTIONS: Array<{ id: Section; label: string; title: string }> = [
  { id: "model", label: "模型", title: "模型与接口协议" },
  { id: "permissions", label: "权限", title: "工具权限" },
  { id: "workspace", label: "工作区", title: "项目工作目录" },
  { id: "git", label: "Git", title: "版本控制" },
  { id: "ssh", label: "SSH", title: "远端计算连接" },
  { id: "schedule", label: "检测", title: "定时检测" },
  { id: "about", label: "关于", title: "运行信息" }
];

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
    detail: "DeepSeek API；支持推理配置。"
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, [open]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [section, setSection] = useState<Section>("model");
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<"deepseek" | "openai-compatible">(
    "openai-compatible"
  );
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [gitBinary, setGitBinary] = useState("");
  const [autoCommit, setAutoCommit] = useState(false);
  const [permissions, setPermissions] =
    useState<PermissionLevel>("workspace-write");
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  const [uploadsBusy, setUploadsBusy] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
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
      const result = await window.rw.request("workspace.uploads");
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
  }, [open, section]);

  const loadSchedules = useCallback(async () => {
    setScheduleBusy(true);
    try {
      const result = await window.rw.request("schedules.list");
      setSchedules(result.schedules);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "读取定时任务失败");
    } finally {
      setScheduleBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!open || section !== "schedule") return;
    void loadSchedules();
  }, [open, section, loadSchedules]);

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
      setError(
        failure instanceof Error ? failure.message : "恢复默认工作区失败"
      );
      setBusy(null);
    }
  };

  const deleteUpload = async (path: string) => {
    setUploadsBusy(true);
    try {
      const result = await window.rw.request("workspace.deleteUpload", {
        path
      });
      setUploads(result.uploads);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "删除附件失败");
    } finally {
      setUploadsBusy(false);
    }
  };

  const current = SECTIONS.find((entry) => entry.id === section) ?? {
    id: "model" as Section,
    label: "模型",
    title: "模型与接口协议"
  };

  return (
    <dialog
      ref={dialogRef}
      className="settings-backdrop"
      aria-labelledby="settings-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        className="settings-dialog settings-wide"
        onClick={(event) => event.stopPropagation()}
      >
        <IconButton
          className="settings-close"
          aria-label="关闭设置"
          onClick={onClose}
        >
          <Icon name="x" />
        </IconButton>
        <aside className="settings-sidebar">
          <div className="settings-sidebar-head">
            <div>
              <span className="eyebrow">Agent 设置</span>
              <strong>Research Workbench</strong>
            </div>
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
            <span>{settings ? `v${settings.appVersion}` : "读取版本…"}</span>
            <span>本地优先</span>
          </div>
        </aside>

        <main className="settings-content">
          <header className="settings-content-head">
            <h2 id="settings-title">{current.title}</h2>
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
                    aria-pressed={provider === protocol.id}
                    onClick={() => setProvider(protocol.id)}
                  >
                    <span className="protocol-mark">{protocol.mark}</span>
                    <span>
                      <strong>{protocol.title}</strong>
                      <small>{protocol.detail}</small>
                    </span>
                    {provider === protocol.id && (
                      <span className="tag">已选</span>
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
                <TextInput
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
                <TextInput
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
                <Button
                  variant="primary"
                  type="button"

                  disabled={busy !== null || !model.trim()}
                  onClick={() => void saveProvider()}
                >
                  {busy === "save" ? "应用中…" : "保存并应用"}
                </Button>
                {settings.hasApiKey && (
                  <Button
                    variant="default"
                    type="button"

                    disabled={busy !== null}
                    onClick={() => void clearKey()}
                  >
                    {busy === "clear" ? "清除中…" : "清除 Key"}
                  </Button>
                )}
              </div>
              <p className="settings-hint">
                API Key 仅加密保存在本机。
                {settings.apiKeySource === "env"
                  ? " 当前 Key 来自环境变量。"
                  : ""}
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
                <Button
                  variant="primary"
                  type="button"

                  disabled={busy !== null}
                  onClick={() => void savePermissions()}
                >
                  {busy === "permissions" ? "应用中…" : "保存权限级别"}
                </Button>
              </div>
              <p className="settings-hint">
                仅控制 Agent 操作，手动编辑和执行命令由你决定。
              </p>
            </section>
          )}

          {settings && section === "workspace" && (
            <section className="settings-section settings-section-flat">
              <div className="settings-section-head">
                <div>
                  <h3>当前项目目录</h3>
                  <p>切换目录后将重新载入项目。</p>
                </div>
                <span className="settings-status">
                  {settings.isDefaultWorkspace ? "默认工作区" : "自定义项目"}
                </span>
              </div>
              <code className="settings-path">{settings.workspace}</code>
              <div className="settings-actions">
                <Button
                  variant="primary"
                  type="button"

                  disabled={busy !== null}
                  onClick={() => void chooseWorkspace()}
                >
                  {busy === "workspace" ? "切换中…" : "选择目录…"}
                </Button>
                {!settings.isDefaultWorkspace && (
                  <Button
                    variant="default"
                    type="button"

                    disabled={busy !== null}
                    onClick={() => void resetWorkspace()}
                  >
                    恢复默认
                  </Button>
                )}
              </div>
              <p className="settings-hint">
                研究记录与附件保存在项目目录，自动排除 Git 提交。
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
                      <small>
                        {Math.max(1, Math.round(file.size / 1024))} KB
                      </small>
                      <Button
                        variant="default"
                        type="button"

                        disabled={uploadsBusy}
                        onClick={() => void deleteUpload(file.path)}
                      >
                        删除
                      </Button>
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
                  <TextInput
                    value={gitBinary}
                    spellCheck={false}
                    placeholder="git"
                    onChange={(event) => setGitBinary(event.target.value)}
                  />
                  <Button
                    variant="default"
                    type="button"

                    onClick={() => void chooseGitBinary()}
                  >
                    浏览…
                  </Button>
                </div>
              </label>
              <Switch
                checked={autoCommit}
                onChange={setAutoCommit}
                label="自动提交可归属的 Agent 文件修改"
                description="默认关闭；只提交原本干净且版本未再变化的文件。终端和其他改动请在 Git 面板审阅提交。"
              />
              <div className="settings-actions">
                <Button
                  variant="primary"
                  type="button"

                  disabled={busy !== null}
                  onClick={() => void saveGit()}
                >
                  {busy === "git" ? "应用中…" : "保存 Git 设置"}
                </Button>
              </div>
              <p className="settings-hint">提交会忽略内部记录与附件。</p>
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
                    <Button
                      variant="primary"
                      type="button"

                      disabled={scheduleBusy}
                      onClick={() =>
                        void updateSchedule({ enabled: !schedules[0]?.enabled })
                      }
                    >
                      {schedules[0].enabled ? "关闭巡检" : "开启巡检"}
                    </Button>
                    <Button
                      variant="default"
                      type="button"

                      disabled={scheduleBusy}
                      onClick={() => void runScheduleNow()}
                    >
                      立即检查
                    </Button>
                  </div>
                </>
              )}
            </section>
          )}

          {section === "ssh" && <SshSettings />}

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
    </dialog>
  );
}
