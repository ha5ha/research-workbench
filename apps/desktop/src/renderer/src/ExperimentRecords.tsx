import {
  useExperimentRecords,
  type ExperimentRecordsProps
} from "./records/useExperimentRecords";
import { ExperimentDetail } from "./records/ExperimentDetail";
import { statusLabel } from "./records/format";

export type {
  ExperimentSummary,
  ExperimentFileDiff,
  StoredExperiment as ExperimentRecord
} from "@research-workbench/contracts";
import { Button, Icon, TextInput, TextArea } from "@research-workbench/ui";

import type { ManagedRun } from "@research-workbench/contracts";
const RUN_LABELS: Record<ManagedRun["state"], string> = {
  preparing: "准备中",
  running: "运行中",
  collecting: "归档中",
  succeeded: "已验证",
  failed: "失败",
  canceled: "已取消",
  unknown: "待核对"
};

export function ExperimentRecords(props: ExperimentRecordsProps) {
  const { currentScope, onOpenInIde, onLocateConversation, onOpenManagedRun } =
    props;
  const model = useExperimentRecords(props);
  const {
    records,
    managed,
    notice,
    selectedId,
    setSelectedId,
    selected,
    onlyCurrentTask,
    setOnlyCurrentTask,
    loading,
    detailLoading,
    error,
    saving,
    createOpen,
    setCreateOpen,
    createDraft,
    setCreateDraft,
    visibleRecords,
    loadRecords,
    createRecord
  } = model;

  return (
    <div className="page-view">
      <div className="page-heading">
        <div>
          <span className="eyebrow">实验记录</span>
          <h1>实验记录</h1>
          <p>
            任务书与实验历史。受管记录显示最新
            Run，打开后查看完整日志、指标、产物和证据。
          </p>
        </div>
        <div className="page-actions">
          {currentScope.taskId && (
            <Button
              variant="default"
              type="button"
              className={` ${onlyCurrentTask ? "active" : ""}`}
              onClick={() => setOnlyCurrentTask((value) => !value)}
            >
              {onlyCurrentTask ? "只看当前任务" : "显示全部记录"}
            </Button>
          )}
          <Button
            variant="default"
            type="button"

            onClick={() => setCreateOpen((open) => !open)}
          >
            手工补录
          </Button>
          <Button
            variant="default"
            type="button"

            onClick={() => void loadRecords()}
          >
            刷新记录
          </Button>
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
            <TextInput
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
            <TextInput
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
            <TextInput
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
            <TextArea
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
            <Button
              variant="primary"
              type="submit"

              disabled={saving || !createDraft.title.trim()}
            >
              {saving ? "保存中…" : "补录到当前任务"}
            </Button>
            <Button
              variant="default"
              type="button"

              onClick={() => setCreateOpen(false)}
            >
              取消
            </Button>
          </div>
        </form>
      )}

      {error && (
        <div className="error-card" role="alert">
          <p>{error}</p>
        </div>
      )}
      {notice && (
        <p role="status" className="loop-notice">
          {notice}
        </p>
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
            onClick={() => {
              const run = managed?.runs.find(
                (item) => item.experimentId === record.id
              );
              if (run) onOpenManagedRun(run.id);
              else setSelectedId(record.id);
            }}
          >
            <span className="record-status">
              <i className={`status-pin ${record.status}`} />
              {managed?.runs.find((run) => run.experimentId === record.id)
                ? RUN_LABELS[
                    managed.runs.find((run) => run.experimentId === record.id)!
                      .state
                  ]
                : statusLabel(record.status)}
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
            <span className="record-metric">
              {(() => {
                const run = managed?.runs.find(
                  (item) => item.experimentId === record.id
                );
                const plan = managed?.plans.find(
                  (item) => item.id === run?.planId
                );
                const metric = plan?.proposal.protocol.metric;
                return run && metric && run.metrics[metric] !== undefined
                  ? `${metric}: ${run.metrics[metric]!.toPrecision(5)}`
                  : (record.metrics ?? "—");
              })()}
            </span>
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
            <Icon name="arrow-right" size={14} className="record-arrow" />
          </button>
        ))}
      </div>

      {detailLoading && <div className="empty-note">读取实验详情…</div>}

      {selected && !detailLoading && (
        <ExperimentDetail
          model={model}
          onOpenInIde={onOpenInIde}
          onLocateConversation={onLocateConversation}
        />
      )}
    </div>
  );
}
