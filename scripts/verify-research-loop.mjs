// Real Electron/Main/preload/Core verification with a deterministic local model endpoint.
// This exercises the user workflow; it does not claim real-provider or SSH acceptance.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { _electron: electron } = require(
  process.env.RW_PLAYWRIGHT_MODULE || "playwright"
);
const root = process.cwd();
const output = resolve(
  process.env.RW_QA_OUTPUT ||
    "design/implementation/conversation-first-20261111"
);
await mkdir(output, { recursive: true });
await mkdir(join(root, ".tmp"), { recursive: true });
const task = await mkdtemp(join(root, ".tmp", "ui-qa-"));
const workspace = join(task, "workspace"),
  userData = join(task, "profile");
await mkdir(workspace);
await mkdir(userData);
const git = process.env.RW_GIT_BINARY || "git";
execFileSync(git, ["init", workspace], { stdio: "ignore", windowsHide: true });
await writeFile(
  join(workspace, "experiment.cjs"),
  `// frozen baseline · 固定输入\nrequire('fs').mkdirSync('results',{recursive:true});require('fs').writeFileSync('results/metrics.json',JSON.stringify([{seed:0,score:3},{seed:1,score:5}]));console.log('verified calculation');`
);
const frozenScript = await readFile(join(workspace, "experiment.cjs"), "utf8");
for (const args of [
  ["add", "experiment.cjs"],
  [
    "-c",
    "user.name=QA",
    "-c",
    "user.email=qa@example.invalid",
    "commit",
    "-qm",
    "qa fixture"
  ]
])
  execFileSync(git, ["-C", workspace, ...args], { windowsHide: true });
const toolsUsed = [];
function resultOf(message) {
  const text =
    typeof message.content === "string"
      ? message.content
      : message.content.map((part) => part.text || "").join("");
  return JSON.parse(text);
}
const endpoint = createServer((req, res) => {
  let body = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const payload = JSON.parse(body),
        last = payload.messages.at(-1);
      const lastToolName =
        last.name ||
        payload.messages
          .flatMap((message) => message.tool_calls || [])
          .find((call) => call.id === last.tool_call_id)?.function.name;
      const lastText =
        typeof last.content === "string"
          ? last.content
          : last.content.map((part) => part.text || "").join("");
      let tool,
        args,
        content = "方案已准备，请审阅输入区上方的冻结方案。";
      if (
        last.role === "user" &&
        !payload.messages.some((message) => message.role === "tool")
      ) {
        tool = "create_experiment";
        args = {
          title: "固定输入 · 双种子 baseline",
          goal: "建立可复算的参照",
          hypothesis: "两次测量可复核",
          design: "固定输入和两个种子",
          metrics: "score",
          seeds: 2
        };
      } else if (last.role === "tool" && lastToolName === "create_experiment") {
        tool = "request_run";
        args = {
          experimentId: last.content.match(/实验 (\S+) 已创建/)?.[1],
          command: "node experiment.cjs",
          timeoutSeconds: 30,
          inputs: [],
          backend: "local",
          protocol: {
            name: "fixed/score",
            metric: "score",
            direction: "maximize",
            unit: "",
            dataset: "fixed-fixture-v1",
            environment: "Node / Windows / CPU",
            seeds: [0, 1],
            metricsPath: "results/metrics.json",
            requiredArtifacts: []
          }
        };
      } else if (last.role === "user" && lastText.includes("分析运行")) {
        tool = "research_state";
        args = {};
      } else if (last.role === "tool" && lastToolName === "research_state") {
        const state = resultOf(last),
          run = state.runs.find((run) => run.state === "succeeded"),
          artifact = run.artifacts.find((file) => file.status === "present");
        tool = "propose_claim";
        args = {
          statement: "固定输入下双种子指标均值为 4",
          limitations: "仅覆盖本夹具，未证明真实数据泛化",
          sources: [
            {
              runId: run.id,
              artifactPath: artifact.path,
              sha256: artifact.sha256,
              relation: "supports"
            }
          ]
        };
      } else if (last.role === "tool" && lastToolName === "propose_claim")
        content = "已保存候选结论，请在研究罗盘核验证据后确认。";
      if (tool) toolsUsed.push(tool);
      res.writeHead(200, { "content-type": "text/event-stream" });
      const chunk = (delta, finish_reason) =>
        res.write(
          `data: ${JSON.stringify({ id: "ui-fixture", object: "chat.completion.chunk", created: 1, model: payload.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`
        );
      chunk(
        tool
          ? {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: `call-${toolsUsed.length}`,
                  type: "function",
                  function: { name: tool, arguments: JSON.stringify(args) }
                }
              ]
            }
          : { role: "assistant", content },
        null
      );
      chunk({}, tool ? "tool_calls" : "stop");
      res.end("data: [DONE]\n\n");
    } catch (error) {
      res.writeHead(500);
      res.end(String(error));
    }
  });
});
await new Promise((done) => endpoint.listen(0, "127.0.0.1", done));
await writeFile(
  join(userData, "settings.json"),
  JSON.stringify({
    workspace,
    gitBinary: git,
    permissionLevel: "workspace-write",
    provider: "openai-compatible",
    baseUrl: `http://127.0.0.1:${endpoint.address().port}/v1`,
    model: "qa-local-fixture"
  })
);
const bootstrap = join(task, "bootstrap.cjs");
await writeFile(
  bootstrap,
  `const {app}=require('electron');app.setPath('userData',${JSON.stringify(userData)});require(${JSON.stringify(join(root, "apps/desktop/out/main/index.cjs"))});`
);
const env = { ...process.env, RW_API_KEY: "qa-fixture-not-a-secret" };
delete env.ELECTRON_RUN_AS_NODE;
delete env.DEEPSEEK_API_KEY;
delete env.OPENAI_API_KEY;
const app = await electron.launch({
  executablePath: join(
    root,
    "apps/desktop/node_modules/electron/dist/electron.exe"
  ),
  args: [bootstrap, "--remote-debugging-port=0"],
  cwd: root,
  env,
  timeout: 30000
});
const page = await app.firstWindow();
await page.emulateMedia({ reducedMotion: "reduce" });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const resize = async (width, height) => {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setMinimumSize(320, 320);
      win.setContentSize(...size);
    },
    [width, height]
  );
  await page.waitForFunction((width) => innerWidth === width, width);
};
const send = async (text) => {
  await page
    .getByRole("textbox", { name: "给 Research Agent 发消息" })
    .fill(text);
  await page.getByRole("button", { name: "发送", exact: true }).click();
};
const snapshot = async (name) =>
  page.screenshot({
    path: join(output, name + ".png"),
    animations: "disabled"
  });
// Keep asynchronous RPC polling in Node: some host Playwright builds treat a
// Promise-returning waitForFunction predicate as truthy before its result arrives.
const poll = async (read, accept, label, timeout = 30000) => {
  const deadline = Date.now() + timeout;
  let last;
  do {
    last = await read();
    if (accept(last)) return last;
    await new Promise((done) => setTimeout(done, 100));
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(last)}`);
};
const waitForCore = () =>
  poll(
    () => page.evaluate(() => window.rw.status()),
    (status) => status?.state === "online",
    "Core online"
  );
if (process.env.RW_QA_DIRECT_RUN === "1") {
  try {
    await waitForCore();
    await resize(1440, 900);
    const input = page.getByRole("textbox", {
      name: "给 Research Agent 发消息"
    });
    await input.fill("请帮我准备固定输入 baseline，生成冻结方案供我审阅。");
    await input.press("Enter");
    await page.getByRole("button", { name: "审阅方案", exact: true }).click();
    await page.getByRole("button", { name: "批准并运行", exact: true }).click();
    await poll(
      () => page.evaluate(() => window.rw.request("loop.overview")),
      (overview) => overview.runs.some((run) => run.state === "succeeded"),
      "direct run completion"
    );
    await page
      .locator(".taskbook")
      .getByRole("button", { name: "查看运行", exact: true })
      .click();
    await page
      .locator(".run-detail .metric-results")
      .getByText("4.00000", { exact: true })
      .waitFor();
    await page.getByText("results/metrics.json", { exact: true }).click();
    await page.getByText(/^SHA-256：/).waitFor();
    for (const [width, height] of [
      [1440, 900],
      [1024, 768],
      [390, 844]
    ]) {
      await resize(width, height);
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth
        )
      )
        throw new Error("direct run detail overflow");
      await page.screenshot({
        path: join(output, `direct-run-${width}.png`),
        animations: "disabled"
      });
    }
    await writeFile(
      join(output, "direct-run-report.json"),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          checks: [
            "chat run button opens corresponding detail without selecting a row",
            "artifact checksum has an explicit SHA-256 label",
            "run detail visible at 1440/1024/390 without page overflow"
          ],
          toolsUsed
        },
        null,
        2
      )
    );
    console.log("Direct run navigation passed at three sizes");
  } finally {
    await app.close();
    endpoint.closeAllConnections();
    await new Promise((done) => endpoint.close(done));
  }
  process.exit(0);
}
if (process.env.RW_QA_REVIEW === "1") {
  await waitForCore();
  await resize(1440, 900);
  const [port] = (
    await readFile(join(userData, "DevToolsActivePort"), "utf8")
  ).split("\n");
  const donePath = join(task, "review.done");
  await writeFile(
    join(root, ".tmp", "ui-review-session.json"),
    JSON.stringify({ endpoint: `http://127.0.0.1:${port}`, donePath, output })
  );
  console.log("Independent UX review session ready");
  const deadline = Date.now() + 15 * 60 * 1000;
  while (
    Date.now() < deadline &&
    !(await readFile(donePath, "utf8").catch(() => ""))
  )
    await new Promise((done) => setTimeout(done, 500));
  await app.close();
  endpoint.closeAllConnections();
  await new Promise((done) => endpoint.close(done));
  process.exit(0);
}
try {
  await waitForCore();
  await resize(1440, 900);
  await page.getByRole("heading", { name: "今天想研究什么？" }).waitFor();
  await poll(
    () =>
      page.getByRole("button", { name: "选择模型", exact: true }).innerText(),
    (text) => text.includes("qa-local-fixture"),
    "model selector ready"
  );
  await page.evaluate(() => document.fonts.ready);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root: documentNode } = await cdp.send("DOM.getDocument");
  const fonts = [];
  for (const [language, selector] of [
    ["Chinese", ".chat-welcome h1"],
    ["English", ".brand strong"]
  ]) {
    const { nodeId } = await cdp.send("DOM.querySelector", {
      nodeId: documentNode.nodeId,
      selector
    });
    const rendered = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    fonts.push({ language, selector, fonts: rendered.fonts });
  }
  await cdp.detach();
  await writeFile(
    join(output, "platform-fonts.json"),
    JSON.stringify(fonts, null, 2)
  );
  await snapshot("chat-empty-1440");
  if (
    await page.getByRole("button", { name: "确认任务书", exact: true }).count()
  )
    throw new Error("duplicate taskbook approval remains");
  await send("请帮我准备固定输入 baseline，生成冻结方案供我审阅。");
  await page.getByRole("button", { name: "审阅方案", exact: true }).waitFor();
  await page
    .locator(".taskbook")
    .getByRole("button", { name: "审阅当前方案", exact: true })
    .waitFor();
  if (
    await page
      .locator(".taskbook")
      .getByRole("button", { name: "让 Agent 准备运行方案", exact: true })
      .count()
  )
    throw new Error("taskbook still offers duplicate preparation");
  const initial = await page.evaluate(() => window.rw.request("loop.overview"));
  if (initial.runs.length || initial.plans.some((plan) => plan.approvedAt))
    throw new Error("model crossed approval boundary");
  const initialPlan = initial.plans.find((plan) => !plan.closure);
  await writeFile(
    join(workspace, "experiment.cjs"),
    "// current working tree changed after freezing\n"
  );
  await page
    .locator(".taskbook")
    .getByRole("button", { name: "审阅当前方案", exact: true })
    .click();
  await page.getByText("查看数据、预算与冻结文件", { exact: true }).click();
  await page
    .getByRole("button", { name: "查看冻结文件 experiment.cjs", exact: true })
    .click();
  await page.getByLabel("冻结内容 experiment.cjs", { exact: true }).waitFor();
  if (
    (await page
      .getByLabel("冻结内容 experiment.cjs", { exact: true })
      .innerText()) !== frozenScript
  )
    throw new Error("preview did not show complete frozen version");
  const frozenFile = await page.evaluate(
    (id) =>
      window.rw.request("plans.readFrozenFile", { id, path: "experiment.cjs" }),
    initialPlan.id
  );
  if (
    frozenFile.content !== frozenScript ||
    frozenFile.sha256 !== initialPlan.files[0].sha256
  )
    throw new Error("frozen read identity mismatch");
  await snapshot("chat-plan-1440");
  await resize(390, 844);
  const snapshotPath = join(
    workspace,
    ".research",
    "plans",
    initialPlan.id,
    "source",
    "experiment.cjs"
  );
  await writeFile(snapshotPath, "// corrupted frozen fixture\n");
  await page
    .getByRole("button", { name: "查看冻结文件 experiment.cjs", exact: true })
    .click();
  await page.getByRole("alert").filter({ hasText: "冻结快照已改变" }).waitFor();
  if (
    (
      await page
        .getByRole("alert")
        .filter({ hasText: "冻结快照已改变" })
        .innerText()
    ).includes("core:request")
  )
    throw new Error("transport detail leaked into the file review error");
  await page.getByRole("button", { name: "重试读取", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  const fileErrorFocus = await page
    .getByRole("button", { name: "重试读取", exact: true })
    .evaluate((el) => ({
      focused: el === document.activeElement,
      height: el.getBoundingClientRect().height,
      outline: getComputedStyle(el).outlineStyle
    }));
  if (
    !fileErrorFocus.focused ||
    fileErrorFocus.height < 40 ||
    fileErrorFocus.outline === "none"
  )
    throw new Error(
      `file error retry is not accessible on mobile: ${JSON.stringify(fileErrorFocus)}`
    );
  await snapshot("frozen-file-error-390");
  await writeFile(snapshotPath, frozenScript);
  await page.getByRole("button", { name: "重试读取", exact: true }).click();
  await page.getByLabel("冻结内容 experiment.cjs", { exact: true }).waitFor();
  await page
    .getByLabel("冻结内容 experiment.cjs", { exact: true })
    .scrollIntoViewIfNeeded();
  const frozenFileColor = await page
    .locator(".frozen-file-button")
    .first()
    .evaluate((el) => {
      const color = getComputedStyle(el).color;
      const channels = color.match(/\d+/g)?.map(Number);
      return {
        color,
        neutral:
          channels?.[0] === channels?.[1] && channels?.[1] === channels?.[2]
      };
    });
  if (!frozenFileColor.neutral)
    throw new Error(
      `frozen file action has a conflicting color: ${JSON.stringify(frozenFileColor)}`
    );
  await snapshot("frozen-file-390");
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("mobile frozen preview overflow");
  for (let index = 0; index < 12; index++) await page.keyboard.press("Tab");
  if (
    !(await page.evaluate(
      () => !!document.activeElement?.closest("dialog[open]")
    ))
  )
    throw new Error("focus escaped the review dialog");
  await page.getByRole("button", { name: "关闭文件预览", exact: true }).click();
  if (
    !(await page
      .getByRole("button", { name: "查看冻结文件 experiment.cjs", exact: true })
      .evaluate((el) => el === document.activeElement))
  )
    throw new Error("file preview focus did not return");
  await page.keyboard.press("Escape");
  if (
    !(await page
      .locator(".taskbook")
      .getByRole("button", { name: "审阅当前方案", exact: true })
      .evaluate((el) => el === document.activeElement))
  )
    throw new Error("review focus did not return to taskbook");
  await page
    .locator(".taskbook")
    .getByRole("button", { name: "审阅当前方案", exact: true })
    .click();
  await page.getByRole("button", { name: "不采用", exact: true }).click();
  await page
    .getByLabel("撤回原因", { exact: true })
    .fill("准备下一版，保留本次审阅记录");
  await page.getByRole("button", { name: "撤回方案", exact: true }).click();
  await page
    .getByRole("dialog", { name: "审阅运行方案" })
    .waitFor({ state: "hidden" });
  await page
    .locator(".taskbook")
    .getByText("方案已撤回", { exact: true })
    .waitFor();
  await page
    .locator(".taskbook")
    .getByRole("button", { name: "让 Agent 重新准备方案", exact: true })
    .waitFor();
  await snapshot("dismissed-card-390");
  const secondPlan = await page.evaluate(
    (proposal) => window.rw.request("runs.propose", proposal),
    initialPlan.proposal
  );
  await page
    .locator(".taskbook")
    .getByRole("button", { name: "审阅当前方案", exact: true })
    .waitFor();
  await page
    .locator(".taskbook")
    .getByRole("button", { name: "审阅当前方案", exact: true })
    .click();
  const replacement = await page.evaluate(
    (proposal) => window.rw.request("runs.propose", proposal),
    { ...initialPlan.proposal, timeoutSeconds: 20 }
  );
  await page
    .getByRole("dialog", { name: "审阅运行方案" })
    .waitFor({ state: "hidden" });
  const afterReplacement = await page.evaluate(() =>
    window.rw.request("loop.overview")
  );
  if (
    afterReplacement.plans.find((plan) => plan.id === secondPlan.id)?.closure
      ?.replacementPlanId !== replacement.id
  )
    throw new Error("superseded plan did not retain replacement identity");
  const staleApproval = await page.evaluate(async (plan) => {
    try {
      await window.rw.request("runs.approve", {
        id: plan.id,
        digest: plan.digest
      });
      return "unexpected approval";
    } catch (error) {
      return String(error);
    }
  }, secondPlan);
  if (!staleApproval.includes("替代"))
    throw new Error("superseded plan could be approved");
  await page
    .locator(".taskbook")
    .getByRole("button", { name: "审阅当前方案", exact: true })
    .click();
  await page.getByText("20 秒", { exact: true }).waitFor();
  await snapshot("replacement-plan-390");
  await page.keyboard.press("Escape");
  await resize(1440, 900);
  // The ledger strip survives both a new chat turn (cards are cleared) and reload.
  await send("在我批准前请等待。");
  await page
    .getByRole("button", { name: "发送", exact: true })
    .waitFor({ state: "visible" });
  await page.reload();
  await page.getByRole("button", { name: "审阅方案", exact: true }).click();
  await page.getByRole("button", { name: "批准并运行", exact: true }).click();
  await poll(
    () => page.evaluate(() => window.rw.request("loop.overview")),
    (overview) => overview.runs.some((run) => run.state === "succeeded"),
    "verified run completion"
  );
  await page.getByRole("tab", { name: "研究罗盘", exact: true }).click();
  await page.locator(".loop-run-row").first().click();
  await page
    .locator(".metric-results")
    .getByText("4.00000", { exact: true })
    .waitFor();
  await snapshot("run-result-1440");
  await page
    .getByRole("button", { name: "让 Agent 分析结果", exact: true })
    .click();
  const analysisPrompt = await page
    .getByRole("textbox", { name: "给 Research Agent 发消息" })
    .inputValue();
  await send(analysisPrompt);
  await page.getByRole("button", { name: "审阅证据", exact: true }).waitFor();
  await page.getByRole("button", { name: "审阅证据", exact: true }).click();
  await page.getByRole("button", { name: "确认此结论", exact: true }).click();
  await page.getByRole("button", { name: "记录决策", exact: true }).click();
  await page
    .getByLabel("依据与理由", { exact: true })
    .fill("baseline 已验证，下一轮只改变一个因素");
  await page.locator(".decision-form .loop-choices button").first().click();
  await page.getByRole("button", { name: "保存决策", exact: true }).click();
  await page
    .getByText("baseline 已验证，下一轮只改变一个因素", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "编辑方向", exact: true }).click();
  for (const [label, value] of [
    ["研究问题", "轻量算法是否在固定输入上保持正确性并提高指标？"],
    ["约束", "固定输入与两个 seed，单次不超过 30 秒"],
    ["停止条件", "正确性失败或连续两轮无改善"],
    ["下一步", "建立 baseline 后做单变量改动"],
    ["为什么做这一步", "先确定可重复参照"]
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "保存方向", exact: true }).click();
  await page.reload();
  await page.getByRole("tab", { name: "研究罗盘", exact: true }).click();
  await page
    .getByRole("heading", {
      name: "轻量算法是否在固定输入上保持正确性并提高指标？",
      exact: true
    })
    .waitFor();
  await page.getByRole("button", { name: "导出检查点", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "已导出" }).waitFor();
  await page.getByRole("button", { name: "关闭提示", exact: true }).click();
  await page.locator(".loop-skills summary").click();
  await page.getByRole("button", { name: "证据台账", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "已生成 证据台账" })
    .waitFor();
  await page.getByRole("button", { name: "关闭提示", exact: true }).click();
  await page.getByRole("tab", { name: /^实验记录/ }).click();
  await page
    .getByRole("button")
    .filter({ hasText: "固定输入 · 双种子 baseline" })
    .filter({ hasText: "已验证" })
    .click();
  await page.locator(".run-detail").waitFor();
  const checks = [];
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [390, 844]
  ]) {
    await resize(width, height);
    await page
      .getByRole("heading", { name: "研究罗盘", exact: true })
      .scrollIntoViewIfNeeded();
    await snapshot(`compass-${width}`);
    checks.push(
      await page.evaluate(() => ({
        view: "research",
        width: innerWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
        smallText: [...document.querySelectorAll("body *")]
          .filter(
            (el) =>
              el.getClientRects().length &&
              el.textContent.trim() &&
              parseFloat(getComputedStyle(el).fontSize) < 12
          )
          .map((el) => el.className)
      }))
    );
    await page.getByRole("tab", { name: "对话", exact: true }).click();
    await snapshot(`chat-${width}`);
    checks.push(
      await page.evaluate(() => ({
        view: "chat",
        width: innerWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
        smallText: [...document.querySelectorAll("body *")]
          .filter(
            (el) =>
              el.getClientRects().length &&
              el.textContent.trim() &&
              parseFloat(getComputedStyle(el).fontSize) < 12
          )
          .map((el) => el.className)
      }))
    );
    await page.getByRole("tab", { name: "研究罗盘", exact: true }).click();
  }
  await page.getByRole("button", { name: "导出检查点", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  const focus = await page
    .getByRole("button", { name: "导出检查点", exact: true })
    .evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      outline: getComputedStyle(el).outlineStyle
    }));
  if (focus.height < 40 || focus.outline === "none")
    throw new Error("mobile focus/target failed");
  await snapshot("focus-390");
  await page.getByRole("button", { name: "编辑方向", exact: true }).click();
  await page
    .locator(".compass-panel textarea")
    .first()
    .fill("失败后仍保留的草稿");
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("core:request");
    ipcMain.handle("core:request", () => {
      throw new Error("QA: storage unavailable");
    });
  });
  await page.getByRole("button", { name: "保存方向", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "storage unavailable" })
    .waitFor();
  if (
    (await page.locator(".compass-panel textarea").first().inputValue()) !==
    "失败后仍保留的草稿"
  )
    throw new Error("draft lost after save failure");
  await snapshot("save-error-390");
  const record = {
    checks,
    errors,
    toolsUsed,
    saveReload: true,
    failurePreservesDraft: true,
    ledgerSurvivesChatAndReload: true,
    modelCannotApprove: true,
    managedRun: true,
    claimConfirmed: true,
    decision: true,
    export: true,
    frozenVersionRead: true,
    frozenFileErrorRecovery: true,
    frozenFileNeutralAction: true,
    dismissedAndSupersededCards: true,
    mobileReviewFocus: true,
    fonts
  };
  await writeFile(join(output, "report.json"), JSON.stringify(record, null, 2));
  const history = await readFile(join(output, "history.json"), "utf8")
    .then(JSON.parse)
    .catch(() => []);
  history.push({ at: new Date().toISOString(), ...record });
  await writeFile(
    join(output, "history.json"),
    JSON.stringify(history, null, 2)
  );
  if (
    checks.some((check) => check.overflow || check.smallText.length) ||
    errors.length
  )
    throw new Error("UI checks failed; see report.json");
  console.log(JSON.stringify({ output, task, checks, toolsUsed }));
} catch (error) {
  await snapshot("qa-failure").catch(() => {});
  await writeFile(
    join(output, "qa-failure.txt"),
    await page.locator("body").innerText()
  ).catch(() => {});
  throw error;
} finally {
  await app.close();
  endpoint.closeAllConnections();
  await new Promise((done) => endpoint.close(done));
}
