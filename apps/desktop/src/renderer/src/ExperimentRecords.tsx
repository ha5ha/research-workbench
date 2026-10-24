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
  taskBook?: { id: string; version: string } | null;
  metrics?: string | null;
  seeds?: number | null;
  conclusion?: string | null;
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
type DetailTab = "overview" | "seeds" | "files" | "plan" | "code";

const TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "overview", label: "概览" },
  { id: "seeds", label: "逐种子" },
  { id: "files", label: "文件" },
  { id: "plan", label: "任务书" },
  { id: "code", label: "相关代码" }
];

export function ExperimentRecords({
  onOpenInIde,
  onLocateConversation
}: {
  onOpenInIde: (path: string) => void;
  onLocateConversation: () => void;
}) {
  const [records, setRecords] = useState<ExperimentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ExperimentRecord | null>(null);
  const [selectedFile, setSelectedFile] = useState<ExperimentFileDiff | null>(
    null
  );
  const [tab, setTab] = useState<DetailTab>("overview");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await window.rw.request<ExperimentSummary[]>(
        "experiments.list"
      );
      setRecords(next);
      setSelectedId((current) => current ?? next[0]?.id ?? null);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "读取实验记录失败"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      setSelectedFile(null);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    setError(null);
    void window.rw
      .request<ExperimentRecord>("experiments.get", { id: selectedId })
      .then((record) => {
        if (!alive) return;
        setSelected(record);
        setSelectedFile(record.files[0] ?? null);
        setTab("overview");
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
  }, [selectedId]);

  return (
    <div className="page-view">
      <div className="page-heading">
        <div>
          <span className="eyebrow">当前对话</span>
          <h1>实验记录</h1>
          <p>子任务 · 三种子配对验证 · 选择记录查看归档数据、文件与任务书</p>
        </div>
        <div className="page-actions">
          <span className="tag">轻量 run 记录</span>
          <button
            type="button"
            className="quiet-button"
            onClick={() => void loadRecords()}
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

      <div className="records-table">
        <div className="records-row records-head">
          <span>状态</span>
          <span>实验</span>
          <span>任务书</span>
          <span>指标</span>
          <span>最近检查</span>
          <span />
        </div>
        {loading && <div className="empty-note records-empty">读取记录…</div>}
        {!loading && records.length === 0 && (
          <div className="empty-note records-empty">
            先让 Agent 改代码或运行一次实验，这里会生成记录。
          </div>
        )}
        {records.map((record) => (
          <button
            type="button"
            key={record.id}
            className={`records-row records-item ${selectedId === record.id ? "selected" : ""}`}
            onClick={() => setSelectedId(record.id)}
          >
            <span className="record-status">
              <i className={`status-pin ${record.status}`} />
              {record.status === "failed" ? "失败" : "已归档"}
            </span>
            <span className="record-title-cell">
              <strong>{displayTitle(record)}</strong>
              <small>{record.title}</small>
            </span>
            <span>
              {record.taskBook ? (
                <span className="taskbook-pill">
                  {record.taskBook.id} v{record.taskBook.version}
                </span>
              ) : (
                <span className="muted">未关联</span>
              )}
            </span>
            <span className="record-metric">{record.metrics ?? "—"}</span>
            <span className="record-time">
              {new Date(record.finishedAt).toLocaleString("zh-CN", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              })}
            </span>
            <span className="record-arrow">→</span>
          </button>
        ))}
      </div>

      {detailLoading && <div className="empty-note">读取实验详情…</div>}

      {selected && !detailLoading && (
        <div className="record-detail">
          <div className="record-detail-head">
            <div>
              <span className="eyebrow">
                {selected.id} · 实验记录 ·{" "}
                {selected.kind === "agent" ? "Agent 发起" : "终端发起"}
              </span>
              <h2>
                {displayTitle(selected)}{" "}
                <span className={`record-status-text ${selected.status}`}>
                  {selected.status === "failed" ? "失败" : "已归档"}
                </span>
              </h2>
              <p>
                {selected.id} ·{" "}
                {selected.taskBook
                  ? `${selected.taskBook.id} v${selected.taskBook.version}`
                  : "未关联任务书"}{" "}
                · {selected.files.length} 个代码文件 · 最近检查{" "}
                {new Date(selected.finishedAt).toLocaleString("zh-CN")}
              </p>
            </div>
            <div className="page-actions">
              <button
                type="button"
                className="quiet-button"
                onClick={onLocateConversation}
              >
                定位对话
              </button>
              <button type="button" className="quiet-button" disabled={!selected.taskBook}>
                任务书
              </button>
            </div>
          </div>

          <div className="record-tabs" role="tablist">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? "selected" : ""}
                onClick={() => setTab(item.id)}
              >
                {item.label}
                {item.id === "code" && selected.files.length > 0 && (
                  <span className="tab-count">{selected.files.length}</span>
                )}
              </button>
            ))}
          </div>

          <div className="record-body">
            {tab === "overview" && (
              <>
                <div className="metric-grid">
                  <div>
                    <span>指标</span>
                    <strong>{selected.metrics ?? "—"}</strong>
                  </div>
                  <div>
                    <span>代码改动</span>
                    <strong>
                      +{selected.additions} / -{selected.deletions}
                    </strong>
                  </div>
                  <div>
                    <span>种子</span>
                    <strong>
                      {selected.seeds != null ? `${selected.seeds} 个` : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>运行时长</span>
                    <strong>{formatDuration(selected.durationMs)}</strong>
                  </div>
                </div>

                <dl className="record-facts">
                  <div>
                    <dt>实验 ID</dt>
                    <dd className="mono">{selected.id}</dd>
                  </div>
                  <div>
                    <dt>任务书</dt>
                    <dd>
                      {selected.taskBook
                        ? `${selected.taskBook.id} v${selected.taskBook.version}`
                        : "未关联"}
                    </dd>
                  </div>
                  <div>
                    <dt>开始</dt>
                    <dd className="mono">{selected.startedAt}</dd>
                  </div>
                  <div>
                    <dt>结束</dt>
                    <dd className="mono">{selected.finishedAt}</dd>
                  </div>
                  <div>
                    <dt>状态</dt>
                    <dd>{selected.status === "failed" ? "失败" : "已归档"}</dd>
                  </div>
                  <div>
                    <dt>原始触发</dt>
                    <dd>{selected.title}</dd>
                  </div>
                  <div>
                    <dt>代码范围</dt>
                    <dd>{selected.files.map((file) => file.path).join(", ") || "无"}</dd>
                  </div>
                </dl>

                <div className="record-note">
                  <strong>本轮判断</strong>
                  <p>{selected.conclusion ?? "尚未记录结论。任务书、指标与结论将在实验归档流程中补齐。"}</p>
                </div>
              </>
            )}

            {tab === "seeds" && (
              <div className="empty-state">
                <strong>逐种子结果尚未归档</strong>
                <p>当前记录保存了运行窗口和代码 diff，尚未解析每种子的指标。</p>
              </div>
            )}

            {tab === "files" && (
              <div className="empty-state">
                <strong>暂无产物 / 实验文件</strong>
                <p>artifact 与运行输出接入后会在此按实验归档展示。</p>
              </div>
            )}

            {tab === "plan" && (
              <div className="empty-state">
                <strong>
                  {selected.taskBook
                    ? `${selected.taskBook.id} v${selected.taskBook.version}`
                    : "未关联任务书"}
                </strong>
                <p>任务书对象与审批流程将在受管运行切片中接入。</p>
              </div>
            )}

            {tab === "code" && (
              <>
                {selected.files.length === 0 ? (
                  <div className="empty-state">
                    <strong>这次实验没有代码改动</strong>
                    <p>代码改动只聚合实验窗口内的文件，不是项目全量 Git diff。</p>
                  </div>
                ) : (
                  <>
                    <div className="change-files">
                      {selected.files.map((file) => (
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

                    {selectedFile && (
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
                    )}
                  </>
                )}
              </>
            )}
          </div>
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

function displayTitle(record: ExperimentSummary): string {
  if (record.kind === "terminal") return "终端运行";
  if (record.kind === "agent") return "Agent 对话";
  return "实验记录";
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
