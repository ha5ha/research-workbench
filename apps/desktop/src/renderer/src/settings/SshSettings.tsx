import { Button, Switch, TextInput } from "@research-workbench/ui";
import { useEffect, useState } from "react";
import {
  SSH_ERROR_MESSAGES,
  type SshProfileSummary,
  type SshSettingsSummary
} from "@research-workbench/contracts";

import "./SshSettings.css";

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const code = Object.keys(SSH_ERROR_MESSAGES).find((key) =>
    message.includes(key)
  );
  return code
    ? SSH_ERROR_MESSAGES[code as keyof typeof SSH_ERROR_MESSAGES]
    : "SSH 设置操作失败，请重试";
}

export function SshSettings() {
  const [settings, setSettings] = useState<SshSettingsSummary | null>(null);
  const [selected, setSelected] = useState<SshProfileSummary | null>(null);
  const [label, setLabel] = useState("");
  const [hostname, setHostname] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>("loading");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void window.rw
      .getSshSettings()
      .then((next) => {
        if (!active) return;
        setSettings(next);
        setRemember(next.encryptionAvailable);
      })
      .catch((failure) => {
        if (active) setError(errorMessage(failure));
      })
      .finally(() => {
        if (active) setBusy(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const choose = (profile: SshProfileSummary | null) => {
    setSelected(profile);
    setLabel(profile?.label ?? "");
    setHostname(profile?.hostname ?? "");
    setPort(String(profile?.port ?? 22));
    setUsername(profile?.username ?? "");
    setPassword("");
    setCandidate(null);
    setRemember(
      profile
        ? profile.credentialStorage !== "session"
        : Boolean(settings?.encryptionAvailable)
    );
    setError(null);
    setMessage(null);
  };
  const dirty = Boolean(
    selected &&
    (label !== selected.label ||
      hostname !== selected.hostname ||
      Number(port) !== selected.port ||
      username !== selected.username ||
      password)
  );

  const applySummary = (next: SshSettingsSummary, id = selected?.id) => {
    setSettings(next);
    const profile = next.profiles.find((item) => item.id === id) ?? null;
    setSelected(profile);
    if (profile) {
      setLabel(profile.label);
      setHostname(profile.hostname);
      setPort(String(profile.port));
      setUsername(profile.username);
    }
    setCandidate(null);
  };

  const perform = async (operation: string, action: () => Promise<void>) => {
    setBusy(operation);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  };

  const save = () => {
    const pendingPassword = password;
    setPassword("");
    void perform("save", async () => {
      const next = await window.rw.saveSshProfile({
        ...(selected ? { id: selected.id } : {}),
        label: label.trim(),
        hostname: hostname.trim(),
        port: Number(port),
        username: username.trim(),
        rememberPassword: remember,
        ...(pendingPassword ? { password: pendingPassword } : {})
      });
      const id =
        selected?.id ??
        next.profiles.find(
          (item) =>
            !settings?.profiles.some((previous) => previous.id === item.id)
        )?.id;
      applySummary(next, id);
      setMessage("连接设置已保存。请核对主机指纹，再测试密码连接。");
    });
  };

  return (
    <section className="settings-section settings-section-flat ssh-settings">
      <div className="settings-section-head">
        <div>
          <h3>密码连接</h3>
          <p>
            先保存连接信息，再核对指纹并测试。原有 OpenSSH 密钥别名可继续使用。
          </p>
        </div>
        <Button
          variant="default"
          type="button"

          disabled={Boolean(busy)}
          onClick={() => choose(null)}
        >
          新建连接
        </Button>
      </div>
      {busy === "loading" && <p className="empty-note">读取 SSH 设置…</p>}
      {settings && settings.profiles.length > 0 && (
        <div className="ssh-profile-list" aria-label="已保存 SSH 连接">
          {settings.profiles.map((profile) => (
            <button
              type="button"
              key={profile.id}
              disabled={Boolean(busy)}
              className={`ssh-profile-row ${selected?.id === profile.id ? "selected" : ""}`}
              aria-pressed={selected?.id === profile.id}
              onClick={() => choose(profile)}
            >
              <span>
                <strong>{profile.label}</strong>
                <small>
                  {profile.username}@{profile.hostname}:{profile.port}
                </small>
              </span>
              <small>
                {profile.hostKeySha256 ? "指纹已确认" : "待确认指纹"} ·{" "}
                {profile.hasCredential ? "密码已提供" : "未提供密码"}
              </small>
            </button>
          ))}
        </div>
      )}
      {settings && (
        <>
          <div className="ssh-field-grid">
            <label className="settings-field">
              <span>连接名称</span>
              <TextInput
                value={label}
                maxLength={100}
                disabled={Boolean(busy)}
                onChange={(event) => setLabel(event.target.value)}
              />
            </label>
            <label className="settings-field">
              <span>主机地址</span>
              <TextInput
                value={hostname}
                maxLength={253}
                disabled={Boolean(busy)}
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) => {
                  setHostname(event.target.value);
                  setCandidate(null);
                }}
              />
            </label>
            <label className="settings-field">
              <span>端口</span>
              <TextInput
                value={port}
                type="number"
                min={1}
                max={65535}
                disabled={Boolean(busy)}
                onChange={(event) => {
                  setPort(event.target.value);
                  setCandidate(null);
                }}
              />
            </label>
            <label className="settings-field">
              <span>用户名</span>
              <TextInput
                value={username}
                maxLength={100}
                disabled={Boolean(busy)}
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setCandidate(null);
                }}
              />
            </label>
          </div>
          <label className="settings-field">
            <span>密码</span>
            <TextInput
              type="password"
              value={password}
              maxLength={1024}
              disabled={Boolean(busy)}
              autoComplete="new-password"
              spellCheck={false}
              placeholder={
                selected?.hasCredential
                  ? "已提供，留空保持不变"
                  : "输入 SSH 登录密码"
              }
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <Switch
            checked={remember}
            onChange={(value) => {
              if (settings.encryptionAvailable && !busy) setRemember(value);
            }}
            label="加密保存新密码"
            description={
              settings.encryptionAvailable
                ? "关闭后，新输入的密码仅保留到应用退出。"
                : "系统加密不可用，密码仅保留到应用退出。"
            }
          />
          <div className="settings-actions ssh-actions">
            <Button
              variant="primary"
              type="button"

              disabled={
                Boolean(busy) ||
                !label.trim() ||
                !hostname.trim() ||
                !username.trim()
              }
              onClick={save}
            >
              {busy === "save" ? "保存中…" : "保存连接"}
            </Button>
            <Button
              variant="default"
              type="button"

              disabled={Boolean(busy)}
              onClick={() => choose(selected)}
            >
              取消编辑
            </Button>
            {selected?.hasCredential && (
              <Button
                variant="default"
                type="button"

                disabled={Boolean(busy)}
                onClick={() => {
                  setPassword("");
                  void perform("clear", async () => {
                    applySummary(
                      await window.rw.clearSshCredential(selected.id)
                    );
                    setMessage("密码已清除。连接信息和已有运行记录保留。");
                  });
                }}
              >
                清除密码
              </Button>
            )}
          </div>
          {selected && (
            <>
              <p className="settings-hint">
                运行主机别名：<code>{selected.id}</code>
              </p>
              <p className="settings-hint">
                {selected.hostKeySha256
                  ? "已确认的主机指纹"
                  : "尚未确认主机指纹"}
              </p>
              {selected.hostKeySha256 && (
                <code className="settings-path">{selected.hostKeySha256}</code>
              )}
              <div className="settings-actions ssh-actions">
                <Button
                  variant="default"
                  type="button"

                  disabled={Boolean(busy) || dirty}
                  onClick={() =>
                    void perform("probe", async () => {
                      const result = await window.rw.probeSshHostKey(
                        selected.id
                      );
                      setCandidate(result.hostKeySha256);
                    })
                  }
                >
                  {busy === "probe" ? "读取中…" : "读取主机指纹"}
                </Button>
                <Button
                  variant="default"
                  type="button"

                  disabled={
                    Boolean(busy) ||
                    dirty ||
                    !selected.hostKeySha256 ||
                    !selected.hasCredential
                  }
                  onClick={() =>
                    void perform("test", async () => {
                      await window.rw.testSshConnection(selected.id);
                      setMessage("SSH 密码连接成功，可以按冻结计划运行。");
                    })
                  }
                >
                  {busy === "test" ? "测试中…" : "测试连接"}
                </Button>
              </div>
              {dirty && (
                <p className="settings-hint">
                  请先保存当前修改，再读取指纹或测试连接。
                </p>
              )}
              {candidate && (
                <div className="ssh-fingerprint-review">
                  <strong>请与服务器管理员或可信终端核对</strong>
                  <code className="settings-path">{candidate}</code>
                  {selected.hostKeySha256 &&
                    selected.hostKeySha256 !== candidate && (
                      <p className="settings-hint">
                        主机指纹已改变。确认后连接版本会更新，旧计划需要重新冻结与审批。
                      </p>
                    )}
                  <div className="settings-actions ssh-actions">
                    <Button
                      variant="primary"
                      type="button"

                      disabled={Boolean(busy) || dirty}
                      onClick={() =>
                        void perform("confirm", async () => {
                          applySummary(
                            await window.rw.confirmSshHostKey(
                              selected.id,
                              candidate
                            )
                          );
                          setMessage("主机指纹已确认，可以测试连接。");
                        })
                      }
                    >
                      已核对，确认此指纹
                    </Button>
                    <Button
                      variant="default"
                      type="button"

                      disabled={Boolean(busy)}
                      onClick={() => setCandidate(null)}
                    >
                      取消
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
          <p className="settings-hint">
            主机地址、端口或用户名变更后，旧密码与指纹会清除。密码不会进入对话、运行计划或远端任务环境。
          </p>
        </>
      )}
      {error && (
        <div className="error-card" role="alert">
          <p>{error}</p>
        </div>
      )}
      {message && (
        <p className="settings-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
