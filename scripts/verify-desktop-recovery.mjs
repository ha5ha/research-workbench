// Production Main/preload/bundled Core with real detached local Jobs.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { sha256 } from "./distribution-manifest.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.RW_PLAYWRIGHT_MODULE || "@playwright/test"
);
const root = process.cwd(),
  git = process.env.RW_GIT_BINARY || "git";
const bundlePaths = {
  core: "apps/desktop/resources/core/cli.mjs",
  main: "apps/desktop/out/main/index.cjs",
  preload: "apps/desktop/out/preload/index.cjs"
};
const bundleHashes = Object.fromEntries(
  await Promise.all(
    Object.entries(bundlePaths).map(async ([name, path]) => [
      name,
      { path, sha256: sha256(await readFile(join(root, path))) }
    ])
  )
);
const task = await mkdtemp(join(root, ".tmp", "local-recovery-"));
const workspace = join(task, "workspace"),
  userData = join(task, "profile");
await mkdir(workspace);
await mkdir(userData);
await writeFile(
  join(workspace, "calculate.cjs"),
  `setTimeout(()=>{const fs=require('node:fs');const values=[1,2,3];const sum=values.reduce((a,b)=>a+b,0);fs.mkdirSync('results',{recursive:true});fs.writeFileSync('results/metrics.json',JSON.stringify([{seed:0,score:sum},{seed:1,score:sum}]));console.log(JSON.stringify({sum}));},45000);`
);
for (const args of [
  ["init", "-q", workspace],
  ["-C", workspace, "add", "calculate.cjs"],
  [
    "-C",
    workspace,
    "-c",
    "user.name=QA",
    "-c",
    "user.email=qa@example.invalid",
    "commit",
    "-qm",
    "test: local lifecycle calculation"
  ]
])
  execFileSync(git, args, { windowsHide: true, stdio: "pipe" });
await writeFile(
  join(userData, "settings.json"),
  JSON.stringify({
    workspace,
    gitBinary: git,
    permissionLevel: "workspace-write"
  })
);
const bootstrap = join(task, "bootstrap.cjs");
const corePidFile = join(task, "core.pid");
const lifecycleFile = join(task, "lifecycle.jsonl");
await writeFile(
  bootstrap,
  `const {app}=require('electron');const fs=require('node:fs');const cp=require('node:child_process');const spawn=cp.spawn;const mark=event=>fs.appendFileSync(${JSON.stringify(lifecycleFile)},JSON.stringify({event,pid:process.pid,at:new Date().toISOString()})+String.fromCharCode(10));for(const event of ['before-quit','will-quit','quit'])app.on(event,()=>mark(event));process.on('exit',()=>mark('process-exit'));mark('bootstrap');cp.spawn=function(command,args,...rest){const child=spawn.call(this,command,args,...rest);if(args?.some(a=>String(a).replaceAll(String.fromCharCode(92),'/').endsWith('/core/cli.mjs')))child.once('spawn',()=>fs.writeFileSync(${JSON.stringify(corePidFile)},String(child.pid)));return child;};app.setPath('userData',${JSON.stringify(userData)});app.setAppPath(${JSON.stringify(join(root, "apps/desktop"))});require(${JSON.stringify(join(root, "apps/desktop/out/main/index.cjs"))});`
);
const env = { ...process.env, RW_CORE_BUNDLE: "1" };
for (const name of [
  "ELECTRON_RUN_AS_NODE",
  "RW_API_KEY",
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY"
])
  delete env[name];
let app, page, browser;
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(predicate, message) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await wait(100);
  }
  throw new Error(message);
}
const rpc = (method, params) =>
  page.evaluate(({ method, params }) => window.rw.request(method, params), {
    method,
    params
  });
async function open() {
  const portFile = join(userData, "DevToolsActivePort");
  await writeFile(portFile, "");
  app = spawn(
    join(root, "apps/desktop/node_modules/electron/dist/electron.exe"),
    [bootstrap, "--remote-debugging-port=0"],
    {
      cwd: root,
      env,
      windowsHide: true,
      stdio: "ignore"
    }
  );
  for (let attempt = 0; attempt < 100; attempt++) {
    const [port] = (await readFile(portFile, "utf8").catch(() => "")).split(
      "\n"
    );
    if (/^\d+$/.test(port)) {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      break;
    }
    await wait(100);
  }
  if (!browser) throw new Error("Electron browser did not become ready");
  page =
    browser.contexts()[0].pages()[0] ||
    (await browser.contexts()[0].waitForEvent("page"));
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
async function start(title) {
  const book = await rpc("experiments.propose", {
    title,
    goal: "验证独立本地 Job 在桌面生命周期变化后继续运行",
    hypothesis: "工作台进程退出不终止已批准的受管计算",
    design: "45秒等待后计算1+2+3；人工批准；在计算期间退出应用",
    metrics: "score",
    seeds: 2
  });
  const plan = await rpc("runs.propose", {
    experimentId: book.id,
    command: "node calculate.cjs",
    backend: "local",
    timeoutSeconds: 90,
    maxOutputBytes: 1048576,
    inputs: [],
    protocol: {
      name: "lifecycle/sum-v1",
      metric: "score",
      direction: "maximize",
      unit: "sum",
      dataset: "integer-1-2-3",
      environment: "Node Windows CPU",
      seeds: [0, 1],
      metricsPath: "results/metrics.json",
      requiredArtifacts: []
    }
  });
  await page.getByRole("button", { name: "审阅方案", exact: true }).click();
  await page.getByRole("button", { name: "批准并运行", exact: true }).click();
  for (let attempt = 0; attempt < 60; attempt++) {
    const overview = await rpc("loop.overview");
    const run = overview.runs.find((run) => run.planId === plan.id);
    if (run?.state === "running") return { run, plan };
    if (run && ["failed", "unknown"].includes(run.state))
      throw new Error(run.reason);
    await wait(250);
  }
  throw new Error("Local Job did not start");
}
async function settle(id) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const { run } = await rpc("runs.get", { id });
    if (["succeeded", "failed", "canceled"].includes(run.state)) return run;
    await wait(500);
  }
  throw new Error("Local Job did not settle");
}
async function closeDesktop() {
  // Launch directly, without Playwright's Node inspector/Windows cmd wrapper.
  const pid = app.pid;
  const requestedAt = new Date().toISOString();
  const requested = performance.now();
  const exited = new Promise((done) =>
    app.once("exit", (code, signal) =>
      done({
        pid,
        requestedAt,
        exitedAt: new Date().toISOString(),
        elapsedMs: Math.round((performance.now() - requested) * 100) / 100,
        event: "ChildProcess.exit",
        code,
        signal
      })
    )
  );
  await page.evaluate(() => window.close()).catch(() => {});
  let timer;
  try {
    const measured = await Promise.race([
      exited,
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error("Actual Electron process did not exit within 5 seconds")
            ),
          5000
        );
      })
    ]);
    await browser.close();
    browser = null;
    app = null;
    return measured;
  } finally {
    clearTimeout(timer);
  }
}
const evidence = [];
const timeline = [];
const mark = (mode, stage) => {
  const point = { mode, stage, at: new Date().toISOString() };
  timeline.push(point);
  console.log(JSON.stringify(point));
};
try {
  await open();
  for (const mode of ["core-kill", "desktop-close"]) {
    const { run, plan } = await start(mode);
    mark(mode, "started");
    const originalId = run.id;
    if (mode === "core-kill") {
      const pid = Number(await readFile(corePidFile, "utf8"));
      assert(
        Number.isSafeInteger(pid) && pid > 0,
        "Owned Core process missing"
      );
      process.kill(pid, "SIGKILL");
      await until(
        () =>
          page.evaluate(
            async () => (await window.rw.status())?.state === "error"
          ),
        "Core exit was not reported"
      );
      mark(mode, "core-exit-observed");
    }
    const desktopExit = await closeDesktop();
    mark(mode, "desktop-closed");
    await open();
    mark(mode, "desktop-reopened");
    const reopened = (await rpc("runs.get", { id: originalId })).run;
    assert.equal(reopened.id, originalId);
    assert.equal(
      reopened.state,
      "running",
      `${mode}: Job must still be active; ${JSON.stringify(timeline)}`
    );
    const final = await settle(originalId);
    assert.equal(final.state, "succeeded");
    assert.equal(final.metrics.score, 6);
    assert.equal(
      (
        await rpc("runs.start", {
          id: plan.id,
          idempotencyKey: `launch:${plan.id}`
        })
      ).id,
      originalId
    );
    evidence.push({
      mode,
      runId: originalId,
      reopenedState: reopened.state,
      finalState: final.state,
      desktopExit,
      metrics: final.metrics,
      artifacts: final.artifacts
    });
  }
  assert.equal((await rpc("loop.overview")).runs.length, 2);
  for (const { path, sha256: expected } of Object.values(bundleHashes))
    assert.equal(
      sha256(await readFile(join(root, path))),
      expected,
      `Bundle changed during acceptance: ${path}`
    );
  await writeFile(
    join(task, "report.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        bundledCore: true,
        realDetachedJobs: true,
        bundleHashes,
        evidence,
        timeline,
        noDuplicateJobs: true
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ passed: true, output: task, evidence }));
} finally {
  if (app) await closeDesktop();
}
