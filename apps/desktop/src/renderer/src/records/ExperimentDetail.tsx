import { Button, TextInput, TextArea } from "@research-workbench/ui";
import { SideBySideDiff } from "../SideBySideDiff";
import type { ExperimentRecordsModel, DetailTab } from "./useExperimentRecords";
import { statusLabel, formatDuration } from "./format";
const TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "overview", label: "概览" },
  { id: "seeds", label: "逐种子" },
  { id: "files", label: "文件" },
  { id: "plan", label: "任务书" },
  { id: "code", label: "相关代码" }
];

export function ExperimentDetail({
  model,
  onOpenInIde,
  onLocateConversation
}: {
  model: ExperimentRecordsModel;
  onOpenInIde: (path: string) => void;
  onLocateConversation: (scope: unknown) => void;
}) {
  const {
    selected,
    selectedFile,
    setSelectedFile,
    tab,
    setTab,
    diffMode,
    setDiffMode,
    conclusionDraft,
    setConclusionDraft,
    reusableDraft,
    setReusableDraft,
    saving,
    saveRecord
  } = model;
  if (!selected) return null;
  return (
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
          <Button
            variant="default"
            type="button"

            onClick={() => onLocateConversation(selected.scope)}
          >
            定位对话
          </Button>
          <Button
            variant="default"
            type="button"

            onClick={() => setTab("plan")}
          >
            任务书
          </Button>
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
                  <span
                    className={`tag ${
                      selected.taskbookStatus === "draft" ? "amber" : "green"
                    }`}
                    style={{ marginLeft: 6 }}
                  >
                    {selected.taskbookStatus === "draft" ? "待确认" : "已确认"}
                  </span>
                </dd>
              </div>
              <div>
                <dt>开始</dt>
                <dd className="mono">{selected.startedAt}</dd>
              </div>
              <div>
                <dt>结束</dt>
                <dd className="mono">{selected.finishedAt ?? "尚未结束"}</dd>
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
                <dd>
                  {selected.files.map((file) => file.path).join(", ") || "无"}
                </dd>
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
              <TextArea
                rows={3}
                value={conclusionDraft}
                placeholder="写下这次实验的结论；Agent 也会在归档时回填。"
                onChange={(event) => setConclusionDraft(event.target.value)}
              />
              <div className="record-edit-actions">
                <Button
                  variant="default"
                  type="button"

                  disabled={
                    saving || conclusionDraft === (selected.conclusion ?? "")
                  }
                  onClick={() =>
                    void saveRecord({ conclusion: conclusionDraft })
                  }
                >
                  保存结论
                </Button>
                <Button
                  variant="primary"
                  type="button"

                  disabled={saving || Boolean(selected.confirmedAt)}
                  onClick={() => void saveRecord({ confirmed: true })}
                >
                  {selected.confirmedAt ? "已确认" : "确认结论"}
                </Button>
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
                <TextInput
                  value={reusableDraft.kind}
                  placeholder="类型（脚本 / 配置 / 数据集 / 方法）"
                  onChange={(event) =>
                    setReusableDraft((current) => ({
                      ...current,
                      kind: event.target.value
                    }))
                  }
                />
                <TextInput
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
              <TextArea
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
                <Button
                  variant="default"
                  type="button"

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
                </Button>
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
                <p>
                  实验结束时 results/、artifacts/
                  等目录的新增文件会自动归档到这里。
                </p>
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
                            className={diffMode === "split" ? "selected" : ""}
                            onClick={() => setDiffMode("split")}
                          >
                            并排
                          </button>
                          <button
                            type="button"
                            className={diffMode === "unified" ? "selected" : ""}
                            onClick={() => setDiffMode("unified")}
                          >
                            统一
                          </button>
                        </div>
                        <span className="tag">{selectedFile.status}</span>
                        {selectedFile.status !== "deleted" && (
                          <Button
                            variant="default"
                            type="button"

                            onClick={() => onOpenInIde(selectedFile.path)}
                          >
                            在 IDE 中打开
                          </Button>
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
                        {selectedFile.diff.split("\n").map((line, index) => (
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
  const metricKeys = [
    ...new Set(results.flatMap((item) => Object.keys(item.metrics)))
  ];
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
