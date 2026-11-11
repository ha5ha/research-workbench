// Opt-in, owner-authorized maintenance acceptance against the existing research host.
// Credentials cross a private anonymous pipe and the native password field only.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  copyFile,
  readdir
} from "node:fs/promises";
import { join, resolve, sep } from "node:path";

if (process.env.RW_REAL_VALIDATION_AUTHORIZED !== "1")
  throw new Error(
    "Explicit owner-authorized maintenance acceptance is required"
  );
const researchRoot = resolve(process.env.RW_QA_RESEARCH_ROOT || "");
if (!process.env.RW_QA_RESEARCH_ROOT)
  throw new Error("Research project root required");
const remotePython = process.env.RW_QA_REMOTE_PYTHON;
const remoteBaseRoot = process.env.RW_QA_REMOTE_ROOT;
if (!remotePython?.startsWith("/") || !remoteBaseRoot?.startsWith("/"))
  throw new Error(
    "RW_QA_REMOTE_PYTHON and RW_QA_REMOTE_ROOT must name owner-authorized absolute remote paths"
  );
if (remoteBaseRoot.replace(/\/+$/, "") === "")
  throw new Error("Remote validation root cannot be the filesystem root");
const root = process.cwd();
const require = createRequire(import.meta.url);
const { _electron: electron } = require(
  process.env.RW_PLAYWRIGHT_MODULE || "playwright"
);
const git = process.env.RW_GIT_BINARY || "git";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(predicate, message) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await wait(100);
  }
  throw new Error(message);
}
const output = resolve("design/implementation/native-ssh-20261111");
await mkdir(output, { recursive: true });
const task = await mkdtemp(join(root, ".tmp", "native-real-"));
const workspace = join(task, "workspace"),
  userData = join(task, "profile");
await mkdir(join(workspace, "input"), { recursive: true });
await mkdir(userData);

// Use the original accepted inputs, whose evidence-index verification is recorded
// by the previous maintenance acceptance; rehash against the live source again.
const previous = (
  await readFile(join(root, ".tmp/real-validation/latest-session.txt"), "utf8")
).trim();
const previousRecord = JSON.parse(
  await readFile(join(previous, "session.json"), "utf8")
);
const provenance = JSON.parse(
  await readFile(join(previousRecord.root, "input/provenance.json"), "utf8")
);
for (const input of provenance.inputs) {
  const source = resolve(researchRoot, input.path);
  assert(
    source.startsWith(researchRoot + sep),
    "Source escaped authorized project"
  );
  const bytes = await readFile(source);
  assert.equal(sha(bytes), input.sha256, "Accepted input changed");
  await writeFile(
    join(workspace, "input", source.split(/[\\/]/).at(-1)),
    bytes
  );
}
await writeFile(
  join(workspace, "input/provenance.json"),
  JSON.stringify(provenance, null, 2)
);
await copyFile(
  join(root, ".tmp/real-validation/recompute.py"),
  join(workspace, "recompute.py")
);
await writeFile(
  join(workspace, ".gitignore"),
  "input/\n.research/\nresults/\n"
);
for (const args of [
  ["init", "-q", workspace],
  ["-C", workspace, "add", "recompute.py", ".gitignore"],
  [
    "-C",
    workspace,
    "-c",
    "user.name=Workbench acceptance",
    "-c",
    "user.email=acceptance@example.invalid",
    "commit",
    "-qm",
    "test: native SSH maintenance recheck"
  ]
])
  execFileSync(git, args, { windowsHide: true, stdio: "pipe" });
execFileSync("python", ["recompute.py"], {
  cwd: workspace,
  windowsHide: true,
  stdio: "pipe"
});
const localResult = JSON.parse(
  await readFile(join(workspace, "results/recheck.json"), "utf8")
);
await writeFile(
  join(userData, "settings.json"),
  JSON.stringify({
    workspace,
    gitBinary: git,
    permissionLevel: "workspace-write"
  })
);

// This helper contains no secret values, writes no credentials, and never logs.
const helper = join(task, "owner-credential-pipe.py");
await writeFile(
  helper,
  `import base64,hashlib,json,sys\nfrom pathlib import Path\nsys.dont_write_bytecode=True\nsys.path.insert(0,sys.argv[1])\nfrom scripts.research.remote_connection import load_environment,decrypt_user_secret\nimport paramiko\ne=load_environment()\nh=e['TTA_SSH_HOST'];p=int(e['TTA_SSH_PORT'])\nkeys=paramiko.HostKeys(str(Path.home()/'.ssh/known_hosts'))\ntrusted=keys.lookup(h if p==22 else '['+h+']:'+str(p))\nif not trusted: raise RuntimeError('Trusted host entry required')\nfingerprints=['SHA256:'+base64.b64encode(hashlib.sha256(k.asbytes()).digest()).decode().rstrip('=') for k in trusted.values()]\njson.dump(dict(hostname=h,port=p,username=e['TTA_SSH_USER'],password=decrypt_user_secret(e['TTA_SSH_PASSWORD_DPAPI']),knownFingerprints=fingerprints),sys.stdout)\n`
);
const credentials = await new Promise((done, fail) => {
  const child = spawn("python", [helper, researchRoot], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const chunks = [];
  child.stdout.on("data", (bytes) => chunks.push(bytes));
  // Raw helper errors are deliberately never propagated: owner code may contain secrets.
  child.stderr.resume();
  child.on("error", () =>
    fail(new Error("Owner credential helper unavailable"))
  );
  child.on("close", (code) => {
    if (code !== 0) return fail(new Error("Owner credential helper failed"));
    const bytes = Buffer.concat(chunks);
    try {
      done(JSON.parse(bytes.toString()));
    } catch {
      fail(new Error("Invalid private credential response"));
    } finally {
      bytes.fill(0);
      for (const chunk of chunks) chunk.fill(0);
    }
  });
});
let secret = credentials.password;
assert(
  secret && credentials.knownFingerprints.length,
  "Owner credential or trusted host identity missing"
);
const bootstrap = join(task, "bootstrap.cjs");
await writeFile(
  bootstrap,
  `const {app}=require('electron');const cp=require('node:child_process');const spawn=cp.spawn;globalThis.__qaCorePids=[];cp.spawn=function(command,args,...rest){const child=spawn.call(this,command,args,...rest);if(args?.some(a=>String(a).replaceAll(String.fromCharCode(92),'/').endsWith('/core/cli.mjs')))child.once('spawn',()=>globalThis.__qaCorePids.push(child.pid));return child;};app.setPath('userData',${JSON.stringify(userData)});app.setAppPath(${JSON.stringify(join(root, "apps/desktop"))});require(${JSON.stringify(join(root, "apps/desktop/out/main/index.cjs"))});`
);
const env = { ...process.env, RW_CORE_BUNDLE: "1" };
for (const name of [
  "ELECTRON_RUN_AS_NODE",
  "RW_API_KEY",
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY"
])
  delete env[name];
let app, page;
const pageErrors = [];
const rpc = (method, params) =>
  page.evaluate(({ method, params }) => window.rw.request(method, params), {
    method,
    params
  });
async function open() {
  app = await electron.launch({
    executablePath: join(
      root,
      "apps/desktop/node_modules/electron/dist/electron.exe"
    ),
    args: [bootstrap],
    cwd: root,
    env,
    timeout: 30000
  });
  page = await app.firstWindow();
  page.on("pageerror", () => pageErrors.push("renderer-error"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await until(
    () =>
      page.evaluate(async () => (await window.rw.status())?.state === "online"),
    "Core did not connect"
  );
  await until(
    () =>
      page.evaluate(async () =>
        Boolean((await window.rw.request("system.hello")).workspaceRoot)
      ),
    "Core did not initialize"
  );
}
const checks = {};
const remoteRoot =
  remoteBaseRoot.replace(/\/+$/, "") + "/" + task.split(/[\\/]/).at(-1);
const runs = [];
const publicRun = (run) => ({
  id: run.id,
  planId: run.planId,
  state: run.state,
  reason: run.reason,
  revision: run.revision,
  metrics: run.metrics,
  artifacts: run.artifacts
});
async function plan(kind, args = "--hold-seconds 18", timeoutSeconds = 45) {
  const experiment = await rpc("experiments.propose", {
    title: `Native SSH maintenance / ${kind}`,
    goal: "复核已归档预测的算术与工作台执行可靠性",
    hypothesis: "相同冻结输入与脚本的统计不变",
    design: "隔离维护任务；不训练、不推理、不接受新科学结论",
    metrics: "mae",
    seeds: 3
  });
  return rpc("runs.propose", {
    experimentId: experiment.id,
    backend: "ssh",
    host: checks.profileId,
    remoteWorkdir: remoteRoot,
    remotePython,
    command: `'${remotePython}' recompute.py ${args}`,
    timeoutSeconds,
    maxOutputBytes: 1048576,
    inputs: [
      "input/CASE_OUTCOMES.csv",
      "input/METRICS_BY_SOURCE.csv",
      "input/SUMMARY_BY_BACKBONE.csv",
      "input/provenance.json"
    ],
    protocol: {
      name: "T011-archived-arithmetic-v1/R3D-18",
      metric: "mae",
      direction: "minimize",
      unit: "EF",
      dataset:
        "T011 accepted development336; primary R3D-18/3 source seeds; not new inference",
      environment:
        "CPU Python 3.9 stdlib; archived 2016 rows grouped by backbone",
      seeds: [17, 42, 2026],
      metricsPath: "results/metrics.json",
      requiredArtifacts: ["results/recheck.json"]
    }
  });
}
async function approveInUI(p) {
  await page.getByRole("tab", { name: "对话", exact: true }).click();
  await page
    .getByRole("button", { name: "审阅方案", exact: true })
    .waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "审阅方案", exact: true }).click();
  await page.getByRole("button", { name: "批准并运行", exact: true }).click();
  for (let count = 0; count < 80; count++) {
    const overview = await rpc("loop.overview");
    const run = overview.runs.find((item) => item.planId === p.id);
    if (run && run.state !== "preparing") {
      assert.equal(
        run.state,
        "running",
        "Expected active remote Job before lifecycle disruption"
      );
      return run;
    }
    await wait(250);
  }
  throw new Error("Native SSH run not started by UI approval");
}
async function settle(id) {
  for (let count = 0; count < 100; count++) {
    const { run } = await rpc("runs.get", { id });
    if (["succeeded", "failed", "canceled"].includes(run.state)) return run;
    await wait(600);
  }
  throw new Error("Remote Job did not settle");
}
async function scan(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      count += await scan(path);
      continue;
    }
    if (!entry.isFile()) continue;
    const bytes = await readFile(path).catch(() => Buffer.alloc(0));
    assert(
      !bytes.includes(Buffer.from(secret)),
      "Plaintext credential leaked into acceptance data"
    );
    count++;
  }
  return count;
}
try {
  await open();
  await page.getByRole("button", { name: /Agent 设置/ }).click();
  await page.getByRole("button", { name: /^SSH/ }).click();
  await page.getByLabel("连接名称", { exact: true }).fill("科研维护验收主机");
  await page.getByLabel("主机地址", { exact: true }).fill(credentials.hostname);
  await page.getByLabel("端口", { exact: true }).fill(String(credentials.port));
  await page.getByLabel("用户名", { exact: true }).fill(credentials.username);
  try {
    await page.getByLabel("密码", { exact: true }).fill(secret);
  } catch {
    throw new Error("Native SSH password input failed");
  }
  credentials.password = "";
  await page.getByRole("button", { name: "保存连接", exact: true }).click();
  await page
    .getByText("连接设置已保存。请核对主机指纹，再测试密码连接。", {
      exact: true
    })
    .waitFor();
  assert.equal(await page.getByLabel("密码", { exact: true }).inputValue(), "");
  await page.getByRole("button", { name: "读取主机指纹", exact: true }).click();
  await page.locator(".ssh-fingerprint-review code").waitFor();
  const fingerprint = await page
    .locator(".ssh-fingerprint-review code")
    .innerText();
  assert(
    credentials.knownFingerprints.includes(fingerprint),
    "Presented key differs from owner's trusted known_hosts"
  );
  checks.trustedFingerprintMatched = true;
  await page
    .getByRole("button", { name: "已核对，确认此指纹", exact: true })
    .click();
  await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await page
    .getByText("SSH 密码连接成功，可以按冻结计划运行。", { exact: true })
    .waitFor();
  const settings = await page.evaluate(() => window.rw.getSshSettings());
  assert(settings.encryptionAvailable);
  const profile = settings.profiles[0];
  assert(profile.hasCredential && profile.credentialStorage === "encrypted");
  checks.profileId = profile.id;
  checks.nativeSettings = true;
  checks.encryptedCredential = true;
  await page.screenshot({
    path: join(output, "native-settings-1440.png"),
    mask: [
      page.getByLabel("主机地址", { exact: true }),
      page.getByLabel("端口", { exact: true }),
      page.getByLabel("用户名", { exact: true }),
      page.locator(".ssh-profile-row small"),
      page.locator(".settings-path")
    ]
  });
  await page.getByRole("button", { name: "关闭设置", exact: true }).click();

  const firstPlan = await plan("Core kill recovery");
  assert.equal(firstPlan.sshConnection.hostKeySha256, fingerprint);
  const first = await approveInUI(firstPlan);
  const duplicate = await rpc("runs.start", {
    id: firstPlan.id,
    idempotencyKey: `launch:${firstPlan.id}`
  });
  assert.equal(duplicate.id, first.id);
  checks.sameKeySameJob = true;
  const killedPid = await app.evaluate(() => {
    const pid = globalThis.__qaCorePids.at(-1);
    if (!Number.isSafeInteger(pid) || pid < 1)
      throw new Error("Owned bundled Core PID not found");
    process.kill(pid, "SIGKILL");
    return pid;
  });
  assert(killedPid);
  await until(
    () =>
      page.evaluate(async () => (await window.rw.status())?.state === "error"),
    "Core exit was not reported"
  );
  await app.close();
  app = null;
  await open();
  const recovered = await rpc("runs.get", { id: first.id });
  assert.equal(recovered.run.id, first.id);
  checks.afterCoreKillObservedState = recovered.run.state;
  const firstDone = await settle(first.id);
  assert.equal(firstDone.state, "succeeded");
  const archived = JSON.parse(
    await readFile(
      join(
        workspace,
        ".research/jobs",
        first.id,
        "artifacts/results/recheck.json"
      ),
      "utf8"
    )
  );
  assert.deepEqual(archived.by_source, localResult.by_source);
  checks.coreKillSameJobRecovered = true;
  checks.localRemoteBySourceEqual = true;
  checks.numericChecks = archived.metric_checks;
  checks.maximumArithmeticError = archived.max_absolute_error;
  runs.push(publicRun(firstDone));

  const secondPlan = await plan("desktop close recovery");
  const second = await approveInUI(secondPlan);
  await app.close();
  app = null;
  await open();
  const reopened = await rpc("runs.get", { id: second.id });
  checks.afterDesktopCloseObservedState = reopened.run.state;
  const secondDone = await settle(second.id);
  assert.equal(secondDone.state, "succeeded");
  assert.equal(
    (
      await rpc("runs.start", {
        id: secondPlan.id,
        idempotencyKey: `launch:${secondPlan.id}`
      })
    ).id,
    second.id
  );
  checks.desktopCloseSameJobRecovered = true;
  const comparison = await rpc("runs.compare", {
    leftId: first.id,
    rightId: second.id
  });
  assert(comparison.comparable);
  assert.equal(comparison.delta, 0);
  checks.repeatedComparison = comparison;
  runs.push(publicRun(secondDone));

  for (const [kind, args, budget] of [
    ["cancel", "--hold-seconds 18", 45],
    ["timeout", "--hold-seconds 8", 1],
    ["missing", "--omit-report", 45]
  ]) {
    const p = await plan(kind, args, budget);
    // Same human RPC contract as the UI button; no model is involved in this test.
    await rpc("runs.approve", { id: p.id, digest: p.digest });
    const run = await rpc("runs.start", {
      id: p.id,
      idempotencyKey: `maintenance:${p.id}`
    });
    if (kind === "cancel") await rpc("runs.cancel", { id: run.id });
    const final = await settle(run.id);
    assert.equal(final.state, kind === "cancel" ? "canceled" : "failed");
    if (kind === "timeout") assert.equal(final.reason, "timeout");
    if (kind === "missing")
      assert(final.artifacts.some((item) => item.status === "missing"));
    checks[kind] = { state: final.state, reason: final.reason };
    runs.push(publicRun(final));
  }
  const finalOverview = await rpc("loop.overview");
  assert.equal(finalOverview.runs.length, 5);
  assert(
    finalOverview.runs.every((run) =>
      ["succeeded", "failed", "canceled"].includes(run.state)
    )
  );
  await page.getByRole("tab", { name: "研究罗盘", exact: true }).click();
  await page.screenshot({
    path: join(output, "native-recovered-runs-1440.png")
  });
  checks.noExtraJobs = true;
  checks.credentialScanFiles = await scan(task);
  assert.deepEqual(pageErrors, []);
  const report = {
    at: new Date().toISOString(),
    scope:
      "owner-authorized isolated CPU maintenance; no training/inference or scientific confirmation",
    nativeTransport: "shipped ssh2 adapter, bundled Core, native settings UI",
    checks,
    inputs: provenance.inputs.map(({ sha256, bytes }) => ({ sha256, bytes })),
    runs
  };
  await writeFile(
    join(root, "docs/project/evidence/native-ssh-20261111.json"),
    JSON.stringify(report, null, 2)
  );
  await writeFile(
    join(output, "report.json"),
    JSON.stringify(
      {
        ...report,
        runs: runs.map(({ id, state, metrics }) => ({ id, state, metrics }))
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify({ output, checks, states: runs.map((run) => run.state) })
  );
} catch (error) {
  // Do not capture private input DOM, raw connection exceptions or Playwright traces.
  const message = String(error?.message || "Native SSH acceptance failed");
  if (secret && message.includes(secret))
    throw new Error(
      "Native SSH acceptance failed (private diagnostic suppressed)"
    );
  throw error;
} finally {
  secret = "";
  credentials.password = "";
  if (app) await app.close().catch(() => {});
}
