// Runs the actual NSIS portable artifact twice, without provider credentials.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { sha256 } from "./distribution-manifest.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.RW_PLAYWRIGHT_MODULE || "playwright");
const root = process.cwd();
const version = JSON.parse(
  await readFile(join(root, "apps/desktop/package.json"), "utf8")
).version;
const executable = resolve(
  process.env.RW_PORTABLE_EXE || `release/ResearchWorkbench-${version}-x64.exe`
);
await mkdir(join(root, ".tmp"), { recursive: true });
const fixture = await mkdtemp(join(root, ".tmp/portable-qa-"));
const workspace = join(fixture, "workspace"),
  userData = join(fixture, "profile");
for (const path of [
  workspace,
  userData,
  join(fixture, "appdata"),
  join(fixture, "localappdata")
])
  await mkdir(path);
const git = process.env.RW_GIT_BINARY || "git";
execFileSync(git, ["init", workspace], { windowsHide: true, stdio: "ignore" });
await writeFile(
  join(workspace, "experiment.cjs"),
  "require('fs').mkdirSync('results',{recursive:true});require('fs').writeFileSync('results/metrics.json',JSON.stringify([{seed:0,score:3},{seed:1,score:5}]));console.log('portable calculation verified');\n"
);
for (const args of [
  ["add", "experiment.cjs"],
  [
    "-c",
    "user.name=Portable fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "fixture"
  ]
])
  execFileSync(git, ["-C", workspace, ...args], {
    windowsHide: true,
    stdio: "ignore"
  });
await writeFile(
  join(userData, "settings.json"),
  JSON.stringify({
    workspace,
    gitBinary: git,
    permissionLevel: "workspace-write",
    provider: "openai-compatible",
    baseUrl: "http://127.0.0.1:1/v1",
    model: "portable-offline-fixture"
  })
);
const env = {
  ...process.env,
  APPDATA: join(fixture, "appdata"),
  LOCALAPPDATA: join(fixture, "localappdata")
};
for (const key of Object.keys(env))
  if (
    /(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN)$/.test(key) ||
    key === "ELECTRON_RUN_AS_NODE" ||
    key.startsWith("RW_")
  )
    delete env[key];
const expectedManifest = JSON.parse(
  await readFile(
    join(root, "apps/desktop/resources/licenses/manifest.json"),
    "utf8"
  )
);
const errors = [],
  launches = [];
const rpcTrace = [],
  spawned = [];
let app;
async function poll(predicate, message, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(message);
}
async function readRun(page, id, stage) {
  const detail = await page.evaluate(
    (id) => window.rw.request("runs.get", { id }),
    id
  );
  rpcTrace.push({
    at: new Date().toISOString(),
    method: "runs.get",
    stage,
    id,
    state: detail.run.state,
    metrics: detail.run.metrics,
    artifacts: detail.run.artifacts,
    lastEvent: detail.events.at(-1)
  });
  return detail;
}
async function freePort() {
  const server = createServer();
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}
async function readyJson(url, child) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(
        `Portable exited before debugger became ready (${child.exitCode})`
      );
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return await response.json();
    } catch {}
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Portable debugger unavailable: ${url}`);
}
async function connectPortable() {
  // NSIS does not forward child stderr, so attach to explicit loopback ports.
  const inspectorPort = await freePort(),
    browserPort = await freePort();
  const child = spawn(
    executable,
    [
      `--inspect=127.0.0.1:${inspectorPort}`,
      `--remote-debugging-port=${browserPort}`,
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${userData}`
    ],
    { cwd: fixture, env, windowsHide: true, stdio: "ignore" }
  );
  spawned.push(child);
  const inspected = await readyJson(
    `http://127.0.0.1:${inspectorPort}/json/list`,
    child
  );
  const socket = new WebSocket(inspected[0].webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    socket.addEventListener("open", done, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error || message.result?.exceptionDetails)
        reject(
          new Error(
            JSON.stringify(message.error || message.result.exceptionDetails)
          )
        );
      else resolve(message.result.result.value);
    }
  });
  const evaluate = (fn, arg) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: {
            expression: `(${fn.toString()})(process.mainModule.require('electron'),${JSON.stringify(arg) || "undefined"})`,
            returnByValue: true,
            awaitPromise: true
          }
        })
      );
    });
  await readyJson(`http://127.0.0.1:${browserPort}/json/version`, child);
  const browser = await chromium.connectOverCDP(
    `http://127.0.0.1:${browserPort}`,
    { timeout: 30000 }
  );
  return {
    evaluate,
    firstWindow: async () => {
      const context = browser.contexts()[0];
      return (
        context.pages()[0] ||
        (await context.waitForEvent("page", { timeout: 30000 }))
      );
    },
    close: async () => {
      await evaluate(({ app }) => {
        setImmediate(() => app.quit());
        return true;
      });
      socket.close();
      await browser.close();
      if (child.exitCode === null)
        await Promise.race([
          new Promise((done) => child.once("exit", done)),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Portable did not exit cleanly")),
              15000
            )
          )
        ]);
    }
  };
}
async function launch() {
  app = await connectPortable();
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  // This installed Playwright treats an async predicate's Promise as truthy.
  // Poll awaited RPC results in Node, never waitForFunction(async ...).
  await poll(
    async () =>
      (await page.evaluate(() => window.rw?.status()))?.state === "online",
    "Packaged Core did not become online"
  );
  const details = await app.evaluate(({ app }) => ({
    packaged: app.isPackaged,
    userData: app.getPath("userData"),
    resources: process.resourcesPath,
    appPath: app.getAppPath(),
    versions: process.versions
  }));
  assert.equal(details.packaged, true);
  assert.equal(
    resolve(details.userData).toLowerCase(),
    resolve(userData).toLowerCase()
  );
  const settings = await page.evaluate(() => window.rw.getSettings());
  assert.equal(
    resolve(settings.workspace).toLowerCase(),
    resolve(workspace).toLowerCase()
  );
  assert.equal(settings.hasApiKey, false);
  const files = await app.evaluate(async ({ app }) => {
    const fs = process.getBuiltinModule("node:fs"),
      path = process.getBuiltinModule("node:path"),
      crypto = process.getBuiltinModule("node:crypto");
    const base = path.join(process.resourcesPath, "licenses");
    const manifest = JSON.parse(
      fs.readFileSync(path.join(base, "manifest.json"), "utf8")
    );
    if (process.versions.electron !== manifest.runtime.version)
      throw new Error("Packaged Electron runtime version mismatch");
    const documents = [
      ...manifest.packages.flatMap((entry) => entry.documents),
      ...manifest.runtime.documents
    ];
    for (const document of documents)
      if (
        crypto
          .createHash("sha256")
          .update(fs.readFileSync(path.join(base, document.path)))
          .digest("hex") !== document.sha256
      )
        throw new Error(`Packaged notice hash mismatch: ${document.path}`);
    if (fs.existsSync(path.join(app.getAppPath(), "node_modules")))
      throw new Error("Unaccounted node_modules copied into app.asar");
    for (const build of manifest.builds)
      for (const output of build.outputs) {
        const file = output.path.includes("/resources/")
          ? path.join(
              process.resourcesPath,
              output.path.split("/resources/")[1]
            )
          : path.join(app.getAppPath(), "out", output.path.split("/out/")[1]);
        if (
          crypto
            .createHash("sha256")
            .update(fs.readFileSync(file))
            .digest("hex") !== output.sha256
        )
          throw new Error(`Packaged build hash mismatch: ${output.path}`);
      }
    return {
      packages: manifest.packages.length,
      documents: documents.length,
      // electron-builder injects app.asar integrity into the PE resource table.
      packagedRuntimeSha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(process.execPath))
        .digest("hex"),
      sourceRuntimeSha256: manifest.runtime.binarySha256,
      manifestSha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(base, "manifest.json")))
        .digest("hex")
    };
  });
  assert.equal(files.packages, expectedManifest.packages.length);
  launches.push({ ...details, ...files });
  return page;
}
try {
  let page = await launch();
  const experiment = await page.evaluate(() =>
    window.rw.request("experiments.propose", {
      title: "Portable cold-start fixture",
      goal: "validate packaged managed run",
      hypothesis: "fixed metric survives restart",
      design: "two fixed seeds",
      seeds: 2
    })
  );
  const plan = await page.evaluate(
    (id) =>
      window.rw.request("runs.propose", {
        experimentId: id,
        command: "node experiment.cjs",
        backend: "local",
        timeoutSeconds: 30,
        protocol: {
          name: "portable/score",
          metric: "score",
          direction: "maximize",
          unit: "",
          dataset: "portable-fixture-v1",
          environment: "Windows/Node/CPU",
          seeds: [0, 1],
          metricsPath: "results/metrics.json"
        }
      }),
    experiment.id
  );
  await page.evaluate(
    (plan) =>
      window.rw.request("runs.approve", { id: plan.id, digest: plan.digest }),
    plan
  );
  const run = await page.evaluate(
    (id) =>
      window.rw.request("runs.start", {
        id,
        idempotencyKey: "portable-cold-start"
      }),
    plan.id
  );
  rpcTrace.push({
    at: new Date().toISOString(),
    method: "runs.start",
    id: run.id,
    state: run.state,
    metrics: run.metrics
  });
  await poll(
    async () =>
      (await readRun(page, run.id, "completion-poll")).run.state ===
      "succeeded",
    "Packaged managed run did not succeed"
  );
  const before = await readRun(page, run.id, "after-success");
  assert.equal(before.run.state, "succeeded");
  assert.equal(before.run.metrics.score, 4);
  await page.screenshot({ path: join(fixture, "cold-start.png") });
  await app.close();
  app = null;
  page = await launch();
  const after = await readRun(page, run.id, "reopened");
  assert.equal(after.run.state, "succeeded");
  assert.equal(after.run.metrics.score, 4);
  assert.deepEqual(after.run.artifacts, before.run.artifacts);
  assert.equal(
    (
      await page.evaluate(
        (id) =>
          window.rw.request("runs.start", {
            id,
            idempotencyKey: "portable-cold-start"
          }),
        plan.id
      )
    ).id,
    run.id
  );
  await page.screenshot({ path: join(fixture, "reopen.png") });
  assert.deepEqual(errors, []);
  const report = {
    executable,
    executableSha256: sha256(await readFile(executable)),
    isolatedFixture: fixture,
    launches,
    result: {
      runId: run.id,
      state: after.run.state,
      score: after.run.metrics.score,
      artifactCount: after.run.artifacts.length
    },
    rendererErrors: errors,
    rpcTrace
  };
  await writeFile(
    join(fixture, "report.json"),
    JSON.stringify(report, null, 2) + "\n"
  );
  console.log(
    `Portable cold-start/reopen passed; ${expectedManifest.packages.length} packages; score 4; evidence ${join(fixture, "report.json")}`
  );
} catch (error) {
  await writeFile(
    join(fixture, "failure.json"),
    JSON.stringify(
      { executable, launches, rpcTrace, error: error.stack },
      null,
      2
    ) + "\n"
  );
  throw error;
} finally {
  if (app) await app.close();
  for (const child of spawned)
    if (child.exitCode === null) {
      try {
        execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore"
        });
      } catch {
        console.error(
          `Failed to clean up own portable fixture process ${child.pid}`
        );
      }
    }
}
