import { readFile, stat } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import type {
  ManagedRun,
  ManagedPlan,
  RunArtifact,
  EvidenceSource,
  SeedResult
} from "@research-workbench/contracts";
import { RunStore } from "./run-store.js";
import { hash } from "./run-snapshot.js";
import { atomicWorkspaceWrite, workspacePath } from "./workspace.js";
export class RunArtifactsService {
  constructor(
    private readonly root: string,
    private readonly store: RunStore
  ) {}
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
  async collect(run: ManagedRun, plan: ManagedPlan): Promise<RunArtifact[]> {
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
  async readMetrics(
    run: ManagedRun,
    plan: ManagedPlan
  ): Promise<Record<string, number>> {
    const measurements = await this.readMeasurements(run, plan);
    return this.measurementMetrics(plan, measurements);
  }
  measurementMetrics(
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
  async readMeasurements(
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
  async verifySource(source: EvidenceSource): Promise<void> {
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
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}
