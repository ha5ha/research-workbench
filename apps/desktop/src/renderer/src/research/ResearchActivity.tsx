import { Button, Icon } from "@research-workbench/ui";
// Review-strip composition adapted from alphaXiv/OpenResearch PlanStrip.tsx.
// MIT attribution and pinned upstream revision: /THIRD_PARTY_NOTICES.md.
import { useEffect } from "react";
import { PlanReviewDialog } from "./PlanReviewDialog";
import { useResearchOverview } from "./useResearchOverview";
import { RUN_STATES } from "./RunDetailView";

/** Persistent review controls live above the composer, outside the transcript. */
export function ResearchActivity({
  connected,
  state,
  openId,
  onOpenIdChange,
  onOpenResearch,
  onAskAgent
}: {
  connected: boolean;
  state: ReturnType<typeof useResearchOverview>;
  openId: string | null;
  onOpenIdChange: (id: string | null) => void;
  onOpenResearch: (runId?: string) => void;
  onAskAgent: (prompt: string) => void;
}) {
  const { overview, refresh, error } = state;
  const plans =
    overview?.plans.filter(
      (plan) =>
        !plan.closure && !overview.runs.some((run) => run.planId === plan.id)
    ) ?? [];
  const activeRuns =
    overview?.runs.filter(
      (run) => !["succeeded", "failed", "canceled"].includes(run.state)
    ) ?? [];
  const claims =
    overview?.claims.filter((claim) => claim.status === "proposed") ?? [];
  const firstActive = activeRuns[0];
  const openPlan = plans.find((plan) => plan.id === openId);
  useEffect(() => {
    if (overview && openId && !openPlan) onOpenIdChange(null);
  }, [overview, openId, openPlan, onOpenIdChange]);
  if (!error && !plans.length && !activeRuns.length && !claims.length)
    return null;
  return (
    <div className="research-activity" aria-label="科研待办">
      {error && (
        <div className="activity-row" role="status">
          <span>科研状态读取失败</span>
          <Button
            variant="default"

            onClick={() => void refresh().catch(() => {})}
          >
            重试
          </Button>
        </div>
      )}
      {plans.map((plan) => (
        <div key={plan.id} className="review-strip">
          <div className="activity-row">
            <div>
              <Icon name="file" className="activity-mark" />
              <strong>运行方案已准备</strong>
              <span className="activity-hint">{plan.proposal.command}</span>
            </div>
            <Button
              variant="default"

              aria-expanded={openId === plan.id}
              onClick={() =>
                onOpenIdChange(openId === plan.id ? null : plan.id)
              }
            >
              {openId === plan.id ? "收起方案" : "审阅方案"}
            </Button>
          </div>
        </div>
      ))}
      {firstActive && (
        <div className="activity-row">
          <span>
            <i className="activity-dot active" />
            {activeRuns.length} 个运行 · {RUN_STATES[firstActive.state]}
          </span>
          <Button
            variant="default"
            onClick={() => onOpenResearch(firstActive.id)}
          >
            查看运行
          </Button>
        </div>
      )}
      {claims.length > 0 && (
        <div className="activity-row">
          <span>{claims.length} 条结论待核验</span>
          <Button variant="default" onClick={() => onOpenResearch()}>
            审阅证据
          </Button>
        </div>
      )}
      {openPlan && (
        <PlanReviewDialog
          key={openPlan.id}
          plan={openPlan}
          connected={connected}
          onClose={() => onOpenIdChange(null)}
          onChanged={async () => {
            await refresh();
          }}
          onAskAgent={onAskAgent}
        />
      )}
    </div>
  );
}
