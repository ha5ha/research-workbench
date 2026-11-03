import { useCallback, useEffect, useMemo, useState } from "react";
import { SideBySideDiff } from "./SideBySideDiff";

type ExperimentSummary = {
  id: string;
  title: string;
  status: "pending" | "archived" | "failed";
  startedAt: string;
  finishedAt: string | null;
  scope: { projectId?: string; questionId?: string; taskId?: string } | null;
  taskBook: {
    id: string;
    version: number;
    goal: string;
    hypothesis: string;
    design: string;
    metrics: string;
    seeds: number;
    config?: Record<string, unknown>;
  };
  metrics: string | null;
  seeds: number | null;
  conclusion: string | null;
  seedResults: Array<{
    seed: number | string;
    metrics: Record<string, string | number>;
    note?: string;
  }>;
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
  artifacts: Array<{ path: string; kind: string }>;
  reusable: { kind: string; description: string; path?: string } | null;
  confirmedAt: string | null;
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
  currentScope,
  onOpenInIde,
  onLocateConversation,
  onCountChange,
  onRecordsChange
}: {
  currentScope: { projectId: string; questionId?: string; taskId?: string };
  onOpenInIde: (path: string) => void;
  onLocateConversation: (scope: unknown) => void;
  onCountChange: (count: number) => void;
  onRecordsChange: (
    records: Array<{
      id: string;
      scope: { projectId?: string; questionId?: string; taskId?: string } | null;
    }>
  ) => void;
}) {
  const [records, setRecords] = useState<ExperimentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ExperimentRecord | null>(null);
  const [selectedFile, setSelectedFile] = useState<ExperimentFileDiff | null>(
    null
  );
  const [tab, setTab] = useState<DetailTab>("overview");
  const [diffMode, setDiffMode] = useState<"split" | "unified">("split");
  const [onlyCurrentTask, setOnlyCurrentTask] = useState(true);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conclusionDraft, setConclusionDraft] = useState("");
  const [reusableDraft, setReusableDraft] = useState({
    kind: "",
    description: "",
    path: ""
  });
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    title: "",
    goal: "",
    metrics: "",
    conclusion: ""
  });

  const visibleRecords = useMemo(() => {
    if (!onlyCurrentTask || !currentScope.taskId) return records;
    return records.filter(
      (record) => record.scope?.taskId === currentScope.taskId
    );
  }, [records, onlyCurrentTask, currentScope.taskId]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await window.rw.request<ExperimentSummary[]>(
        "experiments.list"
      );
      setRecords(next);
      onCountChange(next.length);
      onRecordsChange(next);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "读取实验记录失败"
      );
    } finally {
      setLoading(false);
    }
  }, [onCountChange, onRecordsChange]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const saveRecord = async (patch: {
    conclusion?: string;
    reusable?: { kind: string; description: string; path?: string } | null;
    confirmed?: boolean;
  }) => {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await window.rw.request<ExperimentRecord>(
        "experiments.update",
        { id: selected.id, ...patch }
      );
      setSelected(updated);
      await loadRecords();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "保存记录失败");
    } finally {
      setSaving(false);
    }
  };

  const createRecord = async () => {
    const title = createDraft.title.trim();
    if (!title) return;
    setSaving(true);
    setError(null);
    try {
      await window.rw.request("experiments.create", {
        title,
        goal: createDraft.goal.trim(),
        metrics: createDraft.metrics.trim() || undefined,
        conclusion: createDraft.conclusion.trim() || undefined,
        seeds: 0,
        scope: currentScope
      });
      setCreateOpen(false);
      setCreateDraft({ title: "", goal: "", metrics: "", conclusion: "" });
      await loadRecords();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "新建记录失败");
    } finally {
      setSaving(false);
    }
  };

  // Keep the selection inside the filtered list, otherwise the detail panel can
  // show a record the user cannot see in the rows above it.
  useEffect(() => {
    if (!selectedId && visibleRecords.length === 0) return;
    if (selectedId && visibleRecords.some((item) => item.id === selectedId)) {
      return;
    }
    setSelectedId(visibleRecords[0]?.id ?? null);
  }, [visibleRecords, selectedId]);

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
        setConclusionDraft(record.conclusion ?? "");
        setReusableDraft({
          kind: record.reusable?.kind ?? "",
          description: record.reusable?.description ?? "",
          path: record.reusable?.path ?? ""
        });
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
          <span className="eyebrow">实验记录</span>
          <h1>实验记录</h1>
          <p>
            由 Agent 调用 create_experiment 产生；每条记录带任务书、指标、逐种子结果、artifact
            与本次实验窗口内的代码 diff。
          </p>
        </div>
        <div className="page-actions">
          {currentScope.taskId && (
            <button
              type="button"
              className={`quiet-button ${onlyCurrentTask ? "active" : ""}`}
              onClick={() => setOnlyCurrentTask((value) => !value)}
            >
              {onlyCurrentTask ? "只看当前任务" : "显示全部记录"}
            </button>
          )}
          <button
            type="button"
            className="quiet-button"
            onClick={() => setCreateOpen((open) => !open)}
          >
            ＋ 新建记录
          </button>
          <button
            type="button"
            className="quiet-button"
            onClick={() => void loadRecords()}
          >
            刷新记录
          </button>
        </div>
      </div>

      {createOpen && (
        <form
          className="record-create"
          onSubmit={(event) => {
            event.preventDefault();
            void createRecord();
          }}
        >
          <label>
            实验名称
            <input
              autoFocus
              value={createDraft.title}
              placeholder="例如：三种子配对验证（人工补录）"
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  title: event.target.value
                }))
              }
            />
          </label>
          <label>
            目标
            <input
              value={createDraft.goal}
              placeholder="这次实验要回答什么"
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  goal: event.target.value
                }))
              }
            />
          </label>
          <label>
            指标
            <input
              value={createDraft.metrics}
              placeholder="例如：验证准确率 0.81"
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  metrics: event.target.value
                }))
              }
            />
          </label>
          <label>
            结论
            <textarea
              rows={2}
              value={createDraft.conclusion}
              placeholder="可先留空，之后再补"
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  conclusion: event.target.value
                }))
              }
            />
          </label>
          <div className="record-create-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={saving || !createDraft.title.trim()}
            >
              {saving ? "保存中…" : "补录到当前任务"}
            </button>
            <button
              type="button"
              className="quiet-button"
              onClick={() => setCreateOpen(false)}
            >
              取消
            </button>
          </div>
        </form>
      )}

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
        {!loading && visibleRecords.length === 0 && (
          <div className="empty-note records-empty">
            {records.length === 0
              ? "还没有实验记录。只有 Agent 判定为实验行为并调用 create_experiment 时才会生成记录；普通功能代码改动进 IDE/Git。"
              : "当前任务还没有实验记录；切到“显示全部记录”可以看到其它任务。"}
          </div>
        )}
        {visibleRecords.map((record) => (
          <button
            type="button"
            key={record.id}
            className={`records-row records-item ${selectedId === record.id ? "selected" : ""}`}
            onClick={() => setSelectedId(record.id)}
          >
            <span className="record-status">
              <i className={`status-pin ${record.status}`} />
              {statusLabel(record.status)}
            </span>
            <span className="record-title-cell">
              <strong>{record.title}</strong>
              <small>
                {record.id} · {record.taskBook.id} v{record.taskBook.version}
                {record.scope?.taskId ? ` · 任务 ${record.scope.taskId}` : ""}
              </small>
            </span>
            <span>
              <span className="taskbook-pill">
                {record.taskBook.id} v{record.taskBook.version}
              </span>
            </span>
            <span className="record-metric">{record.metrics ?? "—"}</span>
            <span className="record-time">
              {new Date(record.finishedAt ?? record.startedAt).toLocaleString(
                "zh-CN",
                {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                }
              )}
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
                {selected.id} · 实验记录 · 任务书 {selected.taskBook.id} v
                {selected.taskBook.version}
              </span>
              <h2>
                {selected.title}{" "}
                <span className={`record-status-text ${selected.status}`}>
                  {statusLabel(selected.status)}
                </span>
              </h2>
              <p>
                {selected.taskBook.id} v{selected.taskBook.version} ·{" "}
                {selected.files.length} 个代码文件 · 最近检查{" "}
                {new Date(selected.finishedAt ?? selected.startedAt).toLocaleString(
                  "zh-CN"
                )}
              </p>
            </div>
            <div className="page-actions">
              <button
                type="button"
                className="quiet-button"
                onClick={() => onLocateConversation(selected.scope)}
              >
                定位对话
              </button>
              <button
                type="button"
                className="quiet-button"
                onClick={() => setTab("plan")}
              >
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
                      +
                      {selected.files.reduce(
                        (sum, file) => sum + file.additions,
                        0
                      )}{" "}
                      / -
                      {selected.files.reduce(
                        (sum, file) => sum + file.deletions,
                        0
                      )}
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
                    <strong>{formatDuration(selected)}</strong>
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
                      {selected.taskBook.id} v{selected.taskBook.version}
                    </dd>
                  </div>
                  <div>
                    <dt>开始</dt>
                    <dd className="mono">{selected.startedAt}</dd>
                  </div>
                  <div>
                    <dt>结束</dt>
                    <dd className="mono">
                      {selected.finishedAt ?? "尚未结束"}
                    </dd>
                  </div>
                  <div>
                    <dt>状态</dt>
                    <dd>{statusLabel(selected.status)}</dd>
                  </div>
                  <div>
                    <dt>目标</dt>
                    <dd>{selected.taskBook.goal}</dd>
                  </div>
                  <div>
                    <dt>代码范围</dt>
                    <dd>{selected.files.map((file) => file.path).join(", ") || "无"}</dd>
                  </div>
                </dl>

                <div className="record-edit">
                  <div className="record-edit-head">
                    <strong>结论</strong>
                    {selected.confirmedAt ? (
                      <span className="tag green">
                        已确认 ·{" "}
                        {new Date(selected.confirmedAt).toLocaleString("zh-CN")}
                      </span>
                    ) : (
                      <span className="tag amber">待确认</span>
                    )}
                  </div>
                  <textarea
                    rows={3}
                    value={conclusionDraft}
                    placeholder="写下这次实验的结论；Agent 也会在归档时回填。"
                    onChange={(event) =>
                      setConclusionDraft(event.target.value)
                    }
                  />
                  <div className="record-edit-actions">
                    <button
                      type="button"
                      className="quiet-button"
                      disabled={saving || conclusionDraft === (selected.conclusion ?? "")}
                      onClick={() => void saveRecord({ conclusion: conclusionDraft })}
                    >
                      保存结论
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={saving || Boolean(selected.confirmedAt)}
                      onClick={() => void saveRecord({ confirmed: true })}
                    >
                      {selected.confirmedAt ? "已确认" : "确认结论"}
                    </button>
                  </div>
                </div>

                <div className="record-edit">
                  <div className="record-edit-head">
                    <strong>可复用产物</strong>
                    <span className="muted">
                      这次实验沉淀了什么，后续研究可以直接用
                    </span>
                  </div>
                  <div className="record-edit-grid">
                    <input
                      value={reusableDraft.kind}
                      placeholder="类型（脚本 / 配置 / 数据集 / 方法）"
                      onChange={(event) =>
                        setReusableDraft((current) => ({
                          ...current,
                          kind: event.target.value
                        }))
                      }
                    />
                    <input
                      value={reusableDraft.path}
                      placeholder="路径（可选）"
                      onChange={(event) =>
                        setReusableDraft((current) => ({
                          ...current,
                          path: event.target.value
                        }))
                      }
                    />
                  </div>
                  <textarea
                    rows={2}
                    value={reusableDraft.description}
                    placeholder="说明它是什么、怎么复用"
                    onChange={(event) =>
                      setReusableDraft((current) => ({
                        ...current,
                        description: event.target.value
                      }))
                    }
                  />
                  <div className="record-edit-actions">
                    <button
                      type="button"
                      className="quiet-button"
                      disabled={saving || !reusableDraft.description.trim()}
                      onClick={() =>
                        void saveRecord({
                          reusable: {
                            kind: reusableDraft.kind.trim() || "方法",
                            description: reusableDraft.description.trim(),
                            path: reusableDraft.path.trim() || undefined
                          }
                        })
                      }
                    >
                      保存产物说明
                    </button>
                  </div>
                </div>

                {selected.reusable && (
                  <div className="record-note">
                    <strong>沉淀产物</strong>
                    <p>
                      {selected.reusable.kind} · {selected.reusable.description}
                      {selected.reusable.path ? ` · ${selected.reusable.path}` : ""}
                    </p>
                  </div>
                )}
              </>
            )}

            {tab === "seeds" && (
              <>
                {selected.seedResults.length === 0 ? (
                  <div className="empty-state">
                    <strong>
                      {selected.seeds != null
                        ? `${selected.seeds} 个种子`
                        : "未记录种子"}
                    </strong>
                    <p>逐种子指标由 Agent 在归档时写入。</p>
                  </div>
                ) : (
                  <SeedTable results={selected.seedResults} />
                )}
              </>
            )}

            {tab === "files" && (
              <>
                {selected.artifacts.length === 0 ? (
                  <div className="empty-state">
                    <strong>暂无产物 / 实验文件</strong>
                    <p>实验结束时 results/、artifacts/ 等目录的新增文件会自动归档到这里。</p>
                  </div>
                ) : (
                  <div className="change-files">
                    {selected.artifacts.map((artifact) => (
                      <button
                        type="button"
                        className="change-file"
                        key={artifact.path}
                        onClick={() => onOpenInIde(artifact.path)}
                        title="在 IDE 中打开"
                      >
                        <span className="change-status modified">F</span>
                        <span className="change-path">{artifact.path}</span>
                        <span className="muted">{artifact.kind}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {tab === "plan" && (
              <dl className="record-facts">
                <div>
                  <dt>任务书</dt>
                  <dd className="mono">
                    {selected.taskBook.id} v{selected.taskBook.version}
                  </dd>
                </div>
                <div>
                  <dt>指标</dt>
                  <dd>{selected.taskBook.metrics || "—"}</dd>
                </div>
                <div>
                  <dt>目标</dt>
                  <dd>{selected.taskBook.goal}</dd>
                </div>
                <div>
                  <dt>假设</dt>
                  <dd>{selected.taskBook.hypothesis}</dd>
                </div>
                <div>
                  <dt>设计</dt>
                  <dd>{selected.taskBook.design}</dd>
                </div>
                <div>
                  <dt>种子</dt>
                  <dd>{selected.taskBook.seeds}</dd>
                </div>
              </dl>
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
                            <div className="diff-mode-toggle">
                              <button
                                type="button"
                                className={
                                  diffMode === "split" ? "selected" : ""
                                }
                                onClick={() => setDiffMode("split")}
                              >
                                并排
                              </button>
                              <button
                                type="button"
                                className={
                                  diffMode === "unified" ? "selected" : ""
                                }
                                onClick={() => setDiffMode("unified")}
                              >
                                统一
                              </button>
                            </div>
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
                        {diffMode === "split" ? (
                          <SideBySideDiff
                            before={selectedFile.before}
                            after={selectedFile.after}
                            path={selectedFile.path}
                          />
                        ) : (
                          <div className="diff-view">
                            {selectedFile.diff
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

function SeedTable({
  results
}: {
  results: Array<{
    seed: number | string;
    metrics: Record<string, string | number>;
    note?: string;
  }>;
}) {
  const metricKeys = [...new Set(results.flatMap((item) => Object.keys(item.metrics)))];
  return (
    <div className="seed-table-wrap">
      <table className="seed-table">
        <thead>
          <tr>
            <th>种子</th>
            {metricKeys.map((key) => (
              <th key={key}>{key}</th>
            ))}
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {results.map((item) => (
            <tr key={String(item.seed)}>
              <td className="mono">{item.seed}</td>
              {metricKeys.map((key) => (
                <td className="mono" key={key}>
                  {item.metrics[key] ?? "—"}
                </td>
              ))}
              <td>{item.note ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

function statusLabel(status: ExperimentSummary["status"]): string {
  if (status === "pending") return "待决策";
  if (status === "failed") return "失败";
  return "已归档";
}

function formatDuration(record: ExperimentSummary): string {
  const end = record.finishedAt ? Date.parse(record.finishedAt) : Date.now();
  const start = Date.parse(record.startedAt);
  const ms = end - start;
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
