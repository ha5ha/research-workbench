import {
  Button,
  Icon,
  IconButton,
  TextArea,
  DisclosureSummary
} from "@research-workbench/ui";
import { useEffect, useRef, useState } from "react";
import type { ResearchCompass } from "@research-workbench/contracts";
import { PlanReview } from "../research/PlanReview";
import { RunDetailView, RUN_STATES } from "../research/RunDetailView";
import { useResearchOverview } from "../research/useResearchOverview";
import { researchRequests } from "../research/agent-requests";

type Experiment = { id: string; title: string };
const EMPTY_COMPASS: ResearchCompass = {
  goal: "",
  constraints: "",
  stopConditions: "",
  nextStep: "",
  nextStepReason: "",
  updatedAt: ""
};
const ACTIONS = {
  continue: "继续",
  repair: "修复",
  stop: "停止",
  reject: "放弃"
} as const;

export function ResearchLoop({
  connected,
  initialRunId,
  onAskAgent
}: {
  connected: boolean;
  initialRunId?: string | null;
  onAskAgent: (prompt: string) => void;
}) {
  const {
    overview,
    refresh,
    error: loadError
  } = useResearchOverview(connected);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selectedId, setSelectedId] = useState(initialRunId ?? null);
  const [editing, setEditing] = useState(false);
  const [compass, setCompass] = useState(EMPTY_COMPASS);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionAction, setDecisionAction] =
    useState<keyof typeof ACTIONS>("continue");
  const [reason, setReason] = useState("");
  const [claimIds, setClaimIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [path, setPath] = useState("");
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (connected)
      void window.rw
        .request<Experiment[]>("experiments.list")
        .then(setExperiments)
        .catch((reason) => setError(String(reason)));
  }, [connected, overview?.plans.length]);
  useEffect(() => {
    if (initialRunId) setSelectedId(initialRunId);
  }, [initialRunId]);
  useEffect(() => {
    if (overview && !editing) setCompass(overview.compass);
  }, [overview, editing]);
  useEffect(() => {
    if (error) alertRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEditing(false);
        setDecisionOpen(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setNotice("");
    setPath("");
    try {
      await work();
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  const plans =
    overview?.plans.filter(
      (plan) =>
        !plan.closure && !overview.runs.some((run) => run.planId === plan.id)
    ) ?? [];
  const runs = overview?.runs ?? [];
  const titleFor = (id: string) =>
    experiments.find((experiment) => experiment.id === id)?.title ?? id;
  return (
    <div className="research-loop page-view">
      <div className="loop-heading">
        <div>
          <h1>研究罗盘</h1>
        </div>
        <Button
          variant="ghost"

          disabled={busy || !connected}
          onClick={() =>
            void action(async () => {
              const result = await window.rw.request<{ path: string }>(
                "loop.export"
              );
              setNotice("已导出研究检查点");
              setPath(result.path);
            })
          }
        >
          导出检查点
        </Button>
      </div>
      {(error || loadError) && (
        <div ref={alertRef} role="alert" className="loop-alert">
          {error || loadError}
          <button
            aria-label="重试科研状态"
            onClick={() => void action(refresh)}
          >
            重试
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="loop-notice">
          <div>
            {notice}
            {path && (
              <details>
                <DisclosureSummary>查看文件路径</DisclosureSummary>
                <code>{path}</code>
              </details>
            )}
          </div>
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            <Icon name="x" />
          </button>
        </div>
      )}
      {!connected && (
        <p role="status" className="loop-alert">
          服务暂未连接，恢复后可继续审阅。
        </p>
      )}
      <section className="compass-panel">
        <div className="loop-section-heading">
          <h2>当前方向</h2>
          <Button variant="ghost" onClick={() => setEditing(!editing)}>
            {editing ? "收起编辑" : "编辑方向"}
          </Button>
        </div>
        {editing ? (
          <form
            className="loop-form"
            onSubmit={(event) => {
              event.preventDefault();
              void action(async () => {
                const { updatedAt: _, ...input } = compass;
                await window.rw.request("loop.compass.update", input);
                setEditing(false);
              });
            }}
          >
            {(
              [
                ["goal", "研究问题"],
                ["constraints", "约束"],
                ["stopConditions", "停止条件"],
                ["nextStep", "下一步"],
                ["nextStepReason", "为什么做这一步"]
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <TextArea
                  value={compass[key]}
                  onChange={(event) =>
                    setCompass({ ...compass, [key]: event.target.value })
                  }
                />
              </label>
            ))}
            <div className="loop-actions">
              <Button variant="primary" disabled={busy || !connected}>
                保存方向
              </Button>
              <Button
                variant="default"

                type="button"
                onClick={() => setEditing(false)}
              >
                取消
              </Button>
            </div>
          </form>
        ) : (
          <>
            <h3>{overview?.compass.goal || "从你想解决的问题开始"}</h3>
            <p>
              {overview?.compass.nextStep ||
                "在对话中描述目标，让 Agent 阅读项目并准备可执行方案。"}
            </p>
            {overview?.compass.nextStepReason && (
              <p className="muted">{overview.compass.nextStepReason}</p>
            )}
            {(overview?.compass.constraints ||
              overview?.compass.stopConditions) && (
              <details>
                <DisclosureSummary>边界与停止条件</DisclosureSummary>
                <p>{overview.compass.constraints}</p>
                <p>{overview.compass.stopConditions}</p>
              </details>
            )}
            <Button
              variant="ghost"
              className=" text-action"
              onClick={() =>
                onAskAgent(researchRequests.nextStep(overview?.compass.goal))
              }
            >
              与 Agent 讨论下一步 <Icon name="arrow-right" size={14} />
            </Button>
          </>
        )}
      </section>
      {plans.length > 0 && (
        <section>
          <div className="loop-section-heading">
            <h2>待审方案</h2>
            <span className="muted">{plans.length} 项</span>
          </div>
          {plans.map((plan) => (
            <PlanReview
              key={plan.id}
              plan={plan}
              title={titleFor(plan.proposal.experimentId)}
              connected={connected}
              onAskAgent={onAskAgent}
              onDismissed={async () => {
                await refresh();
              }}
              onStarted={async (run) => {
                setSelectedId(run.id);
                await refresh();
              }}
            />
          ))}
        </section>
      )}
      {overview?.plans.some((plan) => plan.closure) && (
        <details className="plan-history">
          <DisclosureSummary>已撤回与被替代的方案</DisclosureSummary>
          {overview.plans
            .filter((plan) => plan.closure)
            .map((plan) => (
              <div className="decision-entry" key={plan.id}>
                <strong>
                  {plan.closure?.kind === "dismissed" ? "已撤回" : "已替代"}
                </strong>
                <p>
                  {titleFor(plan.proposal.experimentId)} ·{" "}
                  {plan.closure?.reason}
                </p>
                <small>
                  {plan.id} · {plan.closure?.at}
                </small>
              </div>
            ))}
        </details>
      )}
      <section>
        <div className="loop-section-heading">
          <h2>实验与运行</h2>
          <Button
            variant="ghost"

            onClick={() => onAskAgent(researchRequests.prepareExperiment)}
          >
            让 Agent 准备实验 <Icon name="arrow-right" size={14} />
          </Button>
        </div>
        {runs.length === 0 ? (
          <div className="loop-empty">
            <h3>还没有运行</h3>
            <p>Agent 准备方案，你审阅并批准。结果与产物会自动归档。</p>
          </div>
        ) : (
          <div className="loop-run-list">
            {runs.map((run) => (
              <button
                className={`loop-run-row ${selectedId === run.id ? "selected" : ""}`}
                key={run.id}
                onClick={() => setSelectedId(run.id)}
              >
                <span className={`run-state-dot ${run.state}`} />
                <div>
                  <strong>{titleFor(run.experimentId)}</strong>
                  <small>
                    第 {run.attempt} 次 ·{" "}
                    {new Date(run.createdAt).toLocaleString("zh-CN")}
                  </small>
                </div>
                <span>{RUN_STATES[run.state]}</span>
              </button>
            ))}
          </div>
        )}
      </section>
      {selectedId && (
        <RunDetailView
          key={selectedId}
          id={selectedId}
          runs={runs}
          connected={connected}
          onClose={() => setSelectedId(null)}
          onAskAgent={onAskAgent}
        />
      )}
      <section>
        <div className="loop-section-heading">
          <h2>证据与结论</h2>
          <span className="muted">{overview?.claims.length ?? 0} 条</span>
        </div>
        {overview?.claims.map((claim) => (
          <article className="evidence-entry" key={claim.id}>
            <div className="loop-row">
              <strong>{claim.statement}</strong>
              <span
                className={`tag ${claim.status === "confirmed" ? "green" : "amber"}`}
              >
                {claim.status === "confirmed"
                  ? "已确认"
                  : claim.status === "refuted"
                    ? "已反驳"
                    : "候选"}
              </span>
            </div>
            <p>{claim.limitations || "尚未记录局限"}</p>
            {claim.sources.map((source) => (
              <button
                className="evidence-link"
                key={`${source.runId}:${source.artifactPath}:${source.relation}`}
                onClick={() => setSelectedId(source.runId)}
              >
                {source.relation === "supports" ? "支持" : "反证"} ·{" "}
                {source.artifactPath} <Icon name="arrow-right" size={14} />
              </button>
            ))}
            {claim.status === "proposed" && (
              <Button
                variant="default"

                disabled={busy || !connected}
                onClick={() =>
                  void action(() =>
                    window.rw.request("loop.claim.confirm", { id: claim.id })
                  )
                }
              >
                确认此结论
              </Button>
            )}
          </article>
        ))}
        {overview?.claims.length === 0 && (
          <p className="empty-note">
            运行完成后，让 Agent 分析原始产物并起草带来源的结论。
          </p>
        )}
      </section>
      <section>
        <div className="loop-section-heading">
          <h2>研究决策</h2>
          <Button
            variant="default"

            aria-expanded={decisionOpen}
            onClick={() => setDecisionOpen(!decisionOpen)}
          >
            {decisionOpen ? "收起记录" : "记录决策"}
          </Button>
        </div>
        {decisionOpen && (
          <form
            className="loop-form decision-form"
            onSubmit={(event) => {
              event.preventDefault();
              void action(async () => {
                await window.rw.request("loop.decision.create", {
                  action: decisionAction,
                  reason,
                  claimIds
                });
                setReason("");
                setClaimIds([]);
                setDecisionOpen(false);
              });
            }}
          >
            <fieldset>
              <legend>下一步</legend>
              <div className="loop-segment">
                {Object.entries(ACTIONS).map(([key, label]) => (
                  <Button
                    variant="default"
                    key={key}
                    type="button"
                    aria-pressed={decisionAction === key}
                    onClick={() =>
                      setDecisionAction(key as keyof typeof ACTIONS)
                    }
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </fieldset>
            {Boolean(overview?.claims.length) && (
              <fieldset>
                <legend>引用结论（可选）</legend>
                <div className="loop-choices">
                  {overview?.claims.map((claim) => (
                    <Button
                      variant="default"
                      type="button"
                      key={claim.id}
                      aria-pressed={claimIds.includes(claim.id)}
                      onClick={() =>
                        setClaimIds(
                          claimIds.includes(claim.id)
                            ? claimIds.filter((id) => id !== claim.id)
                            : [...claimIds, claim.id]
                        )
                      }
                    >
                      {claim.statement}
                    </Button>
                  ))}
                </div>
              </fieldset>
            )}
            <label>
              依据与理由
              <TextArea
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <div className="loop-actions">
              <Button
                variant="primary"

                disabled={busy || !connected || !reason.trim()}
              >
                保存决策
              </Button>
              <Button
                variant="default"
                type="button"

                onClick={() => setDecisionOpen(false)}
              >
                取消
              </Button>
            </div>
          </form>
        )}
        {overview?.decisions.map((decision) => (
          <div className="decision-entry" key={decision.id}>
            <strong>{ACTIONS[decision.action]}</strong>
            <p>{decision.reason}</p>
            <small>
              {new Date(decision.createdAt).toLocaleString("zh-CN")}
            </small>
          </div>
        ))}
        {overview?.decisions.length === 0 && !decisionOpen && (
          <p className="empty-note">继续、修复或停止，留下你的判断及依据。</p>
        )}
      </section>
      <details className="loop-skills">
        <DisclosureSummary>科研记录工具</DisclosureSummary>
        <div className="loop-choices">
          {(
            [
              ["research-checkpoint", "研究检查点"],
              ["research-evidence-ledger", "证据台账"],
              ["research-decision-log", "决策记录"],
              ["research-next-step", "下一步建议"]
            ] as const
          ).map(([skillId, label]) => (
            <button
              key={skillId}
              disabled={busy || !connected}
              onClick={() =>
                void action(async () => {
                  const hello = await window.rw.request<{ projectId: string }>(
                    "system.hello"
                  );
                  const result = await window.rw.request<{
                    artifacts: Array<{ path: string }>;
                  }>("skills.run", {
                    skillId,
                    input: {
                      scope: { projectId: hello.projectId },
                      artifacts: [],
                      params: {}
                    }
                  });
                  setNotice(`已生成 ${label}`);
                  setPath(result.artifacts[0]?.path ?? "");
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
