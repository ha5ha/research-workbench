import { randomUUID } from "node:crypto";
import { chmod, open, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import {
  RunProposalSchema,
  ClaimProposalSchema,
  CompassUpdateSchema,
  DecisionSchema,
  type ManagedPlan,
  type ManagedRun,
  type RunProposal,
  type RunArtifact,
  type EvidenceClaim,
  type EvidenceSource,
  type ResearchCompass,
  type ResearchDecision,
  type LoopOverview,
  type RunDetail
} from "@research-workbench/contracts";
import type { ExperimentStore } from "./experiment-store.js";
import type { SeedResult } from "./experiment-store.js";
import type { PermissionService } from "./permissions.js";
import { RunStore } from "./run-store.js";
import {
  RunSnapshot,
  hash,
  canonical,
  assertSnapshotPath
} from "./run-snapshot.js";
import { atomicWorkspaceWrite, workspacePath } from "./workspace.js";
import { executionEnvironment, redactSecrets } from "./execution-env.js";
import { LOCAL_SUPERVISOR } from "./local-supervisor.js";
import {
  launchLocalSupervisor,
  SupervisorLaunchUncertainError
} from "./local-launcher.js";
import { SshExecutor, type RemoteExecutor } from "./ssh-executor.js";

interface JobStatus {
  runId: string;
  token: string;
  state: "running" | "completed" | "failed" | "canceled";
  pid: number;
  startedAt: string;
  heartbeatAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  reason: string | null;
  terminationError?: string | null;
}

export class RunService {
  private readonly snapshot: RunSnapshot;
  private readonly refreshing = new Map<string, Promise<ManagedRun>>();
  private readonly starting = new Map<string, Promise<ManagedRun>>();
  private readonly remote: RemoteExecutor;
  constructor(
    readonly root: string,
    readonly store: RunStore,
    private readonly experiments: ExperimentStore,
    private readonly permissions: PermissionService,
    private readonly changed: (run: ManagedRun) => void = () => {},
    git = "git",
    remote?: RemoteExecutor,
    private readonly launchSupervisor = launchLocalSupervisor
  ) {
    this.snapshot = new RunSnapshot(root, git);
    this.remote = remote ?? new SshExecutor(root);
  }

  async propose(
    raw: unknown,
    actor: "human" | "agent" = "human"
  ): Promise<ManagedPlan> {
    if (actor === "agent") this.permissions.assertAllowed("request_run");
    const proposal = RunProposalSchema.parse(raw);
    if (proposal.backend === "ssh" && !proposal.host)
      throw new Error("SSH 运行必须选择已配置的主机别名");
    const experiment = this.experiments.get(proposal.experimentId);
    if (!experiment) throw new Error("实验不存在");
    const sshConnection =
      proposal.backend === "ssh"
        ? this.remote.connectionIdentity?.(proposal.host!)
        : undefined;
    const id = `plan-${randomUUID()}`;
    const frozen = await this.snapshot.create(id, proposal.inputs);
    const outputs = [
      proposal.protocol.metricsPath,
      ...proposal.protocol.requiredArtifacts
    ];
    for (const path of outputs) {
      assertSnapshotPath(path);
      if (frozen.files.some((file) => file.path === path))
        throw new Error(`输出已在快照中存在，不能冒充新证据：${path}`);
    }
    const identity = {
      proposal,
      ...frozen,
      taskbookHash: hash(canonical(experiment.taskBook)),
      ...(sshConnection ? { sshConnection } : {})
    };
    const comparableGroup = hash(
      canonical({
        protocol: proposal.protocol,
        command: proposal.command,
        inputHash: frozen.inputHash,
        environmentHash: frozen.environmentHash,
        backend: proposal.backend,
        host: proposal.host ?? "local",
        ...(proposal.backend === "ssh"
          ? {
              remotePython: proposal.remotePython ?? "python3",
              remoteWorkdir: proposal.remoteWorkdir ?? "default",
              ...(sshConnection ? { sshConnection } : {})
            }
          : {})
      })
    );
    const plan: ManagedPlan = {
      id,
      version:
        this.store
          .plans()
          .filter(
            (item) => item.proposal.experimentId === proposal.experimentId
          ).length + 1,
      ...identity,
      comparableGroup,
      digest: hash(canonical(identity)),
      approvedAt: null,
      closure: null,
      createdAt: new Date().toISOString()
    };
    this.store.savePlan(plan, actor);
    return plan;
  }

  async approve(planId: string, digest: string): Promise<ManagedPlan> {
    const plan = this.requirePlan(planId);
    if (plan.closure)
      throw new Error("计划已撤回或被新方案替代，不能批准或启动");
    if (plan.digest !== digest) throw new Error("计划身份已改变，请重新审阅");
    await this.snapshot.verify(planId, plan.files);
    if (this.requirePlan(planId).closure)
      throw new Error("计划已撤回或被新方案替代，不能批准或启动");
    const experiment = this.experiments.get(plan.proposal.experimentId);
    if (
      !experiment ||
      hash(canonical(experiment.taskBook)) !== plan.taskbookHash
    )
      throw new Error("任务书已变化，需要重新提议计划");
    this.experiments.confirmTaskbook(experiment.id);
    return this.store.approve(planId, digest);
  }

  async readFrozenFile(planId: string, path: string) {
    const plan = this.requirePlan(planId);
    return this.snapshot.readText(plan.id, plan.files, path);
  }

  async start(planId: string, idempotencyKey: string): Promise<ManagedRun> {
    const pending = this.starting.get(idempotencyKey);
    if (pending) {
      const run = await pending;
      if (run.planId !== planId) throw new Error("幂等键冲突");
      return run;
    }
    const operation = this.startOnce(planId, idempotencyKey).finally(() =>
      this.starting.delete(idempotencyKey)
    );
    this.starting.set(idempotencyKey, operation);
    return operation;
  }
  private async startOnce(
    planId: string,
    idempotencyKey: string
  ): Promise<ManagedRun> {
    if (!idempotencyKey || idempotencyKey.length > 200)
      throw new Error("运行请求需要稳定幂等键");
    const plan = this.requirePlan(planId);
    const previous = this.store.byKey(idempotencyKey);
    if (previous) {
      if (previous.planId !== planId) throw new Error("幂等键已被其他计划使用");
      return previous;
    }
    if (plan.closure)
      throw new Error("计划已撤回或被新方案替代，不能批准或启动");
    if (!plan.approvedAt) throw new Error("运行计划尚未批准");
    const experiment = this.experiments.get(plan.proposal.experimentId);
    if (
      experiment?.taskbookStatus !== "confirmed" ||
      hash(canonical(experiment.taskBook)) !== plan.taskbookHash
    )
      throw new Error("任务书确认已撤回或内容变化，需要重新批准计划");
    await this.snapshot.verify(plan.id, plan.files);
    if (plan.proposal.backend === "ssh") this.remote.validateConnection?.(plan);
    const recovered = this.store.byKey(idempotencyKey);
    if (recovered) {
      if (recovered.planId !== planId)
        throw new Error("幂等键已被其他计划使用");
      return recovered;
    }
    const run = this.store.createRun(plan, idempotencyKey);
    try {
      for (const file of plan.files) {
        const content = await readFile(
          await workspacePath(
            this.root,
            `.research/plans/${plan.id}/source/${file.path}`
          )
        );
        if (hash(content) !== file.sha256)
          throw new Error("冻结代码在启动前发生变化");
        const destination = await atomicWorkspaceWrite(
          this.root,
          `.research/jobs/${run.id}/source/${file.path}`,
          content
        );
        if (file.executable && process.platform !== "win32")
          await chmod(destination, 0o700);
      }
      if (plan.proposal.backend !== "local")
        return await this.startRemote(run, plan);
      const dir = join(this.root, ".research", "jobs", run.id);
      await atomicWorkspaceWrite(
        this.root,
        `.research/jobs/${run.id}/job.json`,
        JSON.stringify({
          runId: run.id,
          token: run.jobToken,
          command: plan.proposal.command,
          revision: plan.revision,
          timeoutSeconds: plan.proposal.timeoutSeconds,
          maxOutputBytes: plan.proposal.maxOutputBytes
        })
      );
      const supervisor = await atomicWorkspaceWrite(
        this.root,
        `.research/jobs/${run.id}/supervisor.mjs`,
        LOCAL_SUPERVISOR
      );
      run.pid = await this.launchSupervisor(
        process.execPath,
        supervisor,
        dir,
        executionEnvironment(dir)
      );
      const result = this.store.update(
        run,
        "running",
        "独立 supervisor 已启动；应用退出后继续执行"
      );
      this.changed(result);
      return result;
    } catch (error) {
      // Both SSH and Windows shell activation can outlive lost acknowledgements.
      const result = this.store.update(
        { ...run, reason: message(error) },
        plan.proposal.backend === "ssh" ||
          error instanceof SupervisorLaunchUncertainError
          ? "unknown"
          : "failed",
        message(error)
      );
      this.changed(result);
      return result;
    }
  }

  async refresh(id: string): Promise<ManagedRun> {
    const pending = this.refreshing.get(id);
    if (pending) return pending;
    const operation = this.refreshOnce(id).finally(() =>
      this.refreshing.delete(id)
    );
    this.refreshing.set(id, operation);
    return operation;
  }
  async refreshAll(): Promise<void> {
    for (const run of this.store.runs())
      if (!["succeeded", "failed", "canceled"].includes(run.state))
        await this.refresh(run.id);
  }
  private async refreshOnce(id: string): Promise<ManagedRun> {
    const run = this.requireRun(id);
    if (["succeeded", "failed", "canceled"].includes(run.state)) return run;
    const plan = this.requirePlan(run.planId);
    try {
      if (plan.proposal.backend === "ssh") await this.syncRemote(run, plan);
      const path = await workspacePath(
        this.root,
        `.research/jobs/${id}/status.json`
      );
      const status = JSON.parse(await readFile(path, "utf8")) as JobStatus;
      if (status.runId !== id || status.token !== run.jobToken)
        throw new Error("Job 身份不匹配");
      if (
        !["running", "completed", "failed", "canceled"].includes(status.state)
      )
        throw new Error("无效 Job 状态");
      if (status.state === "running") {
        if (status.reason)
          throw new Error(
            `Job 已请求终止但尚未确认退出：${status.reason}${status.terminationError ? `；${status.terminationError}` : ""}`
          );
        if (
          !Number.isFinite(Date.parse(status.heartbeatAt)) ||
          Date.now() - Date.parse(status.heartbeatAt) > 15000
        )
          throw new Error("Job 心跳过期，需核对进程");
        return this.store.update(
          {
            ...run,
            pid: status.pid,
            startedAt: status.startedAt,
            reason: null
          },
          "running"
        );
      }
      let current = this.store.update(
        {
          ...run,
          startedAt: status.startedAt,
          finishedAt: status.finishedAt,
          exitCode: status.exitCode,
          reason: status.reason
        },
        "collecting"
      );
      const artifacts = await this.collect(current, plan);
      let metrics: Record<string, number> = {};
      let reason = status.reason;
      try {
        metrics = await this.readMetrics(current, plan);
      } catch (error) {
        reason = reason ?? message(error);
      }
      const incomplete = artifacts.some((item) => item.status !== "present");
      if (incomplete) reason = reason ?? "存在缺件或被拒绝的产物";
      const state =
        status.state === "canceled"
          ? "canceled"
          : status.state === "completed" && !reason && !incomplete
            ? "succeeded"
            : "failed";
      current = this.store.update(
        { ...current, metrics, artifacts, reason },
        state,
        reason ?? "退出码、必需产物与数值指标均已验证"
      );
      this.changed(current);
      return current;
    } catch (error) {
      if (
        run.state === "preparing" &&
        Date.now() - Date.parse(run.createdAt) < 30000
      )
        return run;
      if (
        plan.proposal.backend === "local" &&
        run.state === "running" &&
        (error as NodeJS.ErrnoException).code === "ENOENT" &&
        Date.now() - Date.parse(run.createdAt) < 5000
      )
        return run;
      const detail = message(error);
      const result = this.store.update(
        { ...run, reason: detail },
        "unknown",
        run.reason === detail ? undefined : detail
      );
      if (run.state !== "unknown") this.changed(result);
      return result;
    }
  }
  async cancel(id: string): Promise<ManagedRun> {
    const run = this.requireRun(id);
    if (["succeeded", "failed", "canceled"].includes(run.state)) return run;
    const updated = this.store.update(
      { ...run, cancelRequested: true },
      run.state,
      "用户请求取消；等待 supervisor 确认"
    );
    await atomicWorkspaceWrite(
      this.root,
      `.research/jobs/${id}/cancel.json`,
      JSON.stringify({ runId: id, token: run.jobToken })
    );
    const plan = this.requirePlan(run.planId);
    if (plan.proposal.backend === "ssh")
      await this.cancelRemote(updated, plan).catch(() => undefined);
    return updated;
  }
  async detail(id: string): Promise<RunDetail> {
    return {
      run: await this.refresh(id),
      plan: this.requirePlan(this.requireRun(id).planId),
      events: this.store.events(id)
    };
  }
  async logs(
    id: string
  ): Promise<{ stdout: string; stderr: string; truncated: boolean }> {
    this.requireRun(id);
    const read = async (name: string) => {
      const path = await workspacePath(
        this.root,
        `.research/jobs/${id}/${name}.log`
      );
      try {
        const file = await open(path, "r");
        try {
          const info = await file.stat();
          const buffer = Buffer.alloc(Math.min(info.size, 64000));
          await file.read(
            buffer,
            0,
            buffer.length,
            Math.max(0, info.size - buffer.length)
          );
          return {
            text: redactSecrets(buffer.toString("utf8")),
            truncated: info.size > 64000
          };
        } finally {
          await file.close();
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          return { text: "", truncated: false };
        throw error;
      }
    };
    const [stdout, stderr] = await Promise.all([
      read("stdout"),
      read("stderr")
    ]);
    return {
      stdout: stdout.text,
      stderr: stderr.text,
      truncated: stdout.truncated || stderr.truncated
    };
  }
  overview(): LoopOverview {
    return {
      compass: this.store.compass(),
      plans: this.store.plans(),
      runs: this.store.runs(),
      claims: this.store.claims(),
      decisions: this.store.decisions()
    };
  }
  dismissPlan(id: string, reason: string): ManagedPlan {
    return this.store.dismiss(id, reason);
  }
  /** Agent archives describe verified runs; model-supplied numbers are never evidence. */
  async verifiedExperimentResult(
    experimentId: string,
    runId: string
  ): Promise<{
    metrics: string;
    seeds: number;
    seedResults: SeedResult[];
    artifacts: Array<{ path: string; kind: string }>;
  }> {
    const run = this.requireRun(runId);
    if (run.experimentId !== experimentId) throw new Error("运行不属于此实验");
    if (run.state !== "succeeded")
      throw new Error("只能归档产物核验成功的终态受管运行");
    if (
      this.store
        .runs()
        .some(
          (item) =>
            item.experimentId === experimentId &&
            !["succeeded", "failed", "canceled"].includes(item.state)
        )
    )
      throw new Error("实验仍有活动或未知运行，请先核对后归档");
    const plan = this.requirePlan(run.planId);
    const required = [
      ...new Set([
        plan.proposal.protocol.metricsPath,
        ...plan.proposal.protocol.requiredArtifacts
      ])
    ];
    for (const path of required) {
      const artifact = run.artifacts.find(
        (item) => item.path === path && item.status === "present"
      );
      if (!artifact?.sha256) throw new Error("受管运行缺少已核验的必需产物");
      await this.verifySource({
        runId,
        artifactPath: path,
        sha256: artifact.sha256,
        relation: "supports"
      });
    }
    const measurements = await this.readMeasurements(run, plan);
    const metric = plan.proposal.protocol.metric;
    return {
      metrics: JSON.stringify(this.measurementMetrics(plan, measurements)),
      seeds: plan.proposal.protocol.seeds.length,
      seedResults: [...measurements].map(([seed, value]) => ({
        seed,
        metrics: { [metric]: value }
      })),
      artifacts: required.map((path) => ({
        path: `.research/jobs/${run.id}/artifacts/${path}`,
        kind:
          path === plan.proposal.protocol.metricsPath
            ? "metrics"
            : "run-artifact"
      }))
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
    for (const source of input.sources) await this.verifySource(source);
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
    for (const source of claim.sources) await this.verifySource(source);
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
          await this.verifySource({
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
      for (const source of claim.sources) await this.verifySource(source);
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
  private async collect(
    run: ManagedRun,
    plan: ManagedPlan
  ): Promise<RunArtifact[]> {
    const artifacts: RunArtifact[] = [];
    let totalBytes = 0;
    for (const path of [
      ...new Set([
        plan.proposal.protocol.metricsPath,
        ...plan.proposal.protocol.requiredArtifacts
      ])
    ]) {
      try {
        const full = await workspacePath(
          this.root,
          `.research/jobs/${run.id}/source/${path}`
        );
        const info = await stat(full);
        if (
          !info.isFile() ||
          info.size > 128 * 1024 * 1024 ||
          totalBytes + info.size > 256 * 1024 * 1024
        )
          throw new Error(
            "非普通文件或超过单件 128 MiB / 总计 256 MiB 产物限额"
          );
        totalBytes += info.size;
        const bytes = await readFile(full);
        await atomicWorkspaceWrite(
          this.root,
          `.research/jobs/${run.id}/artifacts/${path}`,
          bytes
        );
        artifacts.push({
          path,
          size: bytes.length,
          sha256: hash(bytes),
          status: "present"
        });
      } catch (error) {
        artifacts.push({
          path,
          size: 0,
          sha256: null,
          status:
            (error as NodeJS.ErrnoException).code === "ENOENT"
              ? "missing"
              : "rejected",
          reason: message(error)
        });
      }
    }
    await atomicWorkspaceWrite(
      this.root,
      `.research/jobs/${run.id}/manifest.json`,
      JSON.stringify(
        { runId: run.id, planId: plan.id, revision: plan.revision, artifacts },
        null,
        2
      )
    );
    return artifacts;
  }
  private async readMetrics(
    run: ManagedRun,
    plan: ManagedPlan
  ): Promise<Record<string, number>> {
    const measurements = await this.readMeasurements(run, plan);
    return this.measurementMetrics(plan, measurements);
  }
  private measurementMetrics(
    plan: ManagedPlan,
    measurements: Map<number, number>
  ): Record<string, number> {
    const protocol = plan.proposal.protocol;
    const values = protocol.seeds.map((seed) => measurements.get(seed)!);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const sd =
      values.length > 1
        ? Math.sqrt(
            values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
              (values.length - 1)
          )
        : 0;
    return {
      [protocol.metric]: mean,
      [`${protocol.metric}.n`]: values.length,
      [`${protocol.metric}.sd`]: sd
    };
  }
  private async readMeasurements(
    run: ManagedRun,
    plan: ManagedPlan
  ): Promise<Map<number, number>> {
    const protocol = plan.proposal.protocol;
    const path = await workspacePath(
      this.root,
      `.research/jobs/${run.id}/artifacts/${protocol.metricsPath}`
    );
    if ((await stat(path)).size > 2 * 1024 * 1024)
      throw new Error("指标文件超过 2 MiB");
    const bytes = await readFile(path);
    const recorded = run.artifacts.find(
      (item) => item.path === protocol.metricsPath
    );
    if (
      recorded?.sha256 &&
      (bytes.length !== recorded.size || hash(bytes) !== recorded.sha256)
    )
      throw new Error("指标证据已被改变，不能归档");
    const text = bytes.toString("utf8");
    const raw: unknown = /\.csv$/i.test(path)
      ? parse(text, { columns: true, skip_empty_lines: true })
      : JSON.parse(text);
    const rows = Array.isArray(raw) ? raw : [raw];
    if (rows.length !== protocol.seeds.length)
      throw new Error("指标重复测量数量与冻结 seed 协议不符");
    const measurements = new Map<number, number>();
    for (const rawRow of rows) {
      const row = rawRow as Record<string, unknown>;
      if (!row || typeof row !== "object")
        throw new Error("指标必须是对象或逐 seed 对象数组");
      const value = row[protocol.metric];
      if (
        (typeof value !== "number" && typeof value !== "string") ||
        String(value).trim() === "" ||
        !Number.isFinite(Number(value))
      )
        throw new Error("指标缺失或不是有限数值");
      const seed = row.seed;
      if (
        (typeof seed !== "number" && typeof seed !== "string") ||
        (typeof seed === "string" && !/^-?\d+$/.test(seed.trim())) ||
        !Number.isSafeInteger(Number(seed)) ||
        !protocol.seeds.includes(Number(seed)) ||
        measurements.has(Number(seed))
      ) {
        throw new Error("指标 seed 缺失、重复或身份与协议不符");
      }
      measurements.set(Number(seed), Number(value));
    }
    return measurements;
  }
  private async verifySource(source: EvidenceSource): Promise<void> {
    const run = this.requireRun(source.runId);
    if (run.state !== "succeeded")
      throw new Error("结论来源必须是完整验证成功的运行");
    const artifact = run.artifacts.find(
      (item) => item.path === source.artifactPath && item.status === "present"
    );
    if (!artifact || artifact.sha256 !== source.sha256)
      throw new Error("证据来源或哈希不匹配");
    const path = await workspacePath(
      this.root,
      `.research/jobs/${run.id}/artifacts/${artifact.path}`
    );
    if (hash(await readFile(path)) !== source.sha256)
      throw new Error("原始证据已被改变，不能确认或导出");
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
  private async startRemote(
    run: ManagedRun,
    plan: ManagedPlan
  ): Promise<ManagedRun> {
    await this.remote.submit(run, plan);
    const result = this.store.update(
      run,
      "running",
      "SSH Job 已提交；远端 supervisor 独立运行"
    );
    this.changed(result);
    return result;
  }
  private async syncRemote(run: ManagedRun, plan: ManagedPlan): Promise<void> {
    await this.remote.sync(run, plan);
  }
  private async cancelRemote(
    run: ManagedRun,
    plan: ManagedPlan
  ): Promise<void> {
    await this.remote.cancel(run, plan);
  }
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
