import { Button, DisclosureSummary } from "@research-workbench/ui";
import { useCallback, useEffect, useState } from "react";
import type { ManagedRun, RunDetail } from "@research-workbench/contracts";
import { researchRequests } from "./agent-requests";

export const RUN_STATES: Record<ManagedRun["state"], string> = {
  preparing: "准备中",
  running: "运行中",
  collecting: "归档中",
  succeeded: "已验证",
  failed: "失败",
  canceled: "已取消",
  unknown: "待核对"
};

export function RunDetailView({
  id,
  runs,
  connected,
  onClose,
  onAskAgent
}: {
  id: string;
  runs: ManagedRun[];
  connected: boolean;
  onClose: () => void;
  onAskAgent: (prompt: string) => void;
}) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [logs, setLogs] = useState<{
    stdout: string;
    stderr: string;
    truncated: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [comparison, setComparison] = useState("");
  const load = useCallback(async () => {
    const result = await window.rw.request<RunDetail>("runs.get", { id });
    setDetail(result);
    setLogs(await window.rw.request("runs.logs", { id }));
  }, [id]);
  const current = runs.find((run) => run.id === id);
  useEffect(() => {
    setError(null);
    setComparison("");
    if (connected) void load().catch((reason) => setError(String(reason)));
  }, [load, connected, current?.state]);
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="run-detail" aria-label="运行详情">
      <div className="loop-section-heading">
        <h2>
          运行详情{" "}
          {detail && (
            <span className="tag">{RUN_STATES[detail.run.state]}</span>
          )}
        </h2>
        <Button
          variant="ghost"

          onClick={onClose}
          aria-label="关闭运行详情"
        >
          关闭
        </Button>
      </div>
      {error && (
        <p className="loop-alert" role="alert">
          {error}
        </p>
      )}
      {!detail ? (
        <p role="status">正在读取运行…</p>
      ) : (
        <>
          <p className="muted mono">{detail.run.id}</p>
          <code className="plan-command">{detail.plan.proposal.command}</code>
          {detail.run.reason && (
            <p className="loop-alert">{detail.run.reason}</p>
          )}
          <div className="loop-actions">
            <Button
              variant="primary"

              onClick={() => onAskAgent(researchRequests.analyzeRun(id))}
            >
              让 Agent 分析结果
            </Button>
            <Button
              variant="ghost"

              disabled={busy || !connected}
              onClick={() => void action(load)}
            >
              核对状态
            </Button>
            {!["succeeded", "failed", "canceled"].includes(
              detail.run.state
            ) && (
              <Button
                variant="default"

                disabled={busy || detail.run.cancelRequested || !connected}
                onClick={() =>
                  void action(() => window.rw.request("runs.cancel", { id }))
                }
              >
                {detail.run.cancelRequested ? "取消请求待确认" : "停止运行"}
              </Button>
            )}
          </div>
          {Object.keys(detail.run.metrics).length > 0 && (
            <dl className="run-meta metric-results">
              {Object.entries(detail.run.metrics).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value.toPrecision(6)}</dd>
                </div>
              ))}
            </dl>
          )}
          <h3>产物</h3>
          {detail.run.artifacts.length === 0 && (
            <p className="muted">尚无归档产物。</p>
          )}
          {detail.run.artifacts.map((file) => (
            <details className="artifact-ledger-row" key={file.path}>
              <DisclosureSummary>
                <span className="mono">{file.path}</span>
                <span
                  className={
                    file.status === "present" ? "success-text" : "error-text"
                  }
                >
                  {file.status === "present"
                    ? `${file.size} B · 已校验`
                    : (file.reason ?? "缺件")}
                </span>
              </DisclosureSummary>
              <code>SHA-256：{file.sha256 ?? "没有可验证的哈希"}</code>
            </details>
          ))}
          <details className="run-logs">
            <DisclosureSummary>运行日志与事件</DisclosureSummary>
            <pre>
              {logs?.stdout || "暂无标准输出"}
              {logs?.stderr ? `\n[stderr]\n${logs.stderr}` : ""}
            </pre>
            {logs?.truncated && (
              <p className="muted">显示末尾片段；完整日志保存在该 Job 目录。</p>
            )}
            <ol>
              {detail.events.map((event) => (
                <li key={event.seq}>
                  {event.type} · {event.detail}
                </li>
              ))}
            </ol>
          </details>
          {detail.run.state === "succeeded" &&
            runs.some((run) => run.state === "succeeded" && run.id !== id) && (
              <details>
                <DisclosureSummary>与其他运行比较</DisclosureSummary>
                <div className="loop-choices">
                  {runs
                    .filter((run) => run.state === "succeeded" && run.id !== id)
                    .map((run) => (
                      <button
                        key={run.id}
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            const result = await window.rw.request<{
                              comparable: boolean;
                              reason: string;
                              delta: number | null;
                            }>("runs.compare", { leftId: run.id, rightId: id });
                            setComparison(
                              `${result.reason}${result.comparable ? `；差值 ${result.delta}` : ""}`
                            );
                          })
                        }
                      >
                        {run.experimentId} · 第 {run.attempt} 次
                      </button>
                    ))}
                </div>
                {comparison && <p role="status">{comparison}</p>}
              </details>
            )}
        </>
      )}
    </section>
  );
}
