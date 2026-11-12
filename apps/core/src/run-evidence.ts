import { randomUUID } from "node:crypto";
import type { ManagedRun, ManagedPlan } from "@research-workbench/contracts";
import {
  ClaimProposalSchema,
  CompassUpdateSchema,
  DecisionSchema,
  type EvidenceClaim,
  type ResearchCompass,
  type ResearchDecision,
  type LoopOverview
} from "@research-workbench/contracts";
import { RunStore } from "./run-store.js";
import type { PermissionService } from "./permissions.js";
import { RunArtifactsService } from "./run-artifacts.js";
import { atomicWorkspaceWrite } from "./workspace.js";
export class RunEvidenceService {
  constructor(
    private readonly root: string,
    private readonly store: RunStore,
    private readonly permissions: PermissionService,
    private readonly artifacts: RunArtifactsService
  ) {}
  overview(): LoopOverview {
    return {
      compass: this.store.compass(),
      plans: this.store.plans(),
      runs: this.store.runs(),
      claims: this.store.claims(),
      decisions: this.store.decisions()
    };
  }
  updateCompass(raw: unknown): ResearchCompass {
    return this.store.saveCompass(CompassUpdateSchema.parse(raw));
  }
  async proposeClaim(
    raw: unknown,
    actor: "human" | "agent" = "human"
  ): Promise<EvidenceClaim> {
    if (actor === "agent") this.permissions.assertAllowed("propose_claim");
    const input = ClaimProposalSchema.parse(raw);
    for (const source of input.sources)
      await this.artifacts.verifySource(source);
    const claim: EvidenceClaim = {
      ...input,
      id: `claim-${randomUUID()}`,
      status: "proposed",
      createdAt: new Date().toISOString(),
      confirmedAt: null
    };
    this.store.saveClaim(claim);
    return claim;
  }
  async confirmClaim(id: string): Promise<EvidenceClaim> {
    const claim = this.store.claim(id);
    if (!claim) throw new Error("结论不存在");
    for (const source of claim.sources)
      await this.artifacts.verifySource(source);
    if (claim.status === "confirmed") return claim;
    const result = {
      ...claim,
      status: "confirmed" as const,
      confirmedAt: new Date().toISOString()
    };
    this.store.saveClaim(result);
    return result;
  }
  recordDecision(raw: unknown): ResearchDecision {
    const input = DecisionSchema.parse(raw);
    if (input.claimIds.some((id) => !this.store.claim(id)))
      throw new Error("决策引用了不存在的结论");
    const decision = {
      ...input,
      id: `decision-${randomUUID()}`,
      createdAt: new Date().toISOString()
    };
    this.store.saveDecision(decision);
    return decision;
  }
  async compare(
    leftId: string,
    rightId: string
  ): Promise<{
    comparable: boolean;
    reason: string;
    metric: string;
    delta: number | null;
    better: boolean | null;
  }> {
    const left = this.requireRun(leftId),
      right = this.requireRun(rightId);
    const a = this.requirePlan(left.planId),
      b = this.requirePlan(right.planId);
    const metric = a.proposal.protocol.metric;
    if (left.state !== "succeeded" || right.state !== "succeeded")
      return {
        comparable: false,
        reason: "仅比较完整验证成功的运行",
        metric,
        delta: null,
        better: null
      };
    if (a.comparableGroup !== b.comparableGroup)
      return {
        comparable: false,
        reason: "评测协议、输入或环境不同，不可直接排名",
        metric,
        delta: null,
        better: null
      };
    for (const run of [left, right])
      for (const artifact of run.artifacts) {
        if (artifact.sha256)
          await this.artifacts.verifySource({
            runId: run.id,
            artifactPath: artifact.path,
            sha256: artifact.sha256,
            relation: "supports"
          });
      }
    const delta = right.metrics[metric]! - left.metrics[metric]!;
    return {
      comparable: true,
      reason: "同协议、输入与声明环境；未作统计显著性推断",
      metric,
      delta,
      better:
        a.proposal.protocol.direction === "maximize" ? delta > 0 : delta < 0
    };
  }
  async exportReport(): Promise<{ path: string }> {
    const state = this.overview();
    for (const claim of state.claims.filter(
      (item) => item.status === "confirmed"
    ))
      for (const source of claim.sources)
        await this.artifacts.verifySource(source);
    const clean = (value: string) => value.replace(/[\r\n|]/g, " ");
    const lines = [
      "# 研究检查点",
      `生成：${new Date().toISOString()}`,
      "",
      `目标：${state.compass.goal}`,
      `约束：${state.compass.constraints}`,
      `停止条件：${state.compass.stopConditions}`,
      `下一步：${state.compass.nextStep}`,
      `理由：${state.compass.nextStepReason}`,
      "",
      "## 运行与测量",
      "",
      "| Run | 状态 | revision | 指标 | 限制 |",
      "|---|---|---|---|---|",
      ...state.runs.map(
        (run) =>
          `| ${run.id} | ${run.state} | ${this.requirePlan(run.planId).revision} | ${clean(JSON.stringify(run.metrics))} | ${clean(run.reason ?? "")} |`
      ),
      "",
      "## 结论与证据",
      "",
      ...state.claims.flatMap((claim) => [
        `- [${claim.status}] ${claim.statement}`,
        `  局限：${claim.limitations}`,
        ...claim.sources.map(
          (source) =>
            `  ${source.relation}: ${source.runId} / ${source.artifactPath} / sha256:${source.sha256}`
        )
      ]),
      "",
      "## 决策",
      "",
      ...state.decisions.map(
        (item) =>
          `- ${item.action}: ${item.reason}（${item.claimIds.join(", ")}）`
      ),
      "",
      "指标由工具解析；环境身份包含声明与锁文件，未证明硬件/驱动完全等同。失败、unknown 和未确认结论不升级为事实。"
    ];
    const path = `.research/reports/checkpoint-${randomUUID()}.md`;
    await atomicWorkspaceWrite(this.root, path, lines.join("\n"));
    return { path };
  }
  private requirePlan(id: string): ManagedPlan {
    const value = this.store.plan(id);
    if (!value) throw new Error("计划不存在");
    return value;
  }
  private requireRun(id: string): ManagedRun {
    const value = this.store.run(id);
    if (!value) throw new Error("运行不存在");
    return value;
  }
  // Remote transport is provided by the SSH adapter, without changing domain records.
}
