import { Button, TextArea, DisclosureSummary } from "@research-workbench/ui";
import { useEffect, useRef, useState } from "react";
import type {
  FrozenFileContent,
  ManagedPlan,
  ManagedRun
} from "@research-workbench/contracts";
import { researchRequests } from "./agent-requests";
import { requestError } from "../request-error";

export function PlanReview({
  plan,
  title,
  connected,
  onStarted,
  onAskAgent,
  onDismissed
}: {
  plan: ManagedPlan;
  title: string;
  connected: boolean;
  onStarted: (run: ManagedRun) => void | Promise<void>;
  onAskAgent: (prompt: string) => void;
  onDismissed: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [dismissReason, setDismissReason] = useState("");
  const readSequence = useRef(0);
  const fileTrigger = useRef<HTMLButtonElement | null>(null);
  const [filePreview, setFilePreview] = useState<{
    path: string;
    loading: boolean;
    file: FrozenFileContent | null;
    error: string | null;
  } | null>(null);
  const [experiment, setExperiment] = useState<{
    title: string;
    taskBook: { goal: string; hypothesis: string; design: string };
  } | null>(null);
  const proposal = plan.proposal;
  useEffect(
    () => () => {
      readSequence.current++;
    },
    [plan.id]
  );
  async function readFrozenFile(path: string) {
    const sequence = ++readSequence.current;
    setFilePreview({ path, loading: true, file: null, error: null });
    try {
      const file = await window.rw.request("plans.readFrozenFile", {
        id: plan.id,
        path
      });
      const entry = plan.files.find((item) => item.path === path);
      if (
        !entry ||
        file.planId !== plan.id ||
        file.path !== path ||
        file.sha256 !== entry.sha256 ||
        file.size !== entry.size
      )
        throw new Error("冻结文件身份不匹配，请重新打开方案。");
      if (sequence === readSequence.current)
        setFilePreview({ path, loading: false, file, error: null });
    } catch (reason) {
      if (sequence === readSequence.current)
        setFilePreview({
          path,
          loading: false,
          file: null,
          error: requestError(reason)
        });
    }
  }
  useEffect(() => {
    let active = true;
    void window.rw
      .request("experiments.get", { id: proposal.experimentId })
      .then((record) => {
        if (active) setExperiment(record);
      })
      .catch(() => {
        if (active) setError("任务书读取失败，请重新打开方案后重试。");
      });
    return () => {
      active = false;
    };
  }, [proposal.experimentId]);
  async function approve() {
    setBusy(true);
    setError(null);
    try {
      await window.rw.request("runs.approve", {
        id: plan.id,
        digest: plan.digest
      });
      const run = await window.rw.request("runs.start", {
        id: plan.id,
        idempotencyKey: `launch:${plan.id}`
      });
      await onStarted(run);
    } catch (reason) {
      setError(requestError(reason));
    } finally {
      setBusy(false);
    }
  }
  async function dismiss() {
    setBusy(true);
    setError(null);
    try {
      await window.rw.request("plans.dismiss", {
        id: plan.id,
        reason: dismissReason.trim()
      });
      await onDismissed();
    } catch (reason) {
      setError(requestError(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="run-plan" aria-label={`运行方案 ${title}`}>
      <div className="loop-row">
        <strong>{experiment?.title ?? title}</strong>
        <span className="tag amber">
          {plan.approvedAt ? "已批准，待启动" : "待审阅"}
        </span>
      </div>
      {experiment && (
        <div className="plan-goal">
          <p>{experiment.taskBook.goal}</p>
          <details>
            <DisclosureSummary>假设与实验设计</DisclosureSummary>
            <p>{experiment.taskBook.hypothesis}</p>
            <p>{experiment.taskBook.design}</p>
          </details>
        </div>
      )}
      <code className="plan-command">{proposal.command}</code>
      {plan.sshConnection && (
        <p className="muted">
          {plan.sshConnection.username}@{plan.sshConnection.hostname}:
          {plan.sshConnection.port} · 连接版本 {plan.sshConnection.revision}
        </p>
      )}
      <dl className="run-meta">
        <div>
          <dt>执行位置</dt>
          <dd>
            {proposal.backend === "ssh" ? `SSH · ${proposal.host}` : "本机"}
          </dd>
        </div>
        <div>
          <dt>时间上限</dt>
          <dd>{proposal.timeoutSeconds} 秒</dd>
        </div>
        <div>
          <dt>评测</dt>
          <dd>
            {proposal.protocol.metric} · {proposal.protocol.seeds.length} 个种子
            ·{" "}
            {proposal.protocol.direction === "maximize"
              ? "越大越好"
              : "越小越好"}
          </dd>
        </div>
        <div>
          <dt>代码提交</dt>
          <dd className="mono">{plan.revision.slice(0, 12)}</dd>
        </div>
      </dl>
      <details className="plan-inspection">
        <DisclosureSummary>查看数据、预算与冻结文件</DisclosureSummary>
        <dl className="run-meta">
          <div>
            <dt>数据与划分</dt>
            <dd>{proposal.protocol.dataset}</dd>
          </div>
          <div>
            <dt>环境</dt>
            <dd>{proposal.protocol.environment}</dd>
          </div>
          <div>
            <dt>日志上限</dt>
            <dd>{Math.round(proposal.maxOutputBytes / 1048576)} MiB</dd>
          </div>
          <div>
            <dt>指标文件</dt>
            <dd>{proposal.protocol.metricsPath}</dd>
          </div>
          <div>
            <dt>种子</dt>
            <dd>{proposal.protocol.seeds.join(", ")}</dd>
          </div>
          {plan.sshConnection && (
            <div>
              <dt>已核对的主机指纹</dt>
              <dd className="mono">{plan.sshConnection.hostKeySha256}</dd>
            </div>
          )}
          <div>
            <dt>额外输入</dt>
            <dd>{proposal.inputs.join("、") || "无"}</dd>
          </div>
          <div>
            <dt>必需产物</dt>
            <dd>
              {proposal.protocol.requiredArtifacts.join("、") || "无额外产物"}
            </dd>
          </div>
          {proposal.backend === "ssh" && (
            <>
              <div>
                <dt>远端任务根目录</dt>
                <dd>
                  {proposal.remoteWorkdir ?? "用户目录下的工作台 Job 目录"}
                </dd>
              </div>
              <div>
                <dt>远端 Python</dt>
                <dd>{proposal.remotePython ?? "python3"}</dd>
              </div>
            </>
          )}
        </dl>
        <p className="muted">
          {proposal.backend === "ssh"
            ? `将向 ${proposal.host} 传输以下 ${plan.files.length} 个冻结文件及所选输入。`
            : `只运行以下 ${plan.files.length} 个冻结文件；工作区未提交修改不进入实验。`}
        </p>
        <ul className="snapshot-files">
          {plan.files.map((file) => (
            <li key={file.path}>
              <button
                className="frozen-file-button"
                type="button"
                aria-label={`查看冻结文件 ${file.path}`}
                aria-expanded={filePreview?.path === file.path}
                onClick={(event) => {
                  fileTrigger.current = event.currentTarget;
                  void readFrozenFile(file.path);
                }}
              >
                {file.path} <span>查看内容</span>
              </button>
              <code>{file.sha256}</code>
            </li>
          ))}
        </ul>
        {filePreview && (
          <section
            className="frozen-file-preview"
            aria-label="冻结文件只读预览"
            aria-busy={filePreview.loading}
          >
            <div className="loop-row">
              <strong>{filePreview.path}</strong>
              <Button
                variant="default"

                type="button"
                onClick={() => {
                  readSequence.current++;
                  setFilePreview(null);
                  fileTrigger.current?.focus();
                }}
              >
                关闭文件预览
              </Button>
            </div>
            {filePreview.loading && (
              <p role="status">正在核对并读取冻结版本…</p>
            )}
            {filePreview.error && (
              <div className="loop-alert" role="alert">
                <span>{filePreview.error}</span>
                <Button
                  variant="default"
                  type="button"

                  onClick={() => void readFrozenFile(filePreview.path)}
                >
                  重试读取
                </Button>
              </div>
            )}
            {filePreview.file && (
              <>
                <p className="muted">
                  只读 · 已核对 SHA-256 · {filePreview.file.size} 字节 · 完整
                  UTF-8 文本
                </p>
                <pre tabIndex={0} aria-label={`冻结内容 ${filePreview.path}`}>
                  {filePreview.file.content || "（空文件）"}
                </pre>
              </>
            )}
          </section>
        )}
      </details>
      {proposal.backend === "ssh" && (
        <p className="muted">
          代码和输入将传至 {proposal.host} ·{" "}
          {proposal.remoteWorkdir ?? "远端用户目录"}
        </p>
      )}
      {error && (
        <p className="loop-alert" role="alert">
          {error}
        </p>
      )}
      {dismissing ? (
        <form
          className="loop-form"
          onSubmit={(event) => {
            event.preventDefault();
            void dismiss();
          }}
        >
          <label>
            撤回原因
            <TextArea
              required
              autoFocus
              value={dismissReason}
              onChange={(event) => setDismissReason(event.target.value)}
            />
          </label>
          <div className="loop-actions">
            <Button
              variant="default"

              type="button"
              onClick={() => setDismissing(false)}
            >
              返回
            </Button>
            <Button
              variant="primary"

              disabled={busy || !dismissReason.trim()}
            >
              撤回方案
            </Button>
          </div>
        </form>
      ) : (
        <div className="loop-actions">
          <Button
            variant="default"

            disabled={busy}
            onClick={() => setDismissing(true)}
          >
            不采用
          </Button>
          <Button
            variant="default"

            disabled={busy}
            onClick={() => onAskAgent(researchRequests.revisePlan(plan.id))}
          >
            让 Agent 修改
          </Button>
          <Button
            variant="primary"

            disabled={!connected || busy || !experiment}
            onClick={() => void approve()}
          >
            {busy ? "正在启动…" : "批准并运行"}
          </Button>
        </div>
      )}
      <p className="approval-scope">仅批准此代码、命令、输入和预算。</p>
    </article>
  );
}
