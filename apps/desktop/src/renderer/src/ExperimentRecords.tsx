import { useCallback, useEffect, useState } from "react";

type ExperimentSummary = {
  id: string;
  kind: "agent" | "terminal";
  title: string;
  status: "completed" | "failed";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  fileCount: number;
  additions: number;
  deletions: number;
};
type ExperimentFileDiff = {
  path: string;
  status: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
  diff: string;
  before: string;
  after: string;
};
type ExperimentRecord = ExperimentSummary & {
  files: ExperimentFileDiff[];
};

export function ExperimentRecords({
  onOpenInIde
}: {
  onOpenInIde: (path: string) => void;
}) {
  const [runs, setRuns] = useState<ExperimentSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<ExperimentRecord | null>(null);
  const [selectedFile, setSelectedFile] = useState<ExperimentFileDiff | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await window.rw.request<ExperimentSummary[]>(
        "experiments.list"
      );
      setRuns(next);
      setSelectedRunId((current) => current ?? next[0]?.id ?? null);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "读取实验记录失败"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedRun(null);
      setSelectedFile(null);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    setError(null);
    void window.rw
      .request<ExperimentRecord>("experiments.get", { id: selectedRunId })
      .then((record) => {
        if (!alive) return;
        setSelectedRun(record);
        setSelectedFile(record.files[0] ?? null);
      })
      .catch((failure) => {
        if (!alive) return;
        setError(
          failure instanceof Error ? failure.message : "读取实验详情失败"
        );
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedRunId]);

  return (
    <div className="page-view code-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">当前对话</span>
          <h1>实验记录</h1>
          <p>每个实验聚合本次相关的代码新增/修改、命令与归档证据。</p>
        </div>
        <div className="page-actions">
          <span className="tag">轻量 run 记录</span>
          <button
            type="button"
            className="quiet-button"
            onClick={() => void loadRuns()}
          >
            刷新记录
          </button>
        </div>
      </div>

      {error && (
        <div className="error-card" role="alert">
          <p>{error}</p>
        </div>
      )}

      <div className="changes-shell">
        <aside className="run-list">
          <div className="run-list-head">
            <span>实验 runs</span>
            <span className="muted">{runs.length}</span>
          </div>
          {loading && <div className="empty-note">读取记录…</div>}
          {!loading && runs.length === 0 && (
            <div className="empty-note">
              先让 Agent 改代码或运行一次实验，这里会按 run 聚合改动。
            </div>
          )}
          {runs.map((run) => (
            <button
              type="button"
              key={run.id}
              className={`run-item ${selectedRunId === run.id ? "selected" : ""}`}
              onClick={() => setSelectedRunId(run.id)}
            >
              <div className="run-item-head">
                <span className="tag">
                  {run.kind === "agent" ? "Agent" : "终端"}
                </span>
                <span className="muted">
                  {new Date(run.startedAt).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </span>
              </div>
              <strong>{run.title}</strong>
              <small>
                {run.fileCount} 文件 · +{run.additions} / -{run.deletions}
              </small>
            </button>
          ))}
        </aside>

        <section className="change-detail">
          {detailLoading && <div className="code-empty">读取改动…</div>}
          {!detailLoading && !selectedRun && (
            <div className="code-empty">选择一次实验查看代码改动。</div>
          )}
          {selectedRun && (
            <>
              <div className="change-head">
                <div>
                  <span className="eyebrow">
                    {selectedRun.kind === "agent" ? "Agent run" : "终端 run"} ·{" "}
                    {new Date(selectedRun.startedAt).toLocaleString("zh-CN")}
                  </span>
                  <h2>{selectedRun.title}</h2>
                </div>
                <div className="change-stats">
                  <span className="diff-add">+{selectedRun.additions}</span>
                  <span className="diff-del">-{selectedRun.deletions}</span>
                  <span className="muted">{selectedRun.files.length} 文件</span>
                </div>
              </div>

              <div className="change-files">
                {selectedRun.files.map((file) => (
                  <button
                    type="button"
                    key={file.path}
                    className={`change-file ${selectedFile?.path === file.path ? "selected" : ""}`}
                    onClick={() => setSelectedFile(file)}
                  >
                    <span className={`change-status ${file.status}`}>
                      {file.status === "added"
                        ? "A"
                        : file.status === "deleted"
                          ? "D"
                          : "M"}
                    </span>
                    <span className="change-path">{file.path}</span>
                    <span className="diff-add">+{file.additions}</span>
                    <span className="diff-del">-{file.deletions}</span>
                  </button>
                ))}
              </div>

              {selectedFile ? (
                <div className="diff-panel">
                  <div className="diff-head">
                    <span className="mono">{selectedFile.path}</span>
                    <div className="page-actions">
                      <span className="tag">{selectedFile.status}</span>
                      {selectedFile.status !== "deleted" && (
                        <button
                          type="button"
                          className="quiet-button"
                          onClick={() => onOpenInIde(selectedFile.path)}
                        >
                          在 IDE 中打开
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="diff-view">
                    {selectedFile.diff.split("\n").map((line, index) => (
                      <div
                        key={index}
                        className={`diff-line ${diffLineClass(line)}`}
                      >
                        {line || " "}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="code-empty">这次实验没有代码改动。</div>
              )}
            </>
          )}
        </section>
      </div>
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
