import { RunArtifactsService } from "./run-artifacts.js";
import { RunEvidenceService } from "./run-evidence.js";
import { randomUUID } from "node:crypto";
import { chmod, open, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  RunProposalSchema,
  type ManagedPlan,
  type ManagedRun,
  type LoopOverview,
  type RunDetail
} from "@research-workbench/contracts";
import type { ExperimentStore } from "./experiment-store.js";

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
  private readonly artifacts: RunArtifactsService;
  private readonly evidence: RunEvidenceService;
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
    this.artifacts = new RunArtifactsService(root, store);
    this.evidence = new RunEvidenceService(
      root,
      store,
      permissions,
      this.artifacts
    );
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
      const artifacts = await this.artifacts.collect(current, plan);
      let metrics: Record<string, number> = {};
      let reason = status.reason;
      try {
        metrics = await this.artifacts.readMetrics(current, plan);
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
    return this.evidence.overview();
  }
  dismissPlan(id: string, reason: string): ManagedPlan {
    return this.store.dismiss(id, reason);
  }
  verifiedExperimentResult(experimentId: string, runId: string) {
    return this.artifacts.verifiedExperimentResult(experimentId, runId);
  }
  updateCompass(raw: unknown) {
    return this.evidence.updateCompass(raw);
  }
  proposeClaim(raw: unknown, actor: "human" | "agent" = "human") {
    return this.evidence.proposeClaim(raw, actor);
  }
  confirmClaim(id: string) {
    return this.evidence.confirmClaim(id);
  }
  recordDecision(raw: unknown) {
    return this.evidence.recordDecision(raw);
  }
  compare(leftId: string, rightId: string) {
    return this.evidence.compare(leftId, rightId);
  }
  exportReport() {
    return this.evidence.exportReport();
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
