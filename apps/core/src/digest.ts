/**
 * Research digest: what a scheduled check reports back.
 *
 * The point is not surveillance but direction: "three task books are waiting for
 * your confirmation" and "two runs have been pending for an hour" are the two
 * things that actually stall a research loop.
 */

export interface DigestInput {
  pendingDrafts: Array<{ id: string; title: string }>;
  proposedFacts: Array<{ id: string; statement: string }>;
  stalledRuns: Array<{ id: string; title: string; ageMinutes: number }>;
  sinceLastRun: { milestones: number; archivedRuns: number };
}

export interface Digest {
  title: string;
  lines: string[];
  /** True when there is something the human should act on. */
  actionable: boolean;
}

export function buildDigest(input: DigestInput, now = new Date()): Digest {
  const {
    pendingDrafts,
    proposedFacts,
    stalledRuns,
    sinceLastRun
  } = input;
  const lines: string[] = [];

  if (pendingDrafts.length > 0) {
    lines.push(
      `${pendingDrafts.length} 份任务书待确认：${pendingDrafts
        .slice(0, 3)
        .map((item) => `${item.id} ${item.title}`)
        .join("；")}${pendingDrafts.length > 3 ? " 等" : ""}`
    );
  }
  if (stalledRuns.length > 0) {
    lines.push(
      `${stalledRuns.length} 个运行超过 60 分钟未归档：${stalledRuns
        .slice(0, 3)
        .map((item) => `${item.id}（${item.ageMinutes} 分钟）`)
        .join("；")}`
    );
  }
  if (proposedFacts.length > 0) {
    lines.push(
      `${proposedFacts.length} 条事实待确认：${proposedFacts
        .slice(0, 2)
        .map((item) => `${item.id} ${item.statement.slice(0, 24)}`)
        .join("；")}`
    );
  }
  if (sinceLastRun.milestones > 0 || sinceLastRun.archivedRuns > 0) {
    lines.push(
      `上次巡检后：${sinceLastRun.milestones} 个里程碑、${sinceLastRun.archivedRuns} 次归档`
    );
  }

  const actionable =
    pendingDrafts.length > 0 ||
    stalledRuns.length > 0 ||
    proposedFacts.length > 0;

  if (lines.length === 0) {
    lines.push("没有待确认的任务书或停滞的运行。");
  }

  return {
    title: actionable ? "巡检：有需要你处理的事项" : "巡检：一切正常",
    lines,
    actionable
  };
}
