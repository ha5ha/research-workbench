import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  ManagedPlan,
  ManagedRun,
  RunEvent,
  RunState,
  ResearchCompass,
  EvidenceClaim,
  ResearchDecision
} from "@research-workbench/contracts";

export class RunStore {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS managed_plans (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS managed_runs (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, idem TEXT NOT NULL UNIQUE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS managed_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, at TEXT NOT NULL, type TEXT NOT NULL, detail TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS research_loop_records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS managed_plan_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, plan_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS managed_schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS managed_plan_migration_backup (migration_id TEXT NOT NULL, plan_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(migration_id, plan_id));
    `);
    this.migratePlanClosures();
  }
  savePlan(plan: ManagedPlan, actor: "human" | "agent" = "human"): void {
    if (this.plan(plan.id)) throw new Error("冻结计划不可覆盖，请创建新计划");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT INTO managed_plans VALUES (?, ?)")
        .run(plan.id, JSON.stringify(plan));
      const used = new Set(this.runs().map((run) => run.planId));
      for (const previous of this.plans()) {
        if (
          previous.id !== plan.id &&
          previous.proposal.experimentId === plan.proposal.experimentId &&
          !previous.closure &&
          !used.has(previous.id)
        ) {
          this.closePlan(previous, {
            kind: "superseded",
            at: plan.createdAt,
            actor,
            reason: "同一实验已有新的冻结方案",
            replacementPlanId: plan.id
          });
        }
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  approve(id: string, digest: string): ManagedPlan {
    const plan = this.plan(id);
    if (!plan || plan.digest !== digest)
      throw new Error("计划身份已改变，请重新审阅");
    if (plan.closure)
      throw new Error("计划已撤回或被新方案替代，不能批准或启动");
    if (plan.approvedAt) return plan;
    plan.approvedAt = new Date().toISOString();
    this.db
      .prepare("UPDATE managed_plans SET data=? WHERE id=?")
      .run(JSON.stringify(plan), id);
    return plan;
  }
  dismiss(id: string, reason: string): ManagedPlan {
    const plan = this.plan(id);
    if (!plan) throw new Error("计划不存在");
    if (plan.closure) return plan;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.closePlan(plan, {
        kind: "dismissed",
        at: new Date().toISOString(),
        actor: "human",
        reason,
        replacementPlanId: null
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return plan;
  }
  plan(id: string): ManagedPlan | null {
    return this.get<ManagedPlan>("managed_plans", id);
  }
  plans(): ManagedPlan[] {
    return this.all<ManagedPlan>("managed_plans").reverse();
  }
  run(id: string): ManagedRun | null {
    return this.get<ManagedRun>("managed_runs", id);
  }
  runs(): ManagedRun[] {
    return this.all<ManagedRun>("managed_runs").reverse();
  }
  byKey(key: string): ManagedRun | null {
    const row = this.db
      .prepare("SELECT data FROM managed_runs WHERE idem=?")
      .get(key) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as ManagedRun) : null;
  }
  createRun(proposedPlan: ManagedPlan, key: string): ManagedRun {
    const existing = this.byKey(key);
    if (existing) {
      if (existing.planId !== proposedPlan.id)
        throw new Error("幂等键已被其他计划使用");
      return existing;
    }
    const plan = this.plan(proposedPlan.id);
    if (!plan || plan.digest !== proposedPlan.digest)
      throw new Error("计划身份已改变，请重新审阅");
    if (plan.closure)
      throw new Error("计划已撤回或被新方案替代，不能批准或启动");
    if (!plan.approvedAt) throw new Error("运行计划尚未批准");
    if (
      this.runs().some(
        (run) =>
          run.experimentId === plan.proposal.experimentId &&
          ["preparing", "running", "collecting", "unknown"].includes(run.state)
      )
    ) {
      throw new Error("该实验已有活动或未知运行，请先核对原运行");
    }
    const run: ManagedRun = {
      id: `job-${randomUUID()}`,
      planId: plan.id,
      experimentId: plan.proposal.experimentId,
      attempt:
        this.runs().filter(
          (item) => item.experimentId === plan.proposal.experimentId
        ).length + 1,
      idempotencyKey: key,
      state: "preparing",
      jobToken: randomUUID(),
      pid: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      reason: null,
      metrics: {},
      artifacts: [],
      cancelRequested: false
    };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT INTO managed_runs VALUES (?, ?, ?, ?)")
        .run(run.id, plan.id, key, JSON.stringify(run));
      this.event(run.id, "preparing", "运行意图已持久化，等待提交");
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return run;
  }
  update(run: ManagedRun, state: RunState, detail?: string): ManagedRun {
    const previous = this.run(run.id);
    if (!previous) throw new Error("运行不存在");
    if (["succeeded", "failed", "canceled"].includes(previous.state))
      return previous;
    const next = {
      ...run,
      state,
      cancelRequested: previous.cancelRequested || run.cancelRequested
    };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("UPDATE managed_runs SET data=? WHERE id=?")
        .run(JSON.stringify(next), run.id);
      if (state !== previous.state || detail)
        this.event(run.id, state, detail ?? state);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return next;
  }
  event(runId: string, type: string, detail: string): void {
    this.db
      .prepare(
        "INSERT INTO managed_events(run_id,at,type,detail) VALUES(?,?,?,?)"
      )
      .run(runId, new Date().toISOString(), type, detail);
  }
  events(runId: string): RunEvent[] {
    return this.db
      .prepare(
        "SELECT seq, run_id AS runId, at, type, detail FROM managed_events WHERE run_id=? ORDER BY seq"
      )
      .all(runId) as unknown as RunEvent[];
  }
  compass(): ResearchCompass {
    return (
      this.record<ResearchCompass>("compass") ?? {
        goal: "",
        constraints: "",
        stopConditions: "",
        nextStep: "",
        nextStepReason: "",
        updatedAt: ""
      }
    );
  }
  saveCompass(input: Omit<ResearchCompass, "updatedAt">): ResearchCompass {
    const compass = { ...input, updatedAt: new Date().toISOString() };
    this.saveRecord("compass", "compass", compass);
    return compass;
  }
  claims(): EvidenceClaim[] {
    return this.records<EvidenceClaim>("claim");
  }
  claim(id: string): EvidenceClaim | null {
    return this.record(id);
  }
  saveClaim(claim: EvidenceClaim): void {
    if (this.claim(claim.id)?.status === "confirmed")
      throw new Error("已确认结论不可覆盖");
    this.saveRecord(claim.id, "claim", claim);
  }
  decisions(): ResearchDecision[] {
    return this.records<ResearchDecision>("decision");
  }
  saveDecision(decision: ResearchDecision): void {
    this.saveRecord(decision.id, "decision", decision);
  }
  private get<T>(
    table: "managed_plans" | "managed_runs",
    id: string
  ): T | null {
    const row = this.db
      .prepare(`SELECT data FROM ${table} WHERE id=?`)
      .get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as T) : null;
  }
  private all<T>(table: "managed_plans" | "managed_runs"): T[] {
    return (
      this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid`).all() as {
        data: string;
      }[]
    ).map((row) => JSON.parse(row.data) as T);
  }
  private record<T>(id: string): T | null {
    const row = this.db
      .prepare("SELECT data FROM research_loop_records WHERE id=?")
      .get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as T) : null;
  }
  private records<T>(kind: string): T[] {
    return (
      this.db
        .prepare(
          "SELECT data FROM research_loop_records WHERE kind=? ORDER BY rowid DESC"
        )
        .all(kind) as { data: string }[]
    ).map((row) => JSON.parse(row.data) as T);
  }
  private saveRecord(id: string, kind: string, data: unknown): void {
    this.db
      .prepare(
        "INSERT INTO research_loop_records VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data"
      )
      .run(id, kind, JSON.stringify(data));
  }
  private closePlan(
    plan: ManagedPlan,
    closure: NonNullable<ManagedPlan["closure"]>
  ): void {
    if (plan.closure) throw new Error("计划关闭记录不可覆盖");
    plan.closure = closure;
    this.db
      .prepare("UPDATE managed_plans SET data=? WHERE id=?")
      .run(JSON.stringify(plan), plan.id);
    this.db
      .prepare("INSERT INTO managed_plan_events(plan_id,data) VALUES (?,?)")
      .run(plan.id, JSON.stringify(closure));
  }
  private migratePlanClosures(): void {
    const id = "plan-closure-v1";
    if (
      this.db
        .prepare("SELECT id FROM managed_schema_migrations WHERE id=?")
        .get(id)
    )
      return;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const plans = this.plans();
      const used = new Set(this.runs().map((run) => run.planId));
      const latest = new Map<string, string>();
      const at = new Date().toISOString();
      for (const plan of plans) {
        this.db
          .prepare(
            "INSERT INTO managed_plan_migration_backup SELECT ?,id,data FROM managed_plans WHERE id=?"
          )
          .run(id, plan.id);
        plan.closure ??= null;
        this.db
          .prepare("UPDATE managed_plans SET data=? WHERE id=?")
          .run(JSON.stringify(plan), plan.id);
        if (plan.closure) continue;
        const replacementPlanId = latest.get(plan.proposal.experimentId);
        if (!replacementPlanId) latest.set(plan.proposal.experimentId, plan.id);
        else if (!used.has(plan.id))
          this.closePlan(plan, {
            kind: "superseded",
            at,
            actor: "system",
            reason: "迁移时保留同一实验最新方案，关闭旧的未运行方案",
            replacementPlanId
          });
      }
      this.db
        .prepare("INSERT INTO managed_schema_migrations VALUES (?,?)")
        .run(id, at);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
