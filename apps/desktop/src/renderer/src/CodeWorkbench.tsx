import {
  Button,
  Icon,
  IconButton,
  TextInput,
  TextArea
} from "@research-workbench/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LSPClient, languageServerExtensions } from "@codemirror/lsp-client";
import { CodeEditor } from "./CodeEditor";

type WorkspaceEntry = {
  path: string;
  name: string;
  type: "file" | "directory";
  depth: number;
};
type OpenTab = {
  path: string;
  content: string;
  original: string;
};
type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
};
type GitFileChange = {
  path: string;
  status: string;
  staged: boolean;
};
type GitStatus = {
  available: boolean;
  reason?: string;
  branch?: string;
  ahead?: number;
  behind?: number;
  staged: GitFileChange[];
  working: GitFileChange[];
};
type GitCommitInfo = {
  hash: string;
  message: string;
  date: string;
  author: string;
};

export function CodeWorkbench({
  onBack,
  onOpenSettings,
  workspaceRoot,
  projectName,
  openPathRequest
}: {
  onBack: () => void;
  onOpenSettings: () => void;
  workspaceRoot: string | null;
  projectName: string;
  openPathRequest: { path: string; nonce: number } | null;
}) {
  const [sideMode, setSideMode] = useState<"files" | "git">("files");
  const [lspClient, setLspClient] = useState<LSPClient | null>(null);
  const [lspStatus, setLspStatus] = useState<
    "off" | "starting" | "ready" | "error"
  >("off");
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [treeLoading, setTreeLoading] = useState(true);
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [terminalCommand, setTerminalCommand] = useState("");
  const [terminalHistory, setTerminalHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [terminalResult, setTerminalResult] = useState<CommandResult | null>(
    null
  );
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitLog, setGitLog] = useState<GitCommitInfo[]>([]);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);
  const [gitDiff, setGitDiff] = useState<{
    path: string;
    staged: boolean;
    diff: string;
  } | null>(null);
  const [gitDiffLoading, setGitDiffLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitNote, setCommitNote] = useState<string | null>(null);

  const active = tabs.find((tab) => tab.path === activePath) ?? null;
  const dirty = active !== null && active.content !== active.original;
  const dirtyCount = tabs.filter((tab) => tab.content !== tab.original).length;
  const gitChangeCount =
    (gitStatus?.staged.length ?? 0) + (gitStatus?.working.length ?? 0);

  /**
   * Open tabs survive leaving the IDE: leaving used to unmount this component
   * and silently drop every open buffer, including unsaved edits.
   */
  const tabsKey = workspaceRoot ? `rw.ide.tabs.${workspaceRoot}` : null;
  const restoredFor = useRef<string | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (!tabsKey || restoredFor.current === tabsKey) return;
    restoredFor.current = tabsKey;
    try {
      const raw = sessionStorage.getItem(tabsKey);
      if (raw) {
        const saved = JSON.parse(raw) as {
          tabs?: OpenTab[];
          activePath?: string | null;
        };
        if (Array.isArray(saved.tabs)) setTabs(saved.tabs);
        if (saved.activePath) setActivePath(saved.activePath);
      }
    } catch {
      // Ignore unreadable restore state.
    }
    setRestored(true);
  }, [tabsKey]);

  useEffect(() => {
    if (!tabsKey || !restored) return;
    sessionStorage.setItem(tabsKey, JSON.stringify({ tabs, activePath }));
  }, [tabs, activePath, tabsKey, restored]);

  const confirmDiscard = (message: string): boolean => window.confirm(message);

  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    setTreeError(null);
    try {
      const next = await window.rw.request<WorkspaceEntry[]>("workspace.tree");
      setEntries(next);
    } catch (failure) {
      setTreeError(
        failure instanceof Error ? failure.message : "读取文件树失败"
      );
    } finally {
      setTreeLoading(false);
    }
  }, []);

  const loadGit = useCallback(async () => {
    setGitLoading(true);
    setGitError(null);
    try {
      const [status, log] = await Promise.all([
        window.rw.request<GitStatus>("git.status"),
        window.rw.request<GitCommitInfo[]>("git.log")
      ]);
      setGitStatus(status);
      setGitLog(log);
    } catch (failure) {
      setGitError(
        failure instanceof Error ? failure.message : "读取 Git 状态失败"
      );
    } finally {
      setGitLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTree();
    void loadGit();
  }, [loadTree, loadGit]);

  useEffect(() => {
    if (sideMode === "git") void loadGit();
  }, [sideMode, loadGit]);

  const visibleEntries = useMemo(() => {
    let hiddenDepth: number | null = null;
    return entries.filter((entry) => {
      if (hiddenDepth !== null) {
        if (entry.depth > hiddenDepth) return false;
        hiddenDepth = null;
      }
      if (entry.type === "directory" && collapsedDirs.has(entry.path)) {
        hiddenDepth = entry.depth;
      }
      return true;
    });
  }, [entries, collapsedDirs]);

  const openPath = async (path: string) => {
    const existing = tabs.find((tab) => tab.path === path);
    if (existing) {
      setActivePath(path);
      setGitDiff(null);
      setSideMode("files");
      return;
    }
    setFileBusy(true);
    setFileError(null);
    setSaveNote(null);
    try {
      const file = await window.rw.request<{
        path: string;
        content: string;
      }>("workspace.read", { path });
      setTabs((current) => [
        ...current,
        { path: file.path, content: file.content, original: file.content }
      ]);
      setActivePath(file.path);
      setGitDiff(null);
      setSideMode("files");
    } catch (failure) {
      setFileError(failure instanceof Error ? failure.message : "读取文件失败");
    } finally {
      setFileBusy(false);
    }
  };

  useEffect(() => {
    if (openPathRequest) {
      void openPath(openPathRequest.path);
    }
    // openPathRequest has a nonce so repeated requests still fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPathRequest]);

  const closeTab = (path: string) => {
    const target = tabs.find((tab) => tab.path === path);
    if (
      target &&
      target.content !== target.original &&
      !confirmDiscard(`${path} 有未保存的修改，仍然关闭？`)
    ) {
      return;
    }
    setTabs((current) => {
      const next = current.filter((tab) => tab.path !== path);
      if (activePath === path) {
        setActivePath(next.at(-1)?.path ?? null);
      }
      return next;
    });
  };

  const saveFile = async () => {
    if (!active || fileBusy) return;
    setFileBusy(true);
    setFileError(null);
    setSaveNote(null);
    try {
      const result = await window.rw.request<{
        path: string;
        size: number;
      }>("workspace.write", {
        path: active.path,
        content: active.content
      });
      setTabs((current) =>
        current.map((tab) =>
          tab.path === active.path ? { ...tab, original: tab.content } : tab
        )
      );
      setSaveNote(`已保存 ${result.path} · ${result.size} B`);
      void loadGit();
    } catch (failure) {
      setFileError(failure instanceof Error ? failure.message : "保存失败");
    } finally {
      setFileBusy(false);
    }
  };

  const runCommand = async () => {
    if (!terminalCommand.trim() || terminalRunning) return;
    const command = terminalCommand;
    setTerminalHistory((current) => [...current, command].slice(-50));
    setHistoryIndex(-1);
    setTerminalRunning(true);
    setTerminalError(null);
    setTerminalResult(null);
    try {
      const result = await window.rw.request<CommandResult>("terminal.run", {
        command
      });
      setTerminalResult(result);
      void loadGit();
    } catch (failure) {
      setTerminalError(
        failure instanceof Error ? failure.message : "命令执行失败"
      );
    } finally {
      setTerminalRunning(false);
    }
  };

  const recallHistory = (direction: -1 | 1) => {
    if (terminalHistory.length === 0) return;
    const base = historyIndex < 0 ? terminalHistory.length : historyIndex;
    const next = base + direction;
    if (next < 0) {
      setHistoryIndex(-1);
      setTerminalCommand("");
      return;
    }
    if (next >= terminalHistory.length) {
      setHistoryIndex(-1);
      setTerminalCommand("");
      return;
    }
    setHistoryIndex(next);
    setTerminalCommand(terminalHistory[next] ?? "");
  };

  const openGitDiff = async (file: GitFileChange) => {
    setGitDiffLoading(true);
    setGitError(null);
    try {
      const result = await window.rw.request<{
        path: string;
        staged: boolean;
        diff: string;
      }>("git.diff", { path: file.path, staged: file.staged });
      setGitDiff(result);
    } catch (failure) {
      setGitError(
        failure instanceof Error ? failure.message : "读取 Git diff 失败"
      );
    } finally {
      setGitDiffLoading(false);
    }
  };

  const stageFiles = async (paths: string[]) => {
    setGitError(null);
    try {
      await window.rw.request("git.stage", { paths });
      await loadGit();
    } catch (failure) {
      setGitError(failure instanceof Error ? failure.message : "暂存失败");
    }
  };

  const unstageFiles = async (paths: string[]) => {
    setGitError(null);
    try {
      await window.rw.request("git.unstage", { paths });
      await loadGit();
    } catch (failure) {
      setGitError(failure instanceof Error ? failure.message : "取消暂存失败");
    }
  };

  const commit = async () => {
    if (!commitMessage.trim() || commitBusy) return;
    setCommitBusy(true);
    setCommitNote(null);
    setGitError(null);
    try {
      const result = await window.rw.request<{ commit: string }>("git.commit", {
        message: commitMessage
      });
      setCommitNote(`已提交 ${result.commit.slice(0, 8)}`);
      setCommitMessage("");
      await loadGit();
    } catch (failure) {
      setGitError(failure instanceof Error ? failure.message : "提交失败");
    } finally {
      setCommitBusy(false);
    }
  };

  useEffect(() => {
    if (!workspaceRoot) return;
    let active = true;
    let socket: WebSocket | null = null;
    let client: LSPClient | null = null;
    setLspStatus("starting");
    void window.rw
      .request<{ url: string; server: string } | null>("lsp.start")
      .then(async (endpoint) => {
        if (!active) return;
        if (!endpoint) {
          setLspStatus("off");
          return;
        }
        socket = new WebSocket(endpoint.url);
        const handlers = new Set<(value: string) => void>();
        socket.onmessage = (event) => {
          for (const handler of handlers) handler(String(event.data));
        };
        await new Promise<void>((resolve, reject) => {
          socket!.onopen = () => resolve();
          socket!.onerror = () => reject(new Error("LSP WebSocket 连接失败"));
        });
        if (!active) {
          socket.close();
          return;
        }
        client = new LSPClient({
          rootUri: fileUri(workspaceRoot, ""),
          extensions: languageServerExtensions()
        }).connect({
          send(message) {
            socket?.send(message);
          },
          subscribe(handler) {
            handlers.add(handler);
          },
          unsubscribe(handler) {
            handlers.delete(handler);
          }
        });
        setLspClient(client);
        setLspStatus("ready");
      })
      .catch(() => {
        if (active) setLspStatus("error");
      });
    return () => {
      active = false;
      client?.disconnect();
      socket?.close();
      setLspClient(null);
      setLspStatus("off");
    };
  }, [workspaceRoot]);

  return (
    <div className="ide-workbench">
      <header className="ide-toolbar">
        <div className="ide-toolbar-left">
          <Button
            variant="ghost"
            type="button"
            className="ide-back"
            onClick={() => {
              if (
                dirtyCount > 0 &&
                !confirmDiscard(
                  `还有 ${dirtyCount} 个文件未保存，仍然返回对话？未保存内容会保留在编辑器里。`
                )
              ) {
                return;
              }
              onBack();
            }}
          >
            <Icon name="chevron-left" />
            对话
          </Button>
          <IconButton
            type="button"
            title="刷新文件与 Git"
            aria-label="刷新文件与 Git"
            onClick={() => {
              void loadTree();
              void loadGit();
            }}
          >
            <Icon name="refresh-cw" />
          </IconButton>
          <span className="ide-project">{projectName}</span>
          <span className="ide-branch">
            {gitStatus?.available ? (gitStatus.branch ?? "detached") : "no git"}
          </span>
        </div>
        <div className="ide-toolbar-right">
          {lspStatus !== "off" && (
            <span className={`lsp-badge ${lspStatus}`} title="TypeScript LSP">
              {lspStatus === "ready"
                ? "TS LSP"
                : lspStatus === "error"
                  ? "LSP 失败"
                  : "LSP…"}
            </span>
          )}
          <Button
            variant="ghost"
            type="button"
            className={`ide-panel-toggle ${terminalOpen ? "active" : ""}`}
            onClick={() => setTerminalOpen((open) => !open)}
            title={terminalOpen ? "收起命令面板" : "打开命令面板"}
            aria-expanded={terminalOpen}
          >
            <Icon name="terminal" />
            命令{" "}
            <Icon
              size={14}
              name={terminalOpen ? "chevron-down" : "chevron-up"}
            />
          </Button>
        </div>
      </header>

      <div className="code-shell ide-shell">
        <aside className="code-files">
          <div className="code-side-tabs">
            <button
              type="button"
              className={sideMode === "files" ? "selected" : ""}
              onClick={() => setSideMode("files")}
            >
              文件
            </button>
            <button
              type="button"
              className={sideMode === "git" ? "selected" : ""}
              onClick={() => setSideMode("git")}
            >
              Git
              {gitChangeCount > 0 && (
                <span className="git-count">{gitChangeCount}</span>
              )}
            </button>
          </div>

          {sideMode === "files" ? (
            <>
              <div className="code-group">workspace</div>
              {treeLoading && <div className="empty-note">读取文件树…</div>}
              {treeError && (
                <div className="error-card" role="alert">
                  <p>{treeError}</p>
                </div>
              )}
              {visibleEntries.map((entry) => (
                <button
                  type="button"
                  key={entry.path}
                  className={`code-file ${activePath === entry.path ? "selected" : ""} ${entry.type}`}
                  style={{ paddingLeft: 8 + entry.depth * 12 }}
                  onClick={() => {
                    if (entry.type === "directory") {
                      setCollapsedDirs((current) => {
                        const next = new Set(current);
                        if (next.has(entry.path)) next.delete(entry.path);
                        else next.add(entry.path);
                        return next;
                      });
                    } else {
                      void openPath(entry.path);
                    }
                  }}
                >
                  <Icon
                    size={14}
                    className="file-type"
                    name={
                      entry.type === "directory"
                        ? collapsedDirs.has(entry.path)
                          ? "chevron-right"
                          : "chevron-down"
                        : "file"
                    }
                  />
                  {entry.name}
                </button>
              ))}
              {!treeLoading && !treeError && entries.length === 0 && (
                <div className="empty-note">工作区为空。</div>
              )}
            </>
          ) : (
            <GitPanel
              status={gitStatus}
              log={gitLog}
              loading={gitLoading}
              error={gitError}
              selectedPath={gitDiff?.path ?? null}
              onRefresh={() => void loadGit()}
              onOpenFile={(file) => void openGitDiff(file)}
              onStage={(paths) => void stageFiles(paths)}
              onUnstage={(paths) => void unstageFiles(paths)}
              commitMessage={commitMessage}
              onCommitMessage={setCommitMessage}
              commitBusy={commitBusy}
              onCommit={() => void commit()}
              commitNote={commitNote}
            />
          )}
        </aside>

        <div className="code-main">
          <div className="editor-tabs">
            {tabs.length === 0 && (
              <span className="empty-note">从左侧打开文件</span>
            )}
            {tabs.map((tab) => (
              <div
                key={tab.path}
                className={`editor-tab ${activePath === tab.path ? "selected" : ""}`}
              >
                <button
                  type="button"
                  className="editor-tab-label"
                  onClick={() => {
                    setActivePath(tab.path);
                    setGitDiff(null);
                  }}
                >
                  {tab.path.split("/").at(-1)}
                  {tab.content !== tab.original && (
                    <span className="dirty-dot" title="未保存" />
                  )}
                </button>
                <IconButton
                  type="button"
                  className="editor-tab-close"
                  aria-label={`关闭 ${tab.path}`}
                  onClick={() => closeTab(tab.path)}
                >
                  <Icon name="x" size={14} />
                </IconButton>
              </div>
            ))}
          </div>

          <div className="code-toolbar">
            <div className="code-tab">
              {gitDiff
                ? `Git diff · ${gitDiff.path}`
                : (active?.path ?? "未选择文件")}
            </div>
            <div className="code-toolbar-actions">
              {saveNote && <span className="muted">{saveNote}</span>}
              {gitDiff ? (
                <Button
                  variant="default"
                  type="button"

                  onClick={() => setGitDiff(null)}
                >
                  返回编辑器
                </Button>
              ) : (
                <Button
                  variant="primary"
                  type="button"

                  onClick={() => void saveFile()}
                  disabled={!active || !dirty || fileBusy}
                >
                  {fileBusy ? "处理中…" : "保存"}
                </Button>
              )}
            </div>
          </div>

          {fileError && (
            <div className="error-card code-error" role="alert">
              <p>{fileError}</p>
            </div>
          )}

          {gitDiff ? (
            <div className="git-diff-wrap">
              {gitDiffLoading ? (
                <div className="code-empty">读取 diff…</div>
              ) : (
                <div className="diff-view git-diff-view">
                  {(gitDiff.diff || "No diff")
                    .split("\n")
                    .map((line, index) => (
                      <div
                        key={index}
                        className={`diff-line ${diffLineClass(line)}`}
                      >
                        {line || " "}
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : active ? (
            <CodeEditor
              key={`${active.path}-${lspClient ? "lsp" : "plain"}`}
              path={active.path}
              value={active.content}
              lsp={
                lspClient && workspaceRoot && supportsLsp(active.path)
                  ? {
                      client: lspClient,
                      uri: fileUri(workspaceRoot, active.path),
                      languageId: languageIdFor(active.path)
                    }
                  : undefined
              }
              onChange={(value) =>
                setTabs((current) =>
                  current.map((tab) =>
                    tab.path === active.path ? { ...tab, content: value } : tab
                  )
                )
              }
              onSave={() => void saveFile()}
            />
          ) : (
            <div className="code-empty">
              从左侧选择一个文件。保存会先请求审批。
            </div>
          )}

          {terminalOpen && (
            <div className="terminal-panel">
              <div className="terminal-head">
                <span>命令</span>
                <span className="muted">
                  工作区根目录 · 单次执行 · 30s 超时
                </span>
              </div>
              <div className="terminal-input-row">
                <span className="terminal-prompt">$</span>
                <TextInput
                  className="terminal-input"
                  value={terminalCommand}
                  placeholder="输入命令，↑/↓ 调取历史"
                  onChange={(event) => setTerminalCommand(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void runCommand();
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      recallHistory(-1);
                    }
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      recallHistory(1);
                    }
                  }}
                  disabled={terminalRunning}
                  aria-label="命令"
                />
                <Button
                  variant="default"
                  type="button"

                  onClick={() => void runCommand()}
                  disabled={terminalRunning || !terminalCommand.trim()}
                >
                  {terminalRunning ? "运行中…" : "运行"}
                </Button>
              </div>
              {terminalError && (
                <div className="terminal-error" role="alert">
                  {terminalError}
                </div>
              )}
              {terminalResult && (
                <pre className="terminal-output">
                  {terminalResult.stdout}
                  {terminalResult.stderr}
                  {terminalResult.timedOut
                    ? "\n[command timed out]"
                    : `\n[exit ${terminalResult.exitCode ?? "?"}]`}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="ide-statusbar">
        <IconButton
          type="button"
          className="ide-status-settings"
          title="设置"
          aria-label="打开设置"
          onClick={onOpenSettings}
        >
          <Icon name="settings" />
        </IconButton>
        <span>{dirty ? `未保存 · ${dirtyCount} 个文件` : "已保存"}</span>
        <span className="mono">{activePath ?? "no file"}</span>
        <span className="ide-status-right">
          {gitStatus?.available ? (gitStatus.branch ?? "detached") : "no git"} ·
          UTF-8
        </span>
      </footer>
    </div>
  );
}

function supportsLsp(path: string): boolean {
  return /\.(tsx?|jsx?|mjs|cjs)$/i.test(path);
}

function languageIdFor(path: string): string {
  return /\.(tsx?)$/i.test(path) ? "typescript" : "javascript";
}

function fileUri(root: string, path: string): string {
  const full = `${root.replace(/\\/g, "/")}/${path.replace(/\\/g, "/")}`;
  const encoded = encodeURI(full).replace(/#/g, "%23");
  return `file:///${encoded}`.replace(
    /^file:\/\/\/([A-Z]):/,
    (_match, drive: string) => `file:///${drive.toLowerCase()}%3A`
  );
}

function GitPanel({
  status,
  log,
  loading,
  error,
  selectedPath,
  onRefresh,
  onOpenFile,
  onStage,
  onUnstage,
  commitMessage,
  onCommitMessage,
  commitBusy,
  onCommit,
  commitNote
}: {
  status: GitStatus | null;
  log: GitCommitInfo[];
  loading: boolean;
  error: string | null;
  selectedPath: string | null;
  onRefresh: () => void;
  onOpenFile: (file: GitFileChange) => void;
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  commitMessage: string;
  onCommitMessage: (value: string) => void;
  commitBusy: boolean;
  onCommit: () => void;
  commitNote: string | null;
}) {
  if (loading && !status) {
    return <div className="empty-note">读取 Git 状态…</div>;
  }
  if (!status?.available) {
    return (
      <div className="git-panel">
        <div className="git-head">
          <span>源代码管理</span>
          <IconButton aria-label="刷新 Git 状态" onClick={onRefresh}>
            <Icon name="refresh-cw" />
          </IconButton>
        </div>
        <div className="empty-note">
          {status?.reason ?? error ?? "当前工作区不是 Git 仓库。"}
          <br />
          Git 路径配置与初始化将在设置中提供。
        </div>
      </div>
    );
  }

  return (
    <div className="git-panel">
      <div className="git-head">
        <span className="mono">{status.branch ?? "(detached)"}</span>
        <IconButton aria-label="刷新 Git 状态" onClick={onRefresh}>
          <Icon name="refresh-cw" />
        </IconButton>
      </div>
      {error && (
        <div className="error-card" role="alert">
          <p>{error}</p>
        </div>
      )}

      {status.staged.length > 0 && (
        <div className="git-group">
          <div className="git-group-head">已暂存 {status.staged.length}</div>
          {status.staged.map((file) => (
            <div className="git-row" key={`staged-${file.path}`}>
              <button
                type="button"
                className={`git-file ${selectedPath === file.path ? "selected" : ""}`}
                onClick={() => onOpenFile(file)}
              >
                <span className="git-status">{file.status}</span>
                {file.path}
              </button>
              <button
                type="button"
                className="git-action"
                title="取消暂存"
                onClick={() => onUnstage([file.path])}
              >
                −
              </button>
            </div>
          ))}
        </div>
      )}

      {status.working.length > 0 && (
        <div className="git-group">
          <div className="git-group-head">更改 {status.working.length}</div>
          {status.working.map((file) => (
            <div className="git-row" key={`working-${file.path}`}>
              <button
                type="button"
                className={`git-file ${selectedPath === file.path ? "selected" : ""}`}
                onClick={() => onOpenFile(file)}
              >
                <span className="git-status">{file.status}</span>
                {file.path}
              </button>
              <button
                type="button"
                className="git-action"
                title="暂存"
                onClick={() => onStage([file.path])}
              >
                +
              </button>
            </div>
          ))}
        </div>
      )}

      {status.staged.length === 0 && status.working.length === 0 && (
        <div className="empty-note">工作区干净。</div>
      )}

      <div className="git-commit">
        <TextArea
          value={commitMessage}
          onChange={(event) => onCommitMessage(event.target.value)}
          placeholder="Commit message"
          rows={3}
          disabled={commitBusy}
        />
        <Button
          variant="primary"
          type="button"

          onClick={onCommit}
          disabled={
            commitBusy || !commitMessage.trim() || status.staged.length === 0
          }
        >
          {commitBusy ? "提交中…" : "提交暂存变更"}
        </Button>
        {commitNote && <span className="muted">{commitNote}</span>}
      </div>

      {log.length > 0 && (
        <div className="git-group">
          <div className="git-group-head">最近提交</div>
          {log.slice(0, 5).map((commit) => (
            <div className="git-log-row" key={commit.hash}>
              <span className="mono">{commit.hash.slice(0, 7)}</span>
              <span>{commit.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function diffLineClass(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---")) return "meta";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "";
}
