import { useEffect, useRef, useState } from "react";
import { Segmented } from "../Controls";
import { MODEL_PRESETS } from "../models";
import type {
  AppSettings,
  Attachment,
  ChatMessage,
  PermissionMode,
  Permissions
} from "../types";

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
  sendChat
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
  onQuickPermissions: (permissions: Permissions) => void;
  permissionBusy: boolean;
  sendChat: () => Promise<void>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [toolMenu, setToolMenu] = useState<"model" | "permissions" | null>(
    null
  );
  const [permissionDraft, setPermissionDraft] = useState<Permissions>(
    agentConfig?.permissions ?? {
      fileWrite: "ask",
      command: "ask",
      gitCommit: "ask",
      note: "ask"
    }
  );
  const toolsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (agentConfig?.permissions) setPermissionDraft(agentConfig.permissions);
  }, [agentConfig?.permissions]);

  useEffect(() => {
    if (!toolMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!toolsRef.current?.contains(event.target as Node)) setToolMenu(null);
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

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [chatMessages, chatStream, chatRunning]);

  const modelLabel = agentConfig?.model ?? "未配置模型";
  const permissionValues = Object.values(agentConfig?.permissions ?? {});
  const permissionSummary =
    permissionValues.length === 0 ||
    permissionValues.every((value) => value === "ask")
      ? "询问"
      : permissionValues.every((value) => value === "allow")
        ? "允许"
        : permissionValues.every((value) => value === "deny")
          ? "拒绝"
          : "混合";

  return (
    <div className="chat-view">
      <div className="chat-scroll" ref={scrollRef}>
        <div className="live-chat">
          <div className="live-chat-heading">
            <span>Agent 对话 · {conversationLabel}</span>
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
                    {message.mode === "faux" || !message.mode
                      ? "未配置模型"
                      : message.mode === "deepseek"
                        ? "DeepSeek"
                        : "OpenAI 兼容"}
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
                  {chatMode === "faux" || !chatMode
                    ? "未配置模型"
                    : chatMode === "deepseek"
                      ? "DeepSeek"
                      : "OpenAI 兼容"}
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
                            [key]: next as PermissionMode
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
                    <span>OpenAI 兼容端点</span>
                  </div>
                  {MODEL_PRESETS.map((item) => (
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
          {!agentConfig?.hasApiKey
            ? `${modelLabel} · 未配置 Key，将使用离线仿真`
            : `${modelLabel} · ${agentConfig.provider === "deepseek" ? "DeepSeek" : "OpenAI 兼容"} 真实模型会话`}
        </div>
      </div>
    </div>
  );
}
