// Opt-in real-provider acceptance. Uses saved ciphertext only through Electron Main.
// Run in an approved desktop context after build + build:core; never prints credentials.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { _electron: electron } = require(
  process.env.RW_PLAYWRIGHT_MODULE || "playwright"
);
const root = process.cwd();
const output = resolve(
  process.env.RW_REAL_LOOP_OUTPUT ||
    "design/implementation/real-agent-loop-20261111"
);
const savedPath =
  process.env.RW_REAL_SETTINGS ||
  join(process.env.APPDATA, "@research-workbench", "desktop", "settings.json");
const git = process.env.RW_GIT_BINARY || "git";
await mkdir(output, { recursive: true });
await mkdir(join(root, ".tmp"), { recursive: true });
const task = process.env.RW_REAL_LOOP_SESSION
  ? resolve(process.env.RW_REAL_LOOP_SESSION)
  : await mkdtemp(join(root, ".tmp", "real-agent-loop-"));
if (
  !task.startsWith(join(root, ".tmp") + "/") &&
  !task.startsWith(join(root, ".tmp") + "\\")
)
  throw new Error("QA session must be inside repository .tmp");
const workspace = join(task, "workspace"),
  userData = join(task, "profile");
await mkdir(workspace, { recursive: true });
await mkdir(userData, { recursive: true });
const evidencePath = join(output, "report.json");
const checkpointPath = join(task, "checkpoint.json");
const evidence = await readFile(checkpointPath, "utf8")
  .then(JSON.parse)
  .catch(() => ({
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    fixture: "quadratic-gradient-descent-v1",
    session: relative(root, task).replaceAll("\\", "/"),
    stages: {},
    turns: [],
    humanActions: [],
    runs: [],
    errors: []
  }));
const save = async () => {
  await writeFile(checkpointPath, JSON.stringify(evidence, null, 2));
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const poll = async (check, label, timeout = 30000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(
    `${label} did not reach its required state before the deadline`
  );
};
const fixture = `// Fixed synthetic numerical fixture: change only learningRate for the variant.
const fs = require('node:fs');
const learningRate = 0.1;
const target = 3;
const steps = 10;
const seeds = [0, 1, 2];
const rows = seeds.map(seed => {
  const initialX = seed - 1;
  let x = initialX;
  for (let step = 0; step < steps; step++) x -= learningRate * 2 * (x - target);
  const final_loss = (x - target) ** 2;
  const analytic_loss = (initialX - target) ** 2 * (1 - 2 * learningRate) ** (2 * steps);
  if (Math.abs(final_loss - analytic_loss) > 1e-12) throw Error('recurrence mismatch');
  return { seed, initialX, finalX: x, final_loss, analytic_loss, learningRate, steps };
});
const summary = { objective: '(x-3)^2', learningRate, target, steps, seeds,
  mean_final_loss: rows.reduce((sum, row) => sum + row.final_loss, 0) / rows.length,
  max_analytic_error: Math.max(...rows.map(row => Math.abs(row.final_loss - row.analytic_loss))) };
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync('results/metrics.json', JSON.stringify(rows, null, 2));
fs.writeFileSync('results/summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
`;
const variant = fixture.replace(
  "const learningRate = 0.1;",
  "const learningRate = 0.2;"
);
const negative = fixture.replace(
  "const learningRate = 0.1;",
  "const learningRate = 1.1;"
);
const gitRun = (args) =>
  execFileSync(git, ["-C", workspace, ...args], {
    windowsHide: true,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
const commit = (message) => {
  gitRun(["add", "experiment.cjs", "AGENTS.md", ".gitignore"]);
  gitRun([
    "-c",
    "user.name=Human QA",
    "-c",
    "user.email=qa@example.invalid",
    "commit",
    "-qm",
    message
  ]);
  return gitRun(["rev-parse", "HEAD"]);
};
if (!evidence.stages.fixture) {
  execFileSync(git, ["init", workspace], {
    windowsHide: true,
    stdio: "ignore"
  });
  gitRun(["config", "core.autocrlf", "false"]);
  await writeFile(join(workspace, "experiment.cjs"), fixture);
  await writeFile(
    join(workspace, "AGENTS.md"),
    "Owned synthetic QA fixture. Keep experiment.cjs. Research compute uses request_run only. For the variant, change only learningRate from 0.1 to 0.2; retain all other source bytes. Never run or approve a plan yourself. Outputs are results/metrics.json and results/summary.json.\n"
  );
  await writeFile(
    join(workspace, ".gitignore"),
    ".research/\n.agent/\nresults/\n"
  );
  evidence.fixtureRevision = commit(
    "test(fixture): freeze quadratic optimization baseline"
  );
  evidence.stages.fixture = true;
  await save();
}
const stored = JSON.parse(await readFile(savedPath, "utf8"));
if (!stored.encryptedApiKey)
  throw new Error("Saved encrypted provider credential required");
// Windows safeStorage ciphertext depends on Chromium's DPAPI-wrapped OS crypt key.
// Copy only that encrypted envelope; never decrypt or serialize a plaintext key.
const localState = await readFile(
  join(dirname(savedPath), "Local State"),
  "utf8"
)
  .then(JSON.parse)
  .catch(() => ({}));
if (localState.os_crypt?.encrypted_key)
  await writeFile(
    join(userData, "Local State"),
    JSON.stringify({ os_crypt: localState.os_crypt })
  );
await writeFile(
  join(userData, "settings.json"),
  JSON.stringify({
    encryptedApiKey: stored.encryptedApiKey,
    provider: stored.provider,
    baseUrl: stored.baseUrl,
    model: stored.model,
    workspace,
    gitBinary: git,
    permissionLevel: "workspace-write",
    autoCommit: false
  })
);
evidence.provider = {
  provider: stored.provider,
  baseUrl: stored.baseUrl,
  model: stored.model,
  credential: "Main safeStorage saved ciphertext",
  productionBundledCore: true
};
const build = {
  architecture: "Core-owned schemas and workflow; generic runtime injection",
  coreSha256: sha256(
    await readFile(join(root, "apps/desktop/resources/core/cli.mjs"))
  ),
  mainSha256: sha256(
    await readFile(join(root, "apps/desktop/out/main/index.cjs"))
  )
};
if (evidence.build && JSON.stringify(evidence.build) !== JSON.stringify(build))
  throw new Error("Checkpoint build differs; start a fresh acceptance session");
evidence.build = build;
const bootstrap = join(task, "bootstrap.cjs");
await writeFile(
  bootstrap,
  `const {app}=require('electron');app.setPath('userData',${JSON.stringify(userData)});app.setAppPath(${JSON.stringify(join(root, "apps/desktop"))});require(${JSON.stringify(join(root, "apps/desktop/out/main/index.cjs"))});`
);
const env = { ...process.env, RW_CORE_BUNDLE: "1" };
for (const key of [
  "ELECTRON_RUN_AS_NODE",
  "RW_API_KEY",
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY"
])
  delete env[key];
let app, page;
const launch = async () => {
  app = await electron.launch({
    executablePath: join(
      root,
      "apps/desktop/node_modules/electron/dist/electron.exe"
    ),
    args: [bootstrap],
    cwd: join(root, "apps/desktop"),
    env,
    timeout: 30000
  });
  page = await app.firstWindow();
  page.on("pageerror", (error) => evidence.errors.push(error.message));
  await poll(
    () =>
      page.evaluate(async () => (await window.rw.status())?.state === "online"),
    "Core online"
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 900)
  );
  const settings = await page.evaluate(() => window.rw.getSettings());
  evidence.providerLoad = {
    hasApiKey: settings.hasApiKey,
    apiKeySource: settings.apiKeySource,
    model: settings.model,
    sameWorkspace: settings.workspace === workspace
  };
  if (
    !settings.hasApiKey ||
    settings.apiKeySource !== "saved" ||
    settings.model !== evidence.provider.model
  )
    throw new Error("Isolated Main did not load the saved provider");
  await page.evaluate(() => {
    window.__realQaEvents = [];
    window.rw.onEvent((event) => {
      const p = event.params;
      if (p.type.startsWith("agent."))
        window.__realQaEvents.push({
          type: p.type,
          toolName: p.payload?.toolName,
          isError: p.payload?.isError
        });
    });
  });
};
const rpc = (method, params) =>
  page.evaluate(({ method, params }) => window.rw.request(method, params), {
    method,
    params
  });
const state = () => rpc("loop.overview");
const screenshot = (name) =>
  page.screenshot({ path: join(output, `${name}.png`) });
const scope = { projectId: "project-demo", questionId: "Q-01", taskId: "T-02" };
const turn = async (name, prompt) => {
  console.log(JSON.stringify({ stage: name, status: "model-started" }));
  const start = Date.now();
  const eventOffset = await page.evaluate(() => window.__realQaEvents.length);
  const heartbeat = setInterval(
    () =>
      console.log(
        JSON.stringify({
          stage: name,
          status: "waiting-for-real-model",
          elapsedSeconds: Math.round((Date.now() - start) / 1000)
        })
      ),
    30000
  );
  let result;
  try {
    result = await rpc("agent.chat", { prompt, scope });
  } finally {
    clearInterval(heartbeat);
  }
  if (result.mode !== "deepseek" && result.mode !== "openai")
    throw new Error("Faux provider cannot satisfy real acceptance");
  const events = await page.evaluate(
    (offset) => window.__realQaEvents.slice(offset),
    eventOffset
  );
  const sessionEntries = (await readFile(result.sessionFile, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const messages = sessionEntries
    .map((entry) => entry.message)
    .filter((message) => message?.role === "assistant");
  const models = [
    ...new Set(messages.map((message) => message.model).filter(Boolean))
  ];
  if (!models.includes(evidence.provider.model))
    throw new Error(
      `Configured model absent from persisted session: ${models.join(",")}`
    );
  evidence.sessionFile = relative(workspace, result.sessionFile).replaceAll(
    "\\",
    "/"
  );
  evidence.turns.push({
    name,
    elapsedSeconds: Math.round((Date.now() - start) / 1000),
    mode: result.mode,
    models,
    tools: events.filter((event) => event.type === "agent.tool-end"),
    text: result.text
  });
  await save();
  console.log(
    JSON.stringify({
      stage: name,
      status: "model-completed",
      tools: events
        .filter((event) => event.type === "agent.tool-end")
        .map((event) => event.toolName)
    })
  );
};
const protocol = {
  name: "quadratic-gd-v1",
  metric: "final_loss",
  direction: "minimize",
  unit: "squared-error",
  dataset: "synthetic-quadratic-v1",
  environment: "Node / Windows / CPU / no dependencies",
  seeds: [0, 1, 2],
  metricsPath: "results/metrics.json",
  requiredArtifacts: ["results/summary.json"]
};
const proposalInstructions = `Use command exactly "node experiment.cjs", backend local, timeoutSeconds 30, inputs [], protocol exactly ${JSON.stringify(protocol)}. Stop after request_run; I will review and approve separately. No run_command.`;
const approveAndVerify = async (label, expectedSource, baselineRunId, lr) => {
  const before = await state();
  const plan = before.plans.find((plan) => !plan.approvedAt && !plan.closure);
  if (
    !plan ||
    plan.proposal.command !== "node experiment.cjs" ||
    JSON.stringify(plan.proposal.protocol) !== JSON.stringify(protocol) ||
    plan.proposal.timeoutSeconds !== 30 ||
    plan.proposal.backend !== "local" ||
    plan.proposal.inputs.length
  )
    throw new Error("Human QA rejected unexpected concrete proposal");
  if (baselineRunId && plan.proposal.baselineRunId !== baselineRunId)
    throw new Error("Variant omitted baseline identity");
  const source = await readFile(
    join(workspace, ".research/plans", plan.id, "source/experiment.cjs"),
    "utf8"
  );
  if (source !== expectedSource)
    throw new Error("Human QA rejected frozen source mismatch");
  if (before.runs.some((run) => run.planId === plan.id))
    throw new Error("Model launched without human approval");
  evidence.humanActions.push({
    at: new Date().toISOString(),
    actor: "human-qa",
    action: "review-frozen-plan",
    planId: plan.id,
    digest: plan.digest,
    revision: plan.revision,
    sourceSha256: sha256(source),
    protocolVerified: true
  });
  await screenshot(`${label}-pending-review`);
  await page.getByRole("tab", { name: "对话", exact: true }).click();
  await page
    .getByRole("button", { name: "审阅方案", exact: true })
    .last()
    .click();
  await screenshot(`${label}-frozen-plan`);
  await page.getByRole("button", { name: "批准并运行", exact: true }).click();
  evidence.humanActions.push({
    at: new Date().toISOString(),
    actor: "human-qa",
    action: "click-approved-and-run",
    planId: plan.id,
    digest: plan.digest
  });
  const deadline = Date.now() + 60000;
  let run;
  while (Date.now() < deadline) {
    run = (await state()).runs.find((run) => run.planId === plan.id);
    if (
      run &&
      ["succeeded", "failed", "canceled", "unknown"].includes(run.state)
    )
      break;
    await new Promise((done) => setTimeout(done, 500));
  }
  if (
    run?.state !== "succeeded" ||
    run.exitCode !== 0 ||
    run.artifacts.some((artifact) => artifact.status !== "present")
  )
    throw new Error(
      `Managed computation failed: ${run?.state} ${run?.reason || ""}`
    );
  const artifacts = [];
  for (const artifact of run.artifacts) {
    const bytes = await readFile(
      join(workspace, ".research/jobs", run.id, "artifacts", artifact.path)
    );
    if (sha256(bytes) !== artifact.sha256)
      throw new Error("Archived artifact hash mismatch");
    artifacts.push({ ...artifact, data: JSON.parse(bytes.toString("utf8")) });
  }
  const rows = artifacts.find(
    (artifact) => artifact.path === "results/metrics.json"
  ).data;
  for (const row of rows) {
    const expected = (row.seed - 1 - 3) ** 2 * (1 - 2 * lr) ** 20;
    if (
      Math.abs(row.final_loss - expected) > 1e-12 ||
      row.learningRate !== lr ||
      row.steps !== 10
    )
      throw new Error("Independent analytical recurrence verification failed");
  }
  const { jobToken: _jobToken, ...publicRun } = run;
  evidence.runs.push({
    label,
    ...publicRun,
    plan: {
      id: plan.id,
      revision: plan.revision,
      digest: plan.digest,
      codeHash: plan.codeHash,
      comparableGroup: plan.comparableGroup,
      proposal: plan.proposal
    },
    artifacts
  });
  await save();
  return run;
};

try {
  await launch();
  if (!evidence.stages.baselinePlan) {
    await turn(
      "baseline-plan",
      `Read AGENTS.md and experiment.cjs using tools, and inspect research_state. Prepare an experiment titled "Quadratic GD baseline lr=0.1" for this fixed synthetic optimization: loss (x-3)^2, ten steps, seeds 0/1/2. State scope limitations. ${proposalInstructions}`
    );
    evidence.stages.baselinePlan = true;
    await save();
  }
  if (!evidence.stages.baselineRun) {
    const run = await approveAndVerify("baseline", fixture, undefined, 0.1);
    evidence.baselineId = run.id;
    evidence.stages.baselineRun = true;
    await save();
  }
  if (!evidence.stages.baselineArchive) {
    await turn(
      "baseline-archive",
      `The human approved and launched baseline ${evidence.baselineId}. Use research_state, read its two verified artifacts under .research/jobs/${evidence.baselineId}/artifacts/results/ with read_file. Archive its experiment via finish_experiment with the matching experimentId and runId only, plus an optional bounded conclusion. Core MUST derive metrics, seeds and artifact references from the verified run; NEVER supply those fields yourself. Do not create a new plan or claim yet. Reply briefly.`
    );
    const run = (await state()).runs.find(
      (run) => run.id === evidence.baselineId
    );
    const record = await rpc("experiments.get", { id: run.experimentId });
    if (record.status !== "archived" || record.seedResults.length !== 3)
      throw new Error("Baseline archive incomplete");
    evidence.stages.baselineArchive = true;
    await save();
  }
  if (!evidence.stages.variantCommit) {
    await turn(
      "single-variable-edit",
      "Read experiment.cjs, then use write_file to change only the exact line const learningRate = 0.1; to const learningRate = 0.2;. Preserve every other byte. Do not execute, commit, create an experiment or request_run yet; the human will inspect and commit this single-variable change. Reply briefly."
    );
    if ((await readFile(join(workspace, "experiment.cjs"), "utf8")) !== variant)
      throw new Error("Single-variable source change exceeded authorization");
    evidence.singleVariableDiff = gitRun(["diff", "--", "experiment.cjs"]);
    evidence.variantRevision = commit(
      "test(fixture): change only gradient descent learning rate"
    );
    evidence.humanActions.push({
      at: new Date().toISOString(),
      actor: "human-qa",
      action: "review-and-commit-single-variable-diff",
      revision: evidence.variantRevision
    });
    evidence.stages.variantCommit = true;
    await save();
  }
  if (!evidence.stages.variantPlan) {
    await turn(
      "variant-plan",
      `The human inspected and committed the single learningRate change to 0.2. Read experiment.cjs and research_state, create a separate experiment titled "Quadratic GD variant lr=0.2". Match baseline protocol and command, set baselineRunId exactly "${evidence.baselineId}". ${proposalInstructions}`
    );
    evidence.stages.variantPlan = true;
    await save();
  }
  if (!evidence.stages.variantRun) {
    const run = await approveAndVerify(
      "variant",
      variant,
      evidence.baselineId,
      0.2
    );
    evidence.variantId = run.id;
    evidence.stages.variantRun = true;
    await save();
  }
  if (!evidence.stages.claim) {
    evidence.comparison = await rpc("runs.compare", {
      leftId: evidence.baselineId,
      rightId: evidence.variantId
    });
    if (!evidence.comparison.comparable)
      throw new Error("Controlled runs were not comparable");
    const baselineMean = evidence.runs.find((run) => run.label === "baseline")
      .metrics.final_loss;
    const variantMean = evidence.runs.find((run) => run.label === "variant")
      .metrics.final_loss;
    evidence.numericalAudit = {
      baselineMean,
      variantMean,
      delta: variantMean - baselineMean,
      ratio: variantMean / baselineMean,
      analyticRatio: (0.6 / 0.8) ** 20,
      sourceRunIds: [evidence.baselineId, evidence.variantId],
      tool: "scripts/verify-real-agent-loop.mjs",
      tolerance: 1e-12
    };
    if (
      Math.abs(
        evidence.numericalAudit.ratio - evidence.numericalAudit.analyticRatio
      ) > 1e-12
    )
      throw new Error("Independent comparison formula mismatch");
    await mkdir(join(workspace, "analysis"), { recursive: true });
    await writeFile(
      join(workspace, "analysis/comparison.json"),
      JSON.stringify(evidence.numericalAudit, null, 2)
    );
    await turn(
      "variant-archive-and-claim",
      `Use research_state and read_file on both runs' archived results/metrics.json and results/summary.json beneath .research/jobs/<runId>/artifacts/. Baseline ${evidence.baselineId}; variant ${evidence.variantId}. Also read analysis/comparison.json: its means, delta, ratio and analytical ratio were computed by the reproducible QA script from those archived metrics. Use only tool-produced numeric values, with no new mental arithmetic or derived numeric estimates. Archive the variant experiment via finish_experiment using its matching experimentId and runId; Core MUST derive all metrics, seeds and artifact references. Then propose_claim comparing final_loss for lr=0.1 and lr=0.2. You MUST provide exactly FOUR source references: results/metrics.json AND results/summary.json from EACH of the two runIds, with their exact sha256 from research_state. Per-seed statements require the metrics.json references; means require summary.json. Each source supports the entire comparison, so use relation supports for all four references. Limit the claim to this deterministic quadratic fixture, fixed initial points and ten steps; do not claim statistical independence, generalization or universal optimality. Do not discuss numerical stability intervals or bounds; they were not part of the measured question. Never confirm the claim or create a human decision. Reply briefly.`
    );
    let after = await state();
    const requiredSources = evidence.runs.flatMap((run) =>
      run.artifacts.map((artifact) => ({
        runId: run.id,
        artifactPath: artifact.path,
        sha256: artifact.sha256
      }))
    );
    const hasCompleteSources = (candidate) =>
      candidate.status === "proposed" &&
      candidate.sources.length === requiredSources.length &&
      requiredSources.every((expected) =>
        candidate.sources.some(
          (source) =>
            source.runId === expected.runId &&
            source.artifactPath === expected.artifactPath &&
            source.sha256 === expected.sha256
        )
      );
    let claim = after.claims.find(hasCompleteSources);
    if (!claim) {
      if (
        after.claims.some((item) => item.confirmedAt) ||
        after.decisions.length
      )
        throw new Error("Model crossed the human evidence approval boundary");
      const incompleteIds = after.claims.map((item) => item.id);
      await turn(
        "claim-source-repair",
        `The existing candidate has incomplete source coverage and remains UNCONFIRMED. Do not rerun computation, delete or confirm that candidate. Use research_state and the verified artifacts if needed. Propose exactly ONE replacement candidate with exactly these FOUR sources and exact hashes: ${JSON.stringify(requiredSources)}. Both metrics.json files support per-seed values; both summary.json files support means. All four relations MUST be supports. Preserve the same fixed-fixture scope and limitations, and only use already tool-produced numeric values. NEVER confirm claims or create human decisions.`
      );
      after = await state();
      claim = after.claims.find(hasCompleteSources);
      if (
        after.claims.length !== incompleteIds.length + 1 ||
        incompleteIds.some(
          (id) =>
            after.claims.find((item) => item.id === id)?.status !== "proposed"
        )
      )
        throw new Error("Incomplete candidate was not retained unconfirmed");
      evidence.unconfirmedIncompleteClaimIds = incompleteIds;
      evidence.claimSourceRepair = true;
    }
    if (
      !claim ||
      !claim.limitations.trim() ||
      claim.confirmedAt ||
      after.decisions.length ||
      claim.sources.some((source) => source.relation !== "supports")
    )
      throw new Error("Real model evidence claim or approval boundary failed");
    evidence.claimId = claim.id;
    evidence.claimBeforeHumanConfirmation = claim;
    await page.getByRole("tab", { name: "研究罗盘", exact: true }).click();
    await screenshot("candidate-claim");
    await page
      .locator(".evidence-entry")
      .filter({ hasText: claim.statement })
      .getByRole("button", { name: "核验证据并确认", exact: true })
      .click();
    await poll(
      async () =>
        (await state()).claims.find((item) => item.id === claim.id)?.status ===
        "confirmed",
      "Human claim confirmation"
    );
    evidence.humanActions.push({
      at: new Date().toISOString(),
      actor: "human-qa",
      action: "verify-artifact-hashes-and-confirm-claim",
      claimId: claim.id
    });
    const reason =
      "Both runs are reproducible and the only source change is learningRate 0.1 → 0.2. The smaller loss applies to this fixture only; next evaluate a broader objective before generalization.";
    await page.getByRole("button", { name: "记录决策", exact: true }).click();
    await page.getByLabel("依据与理由", { exact: true }).fill(reason);
    await page
      .locator(".decision-form .loop-choices button")
      .filter({ hasText: claim.statement })
      .click();
    await page.getByRole("button", { name: "保存决策", exact: true }).click();
    const decision = await poll(
      async () =>
        (await state()).decisions.find(
          (item) => item.reason === reason && item.claimIds.includes(claim.id)
        ),
      "Human research decision"
    );
    evidence.decisionId = decision.id;
    evidence.humanActions.push({
      at: new Date().toISOString(),
      actor: "human-qa",
      action: "record-research-decision",
      decisionId: decision.id
    });
    evidence.stages.claim = true;
    await save();
  }
  if (!evidence.stages.negativeCommit) {
    const currentSource = await readFile(
      join(workspace, "experiment.cjs"),
      "utf8"
    );
    if (currentSource !== variant)
      throw new Error(
        "Human QA refused unexpected source before negative control"
      );
    await writeFile(join(workspace, "experiment.cjs"), negative);
    evidence.negativeSingleVariableDiff = gitRun([
      "diff",
      "--",
      "experiment.cjs"
    ]);
    if (
      negative.replace(
        "const learningRate = 1.1;",
        "const learningRate = 0.1;"
      ) !== fixture
    )
      throw new Error("Negative control changed more than learningRate");
    evidence.negativeRevision = commit(
      "test(fixture): preserve adverse learning-rate outcome"
    );
    evidence.humanActions.push({
      at: new Date().toISOString(),
      actor: "human-qa",
      action: "author-review-and-commit-negative-single-variable-diff",
      learningRate: 1.1,
      revision: evidence.negativeRevision,
      modelProposed: false
    });
    evidence.stages.negativeCommit = true;
    evidence.stages.recovery = false;
    await save();
  }
  if (!evidence.stages.negativePlan) {
    const experiment = await rpc("experiments.propose", {
      title: "Quadratic GD adverse result lr=1.1 (human QA proposed)",
      goal: "Retain a scientifically worse result under the same fixed protocol.",
      hypothesis:
        "This single learning-rate change may yield a larger measured final_loss.",
      design:
        "Human QA authored the lr=1.1 arm; same fixed initial points, ten steps, command, artifacts and environment as baseline. Model only verifies and archives after human approval.",
      metrics:
        "final_loss; minimize; retain all three fixed initial-point outcomes",
      seeds: 3,
      scope
    });
    const plan = await rpc("runs.propose", {
      experimentId: experiment.id,
      command: "node experiment.cjs",
      backend: "local",
      timeoutSeconds: 30,
      inputs: [],
      baselineRunId: evidence.baselineId,
      protocol
    });
    evidence.negativeExperimentId = experiment.id;
    evidence.humanActions.push({
      at: new Date().toISOString(),
      actor: "human-qa",
      action: "propose-negative-experiment-and-frozen-plan",
      experimentId: experiment.id,
      planId: plan.id,
      digest: plan.digest,
      modelProposed: false
    });
    evidence.stages.negativePlan = true;
    await save();
  }
  if (!evidence.stages.negativeRun) {
    // Human RPC proposal has no agent transcript card; reload the persistent review strip.
    await page.reload();
    await poll(
      () =>
        page.evaluate(
          async () => (await window.rw.status())?.state === "online"
        ),
      "Core online after human proposal"
    );
    await page.evaluate(() => {
      window.__realQaEvents = [];
      window.rw.onEvent((event) => {
        const p = event.params;
        if (p.type.startsWith("agent."))
          window.__realQaEvents.push({
            type: p.type,
            toolName: p.payload?.toolName,
            isError: p.payload?.isError
          });
      });
    });
    const run = await approveAndVerify(
      "negative",
      negative,
      evidence.baselineId,
      1.1
    );
    evidence.negativeId = run.id;
    evidence.negativeComparison = await rpc("runs.compare", {
      leftId: evidence.baselineId,
      rightId: run.id
    });
    if (
      !evidence.negativeComparison.comparable ||
      evidence.negativeComparison.better !== false ||
      !(evidence.negativeComparison.delta > 0)
    )
      throw new Error(
        "Negative result was not a comparable, scientifically worse succeeded run"
      );
    evidence.negativeNumericalAudit = {
      baselineMean: evidence.runs.find((item) => item.label === "baseline")
        .metrics.final_loss,
      negativeMean: run.metrics.final_loss,
      delta: evidence.negativeComparison.delta,
      sourceRunIds: [evidence.baselineId, run.id],
      tool: "scripts/verify-real-agent-loop.mjs",
      sameProtocol: true,
      scientificAdverseResult: true,
      executionState: run.state,
      modelProposed: false
    };
    await writeFile(
      join(workspace, "analysis/negative-comparison.json"),
      JSON.stringify(evidence.negativeNumericalAudit, null, 2)
    );
    evidence.stages.negativeRun = true;
    await save();
  }
  if (!evidence.stages.negativeArchive) {
    const before = await state();
    if (
      before.claims.filter((item) => item.status === "confirmed").length !==
        1 ||
      before.decisions.length !== 1
    )
      throw new Error(
        "Unexpected evidence state before negative-result archive"
      );
    await turn(
      "human-proposed-negative-archive",
      `Human QA authored, committed, proposed, reviewed and approved the lr=1.1 arm ${evidence.negativeId}; YOU did not propose it. This is a succeeded execution with a scientifically worse measured loss. Use research_state, read both verified artifacts under .research/jobs/${evidence.negativeId}/artifacts/results/, and read analysis/negative-comparison.json. That comparison was computed by the QA script; use only its tool-produced values. Archive experiment ${evidence.negativeExperimentId} using finish_experiment with experimentId and runId ${evidence.negativeId}; Core MUST derive all metrics, seeds and artifact references. Optionally retain a bounded negative curation fact. NEVER create, confirm or modify a claim or human decision; preserve the existing lr=0.1 versus lr=0.2 claim. NEVER create a plan or rerun. Report only the observed worse outcome under this fixture's fixed protocol, with no mental arithmetic or untested bounds. Reply briefly.`
    );
    const after = await state();
    if (
      JSON.stringify(before.claims) !== JSON.stringify(after.claims) ||
      JSON.stringify(before.decisions) !== JSON.stringify(after.decisions) ||
      after.runs.length !== 3 ||
      after.runs.find((run) => run.id === evidence.negativeId)?.state !==
        "succeeded"
    )
      throw new Error(
        "Negative result changed evidence decisions or was not retained"
      );
    const record = await rpc("experiments.get", {
      id: evidence.negativeExperimentId
    });
    if (record.status !== "archived" || record.seedResults.length !== 3)
      throw new Error("Negative result archive incomplete");
    evidence.negativeArchive = {
      experimentId: record.id,
      runId: evidence.negativeId,
      status: record.status,
      conclusion: record.conclusion,
      seedResults: record.seedResults,
      preservedWithoutNewClaim: true
    };
    evidence.stages.negativeArchive = true;
    await save();
  }
  if (process.env.RW_REAL_LOOP_RECHECK === "1")
    evidence.stages.recovery = false;
  if (!evidence.stages.recovery) {
    const before = await state();
    if (
      before.runs.length !== 3 ||
      before.runs.some((run) => run.state !== "succeeded")
    )
      throw new Error("All three succeeded runs are required before recovery");
    await app.close();
    app = undefined;
    await launch();
    const after = await state();
    for (const field of ["plans", "runs", "claims", "decisions"])
      if (JSON.stringify(before[field]) !== JSON.stringify(after[field]))
        throw new Error(`Restart changed structured ${field}`);
    await rpc("agent.restoreSession", {
      sessionFile: join(workspace, evidence.sessionFile)
    });
    evidence.recovery = {
      fullElectronAndCoreRestart: true,
      exactStructuredState: true,
      sessionRestored: true,
      runCount: after.runs.length,
      confirmedClaim:
        after.claims.find((claim) => claim.id === evidence.claimId)?.status ===
        "confirmed",
      decisionRestored: after.decisions.some(
        (decision) => decision.id === evidence.decisionId
      )
    };
    await page.getByRole("tab", { name: "研究罗盘", exact: true }).click();
    await screenshot("recovered-research-compass");
    evidence.export = await rpc("loop.export");
    evidence.stages.recovery = true;
  }
  for (const observed of evidence.runs) {
    const record = await rpc("experiments.get", { id: observed.experimentId });
    const rows = observed.artifacts.find(
      (artifact) => artifact.path === "results/metrics.json"
    ).data;
    if (
      record.status !== "archived" ||
      record.seedResults.length !== rows.length
    )
      throw new Error("Managed experiment archive incomplete");
    for (const row of rows) {
      const archived = record.seedResults.find(
        (result) => Number(result.seed) === row.seed
      );
      if (
        !archived ||
        Math.abs(Number(archived.metrics.final_loss) - row.final_loss) > 1e-12
      )
        throw new Error("Archive differs from observed numeric artifact");
    }
  }
  const finalState = await state();
  const experimentRecords = await rpc("experiments.list");
  evidence.executionAudit = {
    verifiedAt: new Date().toISOString(),
    experimentCount: experimentRecords.length,
    runCount: finalState.runs.length,
    exactExpectedExperiments:
      experimentRecords.length === 3 &&
      experimentRecords.every(
        (record) =>
          record.status === "archived" &&
          evidence.runs.some((run) => run.experimentId === record.id)
      ),
    exactExpectedRuns:
      finalState.runs.length === 3 &&
      finalState.runs.every(
        (run) =>
          run.state === "succeeded" &&
          evidence.runs.some((observed) => observed.id === run.id)
      ),
    fourVerifiedClaimSources:
      finalState.claims.find((claim) => claim.id === evidence.claimId)?.sources
        .length === 4,
    confirmedClaimAndHumanDecision:
      finalState.claims.filter((claim) => claim.status === "confirmed")
        .length === 1 &&
      finalState.claims.find((claim) => claim.id === evidence.claimId)
        ?.status === "confirmed" &&
      finalState.decisions.length === 1 &&
      finalState.decisions[0].id === evidence.decisionId
  };
  if (
    !evidence.executionAudit.exactExpectedExperiments ||
    !evidence.executionAudit.exactExpectedRuns ||
    !evidence.executionAudit.fourVerifiedClaimSources ||
    !evidence.executionAudit.confirmedClaimAndHumanDecision
  )
    throw new Error(
      "Final audit found extra records, incomplete evidence or missing human decisions"
    );
  evidence.workflowCompletedAt ??=
    evidence.completedAt || new Date().toISOString();
  evidence.completedAt = new Date().toISOString();
  delete evidence.failure;
  evidence.toolErrors = evidence.turns.flatMap((item) =>
    item.tools
      .filter((event) => event.isError)
      .map((event) => ({
        turn: item.name,
        toolName: event.toolName
      }))
  );
  // A narrowly proven SDK schema rejection may recover without executing its callback.
  // Execution failures, other argument errors and unmatched retries remain failures.
  const sessionDirectory = dirname(join(workspace, evidence.sessionFile));
  const sessionMessages = (
    await Promise.all(
      (await readdir(sessionDirectory))
        .filter((name) => name.endsWith(".jsonl"))
        .map(async (name) =>
          (await readFile(join(sessionDirectory, name), "utf8"))
            .trim()
            .split(/\r?\n/)
            .map(JSON.parse)
            .map((entry) => entry.message)
            .filter(Boolean)
        )
    )
  ).flat();
  const failedResults = sessionMessages.filter(
    (message) => message.role === "toolResult" && message.isError
  );
  evidence.recoveredSchemaRejections = [];
  if (
    evidence.toolErrors.length === 1 &&
    evidence.toolErrors[0].turn === "variant-plan" &&
    evidence.toolErrors[0].toolName === "create_experiment" &&
    failedResults.length === 1
  ) {
    const failed = failedResults[0];
    const failedIndex = sessionMessages.indexOf(failed);
    const allCalls = sessionMessages.flatMap(
      (message) => message.content ?? []
    );
    const rejected = allCalls.find(
      (item) => item.type === "toolCall" && item.id === failed.toolCallId
    );
    const corrected = sessionMessages
      .slice(failedIndex + 1)
      .flatMap((message) => message.content ?? [])
      .find((item) => item.type === "toolCall");
    const accepted = sessionMessages.find(
      (message) =>
        message.role === "toolResult" && message.toolCallId === corrected?.id
    );
    const errorText =
      failed.content?.map((item) => item.text ?? "").join("\n") ?? "";
    const variantRun = evidence.runs.find((run) => run.label === "variant");
    const unchangedIntent =
      rejected?.arguments &&
      corrected?.arguments &&
      typeof rejected.arguments.hypotheses === "string" &&
      !Object.hasOwn(rejected.arguments, "hypothesis") &&
      typeof corrected.arguments.hypothesis === "string" &&
      !Object.hasOwn(corrected.arguments, "hypotheses") &&
      Object.keys(rejected.arguments)
        .filter((key) => key !== "hypotheses")
        .every(
          (key) =>
            JSON.stringify(rejected.arguments[key]) ===
            JSON.stringify(corrected.arguments[key])
        ) &&
      Object.keys(rejected.arguments).length ===
        Object.keys(corrected.arguments).length;
    if (
      failed.toolName === "create_experiment" &&
      rejected?.name === "create_experiment" &&
      corrected?.name === "create_experiment" &&
      errorText.startsWith('Validation failed for tool "create_experiment":') &&
      errorText.includes(
        "hypothesis: must have required properties hypothesis"
      ) &&
      unchangedIntent &&
      accepted &&
      !accepted.isError &&
      accepted.details?.experimentId === variantRun.experimentId &&
      experimentRecords.find((record) => record.id === variantRun.experimentId)
        ?.title === corrected.arguments.title
    )
      evidence.recoveredSchemaRejections.push({
        turn: "variant-plan",
        toolName: "create_experiment",
        rejectedToolCallId: rejected.id,
        correctedToolCallId: corrected.id,
        reason:
          "Required hypothesis was misspelled hypotheses; SDK rejected before callback execution",
        unchangedTitleGoalDesignMetricsSeeds: true,
        successfulExperimentId: accepted.details.experimentId,
        noExtraExperimentOrRun: true
      });
  }
  evidence.unrecoveredToolErrors =
    evidence.toolErrors.length === evidence.recoveredSchemaRejections.length &&
    failedResults.length === evidence.toolErrors.length
      ? []
      : evidence.toolErrors;
  evidence.pass =
    Object.values(evidence.stages).every(Boolean) &&
    !evidence.errors.length &&
    !evidence.unrecoveredToolErrors.length &&
    failedResults.length === evidence.toolErrors.length;
  await save();
  console.log(
    JSON.stringify({
      pass: evidence.pass,
      report: relative(root, evidencePath),
      session: evidence.session,
      model: evidence.provider.model,
      stages: evidence.stages
    })
  );
  if (!evidence.pass)
    throw new Error("Acceptance failed; inspect sanitized report");
} catch (error) {
  evidence.failure = { at: new Date().toISOString(), message: error.message };
  await save();
  if (page) await screenshot("failure").catch(() => {});
  console.error(
    JSON.stringify({
      pass: false,
      stage: evidence.stages,
      message: error.message,
      session: evidence.session
    })
  );
  process.exitCode = 1;
} finally {
  if (app) await app.close();
}
