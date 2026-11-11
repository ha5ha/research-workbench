import type { LoopOverview } from "@research-workbench/contracts";

/** Project only authoritative ledger state; transcript card status may be historical. */
export function experimentPlanState(
  overview: LoopOverview | null,
  experimentId: string
) {
  const plans =
    overview?.plans
      .filter((plan) => plan.proposal.experimentId === experimentId)
      .sort(
        (a, b) =>
          b.version - a.version || b.createdAt.localeCompare(a.createdAt)
      ) ?? [];
  const plan = plans[0] ?? null;
  const run = plan
    ? (overview?.runs.find((item) => item.planId === plan.id) ?? null)
    : null;
  const pending = plan && !plan.closure && !run ? plan : null;
  return { plan, run, pending };
}
