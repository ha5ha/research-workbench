import { useCallback, useEffect, useMemo, useState } from "react";
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
  openPathRequest
}: {
  onBack: () => void;
  openPathRequest: { path: string; nonce: number } | null;
}) {
  const [sideMode, setSideMode] = useState<"files" | "git">("files");
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [treeLoading, setTreeLoading] = useState(true);
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [terminalCommand, setTerminalCommand] = useState("node --version");
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
  const gitChangeCount =
    (gitStatus?.staged.length ?? 0) + (gitStatus?.working.length ?? 0);

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
      setFileError(
        failure instanceof Error ? failure.message : "读取文件失败"
      );
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
          tab.path === active.path
            ? { ...tab, original: tab.content }
            : tab
        )
      );
      setSaveNote(`已保存 ${result.path} · ${result.size} B`);
      void loadGit();
    } catch (failure) {
      setFileError(
        failure instanceof Error ? failure.message : "保存失败"
      );
    } finally {
      setFileBusy(false);
    }
  };

  const runCommand = async () => {
    if (!terminalCommand.trim() || terminalRunning) return;
    setTerminalRunning(true);
    setTerminalError(null);
    setTerminalResult(null);
    try {
      const result = await window.rw.request<CommandResult>("terminal.run", {
        command: terminalCommand
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
      setGitError(
        failure instanceof Error ? failure.message : "提交失败"
      );
    } finally {
      setCommitBusy(false);
    }
  };

  return (
    <div className="page-view code-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">工作区</span>
          <h1>代码</h1>
          <p>
            完整项目文件树、CodeMirror 编辑器、终端与 Git；写入和提交需要审批。
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="quiet-button" onClick={onBack}>
            返回对话
          </button>
          <button
            type="button"
            className="quiet-button"
            onClick={() => {
              void loadTree();
              void loadGit();
            }}
          >
            刷新
          </button>
        </div>
      </div>

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
                  <span className="file-type">
                    {entry.type === "directory"
                      ? collapsedDirs.has(entry.path)
                        ? "▸"
                        : "▾"
                      : "·"}
                  </span>
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
                <button
                  type="button"
                  className="editor-tab-close"
                  aria-label={`关闭 ${tab.path}`}
                  onClick={() => closeTab(tab.path)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="code-toolbar">
            <div className="code-tab">
              {gitDiff ? `Git diff · ${gitDiff.path}` : active?.path ?? "未选择文件"}
            </div>
            <div className="code-toolbar-actions">
              {saveNote && <span className="muted">{saveNote}</span>}
              {gitDiff ? (
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => setGitDiff(null)}
                >
                  返回编辑器
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void saveFile()}
                  disabled={!active || !dirty || fileBusy}
                >
                  {fileBusy ? "处理中…" : "保存"}
                </button>
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
                  {(gitDiff.diff || "No diff").split("\n").map((line, index) => (
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
              key={active.path}
              path={active.path}
              value={active.content}
              onChange={(value) =>
                setTabs((current) =>
                  current.map((tab) =>
                    tab.path === active.path
                      ? { ...tab, content: value }
                      : tab
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

          <div className="terminal-panel">
            <div className="terminal-head">
              <span>终端</span>
              <span className="muted">工作区根目录 · 30s 超时</span>
            </div>
            <div className="terminal-input-row">
              <span className="terminal-prompt">$</span>
              <input
                className="terminal-input"
                value={terminalCommand}
                onChange={(event) => setTerminalCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void runCommand();
                  }
                }}
                disabled={terminalRunning}
                aria-label="终端命令"
              />
              <button
                type="button"
                className="quiet-button"
                onClick={() => void runCommand()}
                disabled={terminalRunning || !terminalCommand.trim()}
              >
                {terminalRunning ? "运行中…" : "运行"}
              </button>
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
        </div>
      </div>
    </div>
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
          <button type="button" className="icon-quiet" onClick={onRefresh}>
            ↻
          </button>
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
        <button type="button" className="icon-quiet" onClick={onRefresh}>
          ↻
        </button>
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
        <textarea
          value={commitMessage}
          onChange={(event) => onCommitMessage(event.target.value)}
          placeholder="Commit message"
          rows={3}
          disabled={commitBusy}
        />
        <button
          type="button"
          className="primary-button"
          onClick={onCommit}
          disabled={
            commitBusy ||
            !commitMessage.trim() ||
            status.staged.length === 0
          }
        >
          {commitBusy ? "提交中…" : "提交暂存变更"}
        </button>
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
