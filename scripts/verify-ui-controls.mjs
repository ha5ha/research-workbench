// Shared controls through the actual Electron/Main/preload/Core, isolated settings.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const { _electron: electron } = require(
  process.env.RW_PLAYWRIGHT_MODULE || "playwright"
);
const root = process.cwd();
const output = resolve(
  process.env.RW_QA_OUTPUT ||
    "design/implementation/shared-controls-20261111/controls"
);
await mkdir(output, { recursive: true });
await mkdir(join(root, ".tmp"), { recursive: true });
const task = await mkdtemp(join(root, ".tmp", "controls-"));
const workspace = join(task, "workspace"),
  profile = join(task, "profile");
await mkdir(workspace);
await mkdir(profile);
await writeFile(
  join(workspace, "analysis.py"),
  "# local UI test input\nprint(2 + 3)\n"
);
// Keep Git discovery inside the disposable fixture rather than its parent repo.
await writeFile(
  join(workspace, ".gitignore"),
  ".research/\n.agent/\nuploads/\n"
);
for (const args of [
  ["init", "--quiet", workspace],
  ["-C", workspace, "add", "analysis.py", ".gitignore"],
  [
    "-C",
    workspace,
    "-c",
    "user.name=QA",
    "-c",
    "user.email=qa@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "ui fixture"
  ]
])
  execFileSync(process.env.RW_GIT_BINARY || "git", args, { windowsHide: true });
let responseCount = 0;
const endpoint = createServer((req, res) => {
  let body = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const payload = JSON.parse(body);
    responseCount++;
    res.writeHead(200, { "content-type": "text/event-stream" });
    for (const [delta, finish_reason] of [
      [
        { role: "assistant", content: "已读取目标，可以继续准备科研分析。" },
        null
      ],
      [{}, "stop"]
    ]) {
      res.write(
        `data: ${JSON.stringify({ id: "controls-fixture", object: "chat.completion.chunk", created: 1, model: payload.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`
      );
    }
    res.end("data: [DONE]\n\n");
  });
});
await new Promise((done) => endpoint.listen(0, "127.0.0.1", done));
const baseUrl = `http://127.0.0.1:${endpoint.address().port}/v1`;
await writeFile(
  join(profile, "settings.json"),
  JSON.stringify({
    workspace,
    permissionLevel: "workspace-write",
    provider: "openai-compatible",
    model: "gpt-4o-mini",
    baseUrl
  })
);
const bootstrap = join(task, "bootstrap.cjs");
await writeFile(
  bootstrap,
  `const {app}=require('electron');app.setPath('userData',${JSON.stringify(profile)});app.setAppPath(${JSON.stringify(join(root, "apps/desktop"))});require(${JSON.stringify(join(root, "apps/desktop/out/main/index.cjs"))});`
);
const env = {
  ...process.env,
  RW_API_KEY: "qa-fixture-not-a-secret",
  RW_CORE_BUNDLE: "1"
};
for (const key of [
  "ELECTRON_RUN_AS_NODE",
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY"
])
  delete env[key];
const checks = [],
  errors = [];
const record = (name) => checks.push(name);
const poll = async (read, accept, label, timeout = 15000) => {
  const deadline = Date.now() + timeout;
  let last;
  do {
    last = await read();
    if (accept(last)) return last;
    await new Promise((done) => setTimeout(done, 80));
  } while (Date.now() < deadline);
  throw new Error(`Timed out ${label}: ${JSON.stringify(last)}`);
};
let app, page;
try {
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
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  await page.bringToFront();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const button = (name) => page.getByRole("button", { name, exact: true });
  const model = () => button("选择模型");
  const input = () =>
    page.getByRole("textbox", { name: "给 Research Agent 发消息" });
  const resize = async (width, height) => {
    await app.evaluate(
      ({ BrowserWindow }, size) => {
        const w = BrowserWindow.getAllWindows()[0];
        w.setMinimumSize(320, 320);
        w.setContentSize(...size);
      },
      [width, height]
    );
    await poll(
      () => page.evaluate(() => innerWidth),
      (actual) => actual === width,
      "viewport"
    );
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done))
        )
    );
  };
  const capture = (name) =>
    page.screenshot({
      path: join(output, name + ".png"),
      animations: "disabled"
    });
  const layout = async (name) => {
    await poll(
      () =>
        page.evaluate(() =>
          [...document.querySelectorAll(".ui-popover-panel")].every((el) => {
            const r = el.getBoundingClientRect();
            return (
              r.x >= 11 &&
              r.y >= 11 &&
              r.right <= innerWidth - 11 &&
              r.bottom <= innerHeight - 11
            );
          })
        ),
      Boolean,
      "overlay repositioned"
    );
    const result = await page.evaluate(() => ({
      width: innerWidth,
      overflow: document.documentElement.scrollWidth > innerWidth,
      small: [...document.querySelectorAll("body *")]
        .filter(
          (el) =>
            el.getClientRects().length &&
            el.textContent.trim() &&
            parseFloat(getComputedStyle(el).fontSize) < 12
        )
        .map((el) => el.className),
      menus: [...document.querySelectorAll(".ui-popover-panel")].map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      }),
      tiny: [
        ...document.querySelectorAll(
          ".ui-button,.ui-menu-item,.combo-option,.combo-toggle,.switch"
        )
      ]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.width &&
            r.height &&
            r.height < (innerWidth <= 900 ? 40 : 32) - 0.1
          );
        })
        .map((el) => ({
          name: el.getAttribute("aria-label") || el.textContent,
          rect: el.getBoundingClientRect().toJSON()
        }))
    }));
    assert.equal(result.overflow, false);
    assert.deepEqual(result.small, []);
    assert.deepEqual(result.tiny, []);
    for (const m of result.menus) {
      assert.ok(m.x >= 11 && m.y >= 11 && m.right <= result.width - 11);
      const height = await page.evaluate(() => innerHeight);
      assert.ok(m.bottom <= height - 11);
    }
    record(
      `${name}: ${result.width}px, readable text, control targets, viewport boundaries`
    );
  };
  const core = () =>
    poll(
      () => page.evaluate(() => window.rw.status()),
      (s) => s?.state === "online",
      "Core online"
    );
  await core();
  await poll(() => input().isEnabled(), Boolean, "composer ready");
  await resize(1440, 900);
  await layout("empty");
  // The native pointer survives sequential Electron launches. Establish a real
  // non-hover baseline before comparing the hovered state on this window.
  await page.mouse.move(400, 150);
  await poll(
    () => model().evaluate((el) => el.matches(":hover")),
    (hovered) => !hovered,
    "pointer outside model control"
  );
  await capture("default-1440");
  const defaultBg = await model().evaluate(
    (el) => getComputedStyle(el).backgroundColor
  );
  await model().hover();
  await poll(
    async () => {
      // A native resize may commit its compositor hit-test map after the DOM
      // layout. Re-send actual pointer input until the observable hover lands.
      await model().hover();
      return model().evaluate((el) => ({
        hovered: el.matches(":hover"),
        color: getComputedStyle(el).backgroundColor
      }));
    },
    ({ hovered, color }) => hovered && color !== defaultBg,
    "hover feedback"
  );
  await capture("hover-1440");
  record("hover has a visible neutral state");
  await model().focus();
  await model().press("ArrowDown");
  const menu = page.getByRole("menu", { name: "选择模型" });
  await menu.waitFor();
  assert.equal(
    await page
      .getByRole("menuitemradio", { name: "deepseek-flash", exact: true })
      .evaluate((el) => el === document.activeElement),
    true
  );
  await page.keyboard.press("End");
  assert.match(
    await page.evaluate(() => document.activeElement.textContent),
    /自定义模型/
  );
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await page
      .getByRole("menuitemradio", { name: "deepseek-reasoner", exact: true })
      .evaluate((el) => el === document.activeElement),
    true
  );
  await capture("model-open-1440");
  await layout("keyboard model menu");
  await page.keyboard.press("Escape");
  assert.equal(
    await model().evaluate((el) => el === document.activeElement),
    true
  );
  await model().press("ArrowUp");
  assert.match(
    await page.evaluate(() => document.activeElement.textContent),
    /自定义模型/
  );
  await page.keyboard.press("Escape");
  await model().click();
  assert.equal(
    await page
      .getByRole("menuitemradio", { name: "deepseek-flash", exact: true })
      .evaluate((el) => el === document.activeElement),
    true
  );
  await input().click();
  assert.equal(await menu.count(), 0);
  record(
    "menu Arrow/Home/End, pointer reset, Escape focus return and outside close"
  );
  await model().click();
  await page
    .getByRole("menuitemradio", { name: "gpt-4.1-mini", exact: true })
    .click();
  await poll(
    () => page.evaluate(() => window.rw.getSettings()),
    (s) => s.model === "gpt-4.1-mini",
    "model persisted"
  );
  await poll(
    () => model().innerText(),
    (s) => s.includes("gpt-4.1-mini"),
    "header model updated"
  );
  assert.match(await button("输入区选择模型").innerText(), /gpt-4.1-mini/);
  await model().click();
  assert.equal(
    await page
      .getByRole("menuitemradio", { name: "gpt-4.1-mini", exact: true })
      .getAttribute("aria-checked"),
    "true"
  );
  await page.keyboard.press("Tab");
  assert.equal(await menu.count(), 0);
  record(
    "both model selectors share persisted model state; selected semantics and Tab close"
  );
  await button("Agent 权限").click();
  const permission = page.getByRole("dialog", { name: "Agent 权限" });
  await permission.getByRole("radio", { name: /仅可查看/ }).click();
  await permission.getByRole("button", { name: "取消", exact: true }).click();
  assert.equal(
    (await page.evaluate(() => window.rw.getSettings())).permissionLevel,
    "workspace-write"
  );
  await button("Agent 权限").click();
  assert.equal(
    await permission
      .getByRole("radio", { name: /工作区内修改/ })
      .getAttribute("aria-checked"),
    "true"
  );
  await permission.getByRole("radio", { name: /工作区内修改/ }).focus();
  await page.keyboard.press("Home");
  await capture("permission-1440");
  await permission.getByRole("button", { name: "应用", exact: true }).click();
  await poll(
    () => page.evaluate(() => window.rw.getSettings()),
    (s) => s.permissionLevel === "read-only",
    "permission persisted"
  );
  await poll(
    () => button("Agent 权限").innerText(),
    (s) => s.includes("仅可查看"),
    "permission label"
  );
  record(
    "permission draft cancellation resets; radio keyboard selection and apply persist"
  );
  await button("历史会话").click();
  await page.getByText("还没有保存的会话。", { exact: true }).waitFor();
  await capture("history-empty-1440");
  await page.keyboard.press("Escape");
  await input().fill("梳理科研分析目标");
  await input().press("Enter");
  await poll(
    () => responseCount,
    (n) => n === 1,
    "one local model response"
  );
  await poll(() => input().isEnabled(), Boolean, "reply complete");
  await button("历史会话").click();
  await page.locator(".history-row").first().waitFor();
  await capture("history-1440");
  await page.keyboard.press("Escape");
  record("history empty and saved-session states render through real Core");
  await button("切换研究项目").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.getByRole("complementary", { name: "项目详情" }).waitFor();
  await button("关闭项目详情").last().click();
  record("project menu keyboard opens project details");
  await model().click();
  await page
    .getByRole("menuitem", { name: "自定义模型与 API Key…", exact: true })
    .click();
  await page.getByRole("combobox", { name: "模型", exact: true }).waitFor();
  const combo = page.getByRole("combobox", { name: "模型", exact: true });
  await combo.focus();
  await combo.press("ArrowDown");
  await combo.press("End");
  const beforeIME = await combo.inputValue();
  await combo.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    keyCode: 229,
    bubbles: true,
    cancelable: true
  });
  assert.equal(await combo.inputValue(), beforeIME);
  await combo.press("Enter");
  assert.equal(await combo.inputValue(), "o4-mini");
  assert.equal(
    await combo.evaluate((el) => el === document.activeElement),
    true
  );
  await combo.press("ArrowDown");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("listbox").count(), 0);
  await button("关闭设置").waitFor();
  await combo.fill("");
  assert.equal(await button("保存并应用").isDisabled(), true);
  await capture("settings-disabled-1440");
  const longModel = "research-model-with-a-deliberately-long-custom-name-2026";
  await combo.fill(longModel);
  const endpointInput = page.getByLabel("接口地址", { exact: true });
  await endpointInput.fill("invalid-url");
  await button("保存并应用").click();
  await page.getByRole("alert").waitFor();
  assert.equal(await combo.inputValue(), longModel);
  assert.equal(await endpointInput.inputValue(), "invalid-url");
  await capture("settings-error-1440");
  assert.equal(
    (await page.evaluate(() => window.rw.getSettings())).model,
    "gpt-4.1-mini"
  );
  await endpointInput.fill(baseUrl);
  await button("保存并应用").click();
  await poll(
    () => page.evaluate(() => window.rw.getSettings()),
    (s) => s.model === longModel,
    "custom model save"
  );
  record(
    "editable combo keyboard and IME; disabled save; rejected save preserves values and persisted config"
  );
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [390, 844]
  ]) {
    await resize(width, height);
    await combo.focus();
    await combo.press("ArrowDown");
    await layout("settings combo open");
    await capture(`settings-${width}`);
    await page.keyboard.press("Escape");
  }
  await button("关闭设置").click();
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [390, 844]
  ]) {
    await resize(width, height);
    await layout("long custom model");
    await capture(`chat-${width}`);
    await model().click();
    await layout("model open with long label");
    await capture(`model-${width}`);
    await page.keyboard.press("Escape");
    await button("Agent 权限").click();
    await layout("permission open");
    await capture(`permission-${width}`);
    await page.keyboard.press("Escape");
  }
  await resize(1440, 900);
  await model().click();
  await app.evaluate(({ webContents }) =>
    webContents
      .getAllWebContents()
      .find((w) => w.getType() === "window")
      .setZoomFactor(2)
  );
  await poll(
    () => page.evaluate(() => innerWidth),
    (w) => w === 720,
    "200 percent zoom"
  );
  await layout("200 percent model controls");
  // Electron zoom changes CSS screenshot coordinates; capture the native window
  // so the 200% evidence includes the entire physical viewport.
  const zoomImage = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].capturePage())
      .toPNG()
      .toString("base64")
  );
  await writeFile(
    join(output, "controls-200pct.png"),
    Buffer.from(zoomImage, "base64")
  );
  await page.keyboard.press("Escape");
  await app.evaluate(({ webContents }) =>
    webContents
      .getAllWebContents()
      .find((w) => w.getType() === "window")
      .setZoomFactor(1)
  );
  await poll(
    () => page.evaluate(() => innerWidth),
    (w) => w === 1440,
    "zoom reset"
  );
  await page.reload();
  await core();
  await poll(
    () => model().innerText(),
    (t) => t.includes(longModel),
    "reload model readback"
  );
  assert.match(await button("Agent 权限").innerText(), /仅可查看/);
  record(
    "renderer reload reads back model and permission through persisted settings"
  );
  await button("选择模型").click();
  await page
    .getByRole("menuitem", { name: "自定义模型与 API Key…", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "设置分类" })
    .getByRole("button", { name: /Git/ })
    .click();
  const toggle = page.getByRole("switch");
  await toggle.waitFor();
  const initial = await toggle.getAttribute("aria-checked");
  await toggle.focus();
  await toggle.press("Space");
  assert.notEqual(await toggle.getAttribute("aria-checked"), initial);
  await capture("switch-1440");
  record("switch has a full keyboard target and checked feedback");
  if (process.env.RW_QA_SURFACES === "1") {
    for (const [width, height] of [
      [1440, 900],
      [1024, 768],
      [390, 844]
    ]) {
      await resize(width, height);
      for (const section of [
        "模型",
        "权限",
        "工作区",
        "Git",
        "SSH",
        "检测",
        "关于"
      ]) {
        await page
          .getByRole("navigation", { name: "设置分类" })
          .getByRole("button", { name: new RegExp(`^${section}`) })
          .click();
        await page.locator(".settings-content").evaluate((el) => {
          el.scrollTop = 0;
        });
        const neutralSelection = await page.evaluate(() =>
          [
            ...document.querySelectorAll(
              ".protocol-card.selected, .protocol-card.selected .protocol-mark, .perm-row.selected, .perm-check, .ssh-profile-row.selected, .settings-sidebar"
            )
          ]
            .filter((el) => el.getClientRects().length)
            .every((el) =>
              ["backgroundColor", "color", "borderTopColor"].every(
                (property) => {
                  const value = getComputedStyle(el)
                    [property].match(/[\d.]+/g)
                    ?.map(Number);
                  return (
                    !value ||
                    value[3] === 0 ||
                    (value[0] === value[1] && value[1] === value[2])
                  );
                }
              )
            )
        );
        assert.equal(
          neutralSelection,
          true,
          `${section}: resting selection uses neutral colors`
        );
        await layout(`settings ${section}`);
        await capture(`surface-settings-${section}-${width}`);
      }
    }
    await resize(1440, 900);
  }
  await button("关闭设置").click();
  await page.getByRole("button", { name: /打开项目 IDE/ }).click();
  await button("刷新文件与 Git").waitFor();
  await button("刷新文件与 Git").click();
  await capture("code-1440");
  if (process.env.RW_QA_SURFACES === "1") {
    await page.getByRole("button", { name: /analysis\.py/ }).click();
    await page.locator(".cm-editor").waitFor();
    await capture("surface-code-file-1440");
    await page.locator(".cm-content").click();
    await capture("surface-code-focused-1440");
    const editorStyle = await page.locator(".cm-editor").evaluate((el) => ({
      background: getComputedStyle(el).backgroundColor,
      focused: el.classList.contains("cm-focused"),
      outline: getComputedStyle(el).outlineWidth
    }));
    assert.equal(editorStyle.background, "rgb(255, 255, 255)");
    assert.equal(editorStyle.focused, true);
    assert.equal(editorStyle.outline, "2px");
    record(
      "real code workspace: neutral editor background and visible focused frame"
    );
  }
  await page.getByRole("button", { name: "对话", exact: true }).click();
  for (const redundant of [
    "真实模型会话",
    "工作区执行",
    "可添加 PDF / 表格 / 文本"
  ])
    assert.equal(await page.getByText(redundant, { exact: true }).count(), 0);
  assert.equal(await page.locator(".message-meta span").count(), 0);
  if (process.env.RW_QA_SURFACES === "1") {
    for (const [width, height] of [
      [1440, 900],
      [1024, 768],
      [390, 844]
    ]) {
      await resize(width, height);
      await button("项目详情").click();
      await layout("project details");
      await capture(`surface-project-${width}`);
      await page
        .locator("#project-inspector")
        .getByRole("button", { name: "关闭项目详情", exact: true })
        .click();
      await page.getByRole("tab", { name: /^实验记录/ }).click();
      await layout("empty experiment records");
      await capture(`surface-records-empty-${width}`);
      await page.getByRole("tab", { name: "对话", exact: true }).click();
    }
    await resize(1440, 900);
  }
  // Force async edge states only in a separate, browser-only fixture window.
  // The production preload/Core are deliberately absent from this window.
  const fixture = join(task, "state-fixture");
  await mkdir(fixture);
  const desktopRequire = createRequire(join(root, "apps/desktop/package.json"));
  await build({
    entryPoints: [join(root, "scripts/fixtures/control-state-harness.tsx")],
    outfile: join(fixture, "fixture.js"),
    bundle: true,
    jsx: "automatic",
    platform: "browser",
    alias: {
      react: dirname(desktopRequire.resolve("react/package.json")),
      "react-dom": dirname(desktopRequire.resolve("react-dom/package.json"))
    },
    define: { "process.env.NODE_ENV": '"production"' }
  });
  const fixtureHtml = join(fixture, "index.html");
  await writeFile(
    fixtureHtml,
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>'
  );
  const newWindow = app.waitForEvent("window");
  await app.evaluate(async ({ BrowserWindow }, path) => {
    const win = new BrowserWindow({
      width: 700,
      height: 550,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    await win.loadFile(path);
  }, fixtureHtml);
  const fixturePage = await newWindow;
  const history = fixturePage.getByRole("button", {
    name: "历史会话",
    exact: true
  });
  await history.click();
  await fixturePage.getByRole("status").waitFor();
  await fixturePage.screenshot({ path: join(output, "history-loading.png") });
  await fixturePage.evaluate(() => window.controlStateQA.reject(0));
  await fixturePage.getByRole("alert").waitFor();
  await fixturePage.screenshot({ path: join(output, "history-error.png") });
  await fixturePage
    .getByRole("menuitem", { name: "重新读取", exact: true })
    .click();
  await fixturePage.evaluate(() =>
    window.controlStateQA.resolve(1, "恢复后的会话")
  );
  await fixturePage.getByRole("menuitem", { name: /恢复后的会话/ }).waitFor();
  await fixturePage.keyboard.press("Escape");
  await history.click();
  await poll(
    () => fixturePage.evaluate(() => window.controlStateQA.count()),
    (n) => n === 3,
    "third history request"
  );
  await fixturePage.getByRole("status").waitFor();
  await fixturePage.keyboard.press("Escape");
  await fixturePage.getByRole("menu").waitFor({ state: "hidden" });
  await history.click();
  await poll(
    () => fixturePage.evaluate(() => window.controlStateQA.count()),
    (n) => n === 4,
    "fourth history request"
  );
  await fixturePage.evaluate(() =>
    window.controlStateQA.resolve(3, "最新会话")
  );
  await fixturePage.getByRole("menuitem", { name: /最新会话/ }).waitFor();
  await fixturePage.evaluate(() =>
    window.controlStateQA.resolve(2, "过期会话")
  );
  assert.equal(
    await fixturePage.getByText("过期会话", { exact: true }).count(),
    0
  );
  await fixturePage.getByRole("menuitem", { name: /最新会话/ }).click();
  assert.equal(
    await fixturePage.evaluate(() => window.controlStateQA.opened()),
    1
  );
  await fixturePage.getByRole("radio", { name: "分析", exact: true }).focus();
  await fixturePage.keyboard.press("ArrowRight");
  assert.equal(
    await fixturePage
      .getByRole("radio", { name: "结果", exact: true })
      .getAttribute("aria-checked"),
    "true"
  );
  assert.equal(
    await fixturePage
      .getByRole("radio", { name: "结果", exact: true })
      .evaluate((el) => el === document.activeElement),
    true
  );
  await fixturePage.screenshot({ path: join(output, "history-recovered.png") });
  if (process.env.RW_QA_SURFACES === "1") {
    await fixturePage
      .getByRole("button", { name: "查看差异配色", exact: true })
      .click();
    await fixturePage.locator(".cm-merge-b .cm-changedText").waitFor();
    const diffColors = await fixturePage.evaluate(() => {
      const color = (selector) =>
        getComputedStyle(document.querySelector(selector)).backgroundColor;
      const token = (name) => {
        const node = document.createElement("div");
        node.style.backgroundColor = `var(${name})`;
        document.body.append(node);
        const result = getComputedStyle(node).backgroundColor;
        node.remove();
        return result;
      };
      return {
        deleted: color(".cm-merge-a .cm-changedText"),
        inserted: color(".cm-merge-b .cm-changedText"),
        expectedDelete: token("--diff-delete"),
        expectedAdd: token("--diff-add"),
        editor: color(".cm-editor"),
        expectedEditor: token("--bg")
      };
    });
    assert.equal(diffColors.deleted, diffColors.expectedDelete);
    assert.equal(diffColors.inserted, diffColors.expectedAdd);
    assert.notEqual(diffColors.deleted, diffColors.inserted);
    assert.equal(diffColors.editor, diffColors.expectedEditor);
    await fixturePage.screenshot({
      path: join(output, "surface-diff-theme.png")
    });
    record(
      "isolated CodeMirror fixture: neutral editor and distinct addition/deletion tokens"
    );
  }
  await fixturePage.close();
  record(
    "isolated component fixture: loading/error/retry, stale async result rejected, session opens once, segmented keyboard"
  );
  assert.deepEqual(errors, []);
  const hashes = {};
  for (const file of [
    "apps/desktop/out/main/index.cjs",
    "apps/desktop/out/renderer/index.html",
    ...(await readdir(join(root, "apps/desktop/out/renderer/assets"))).map(
      (f) => `apps/desktop/out/renderer/assets/${f}`
    ),
    "packages/ui/src/Popover.tsx",
    "packages/ui/src/tokens.css",
    "packages/ui/src/components.css",
    "apps/desktop/src/renderer/src/styles.css",
    "apps/desktop/src/renderer/src/research-loop.css",
    "apps/desktop/src/renderer/src/editor-theme.ts",
    "packages/ui/vendor/lucide/SOURCES.json",
    "scripts/verify-ui-controls.mjs",
    "scripts/fixtures/control-state-harness.tsx"
  ]) {
    hashes[file] = createHash("sha256")
      .update(await readFile(join(root, file)))
      .digest("hex");
  }
  await writeFile(
    join(output, "report.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        checks,
        errors,
        hashes,
        modelRequests: responseCount,
        fixture:
          "local deterministic SSE; isolated disposable workspace/settings",
        scope: "source UI increment; portable not rebuilt"
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ output, passed: checks.length, errors }));
} catch (error) {
  if (page) {
    await page
      .screenshot({ path: join(output, "failure.png") })
      .catch(() => {});
    await writeFile(
      join(output, "failure.txt"),
      await page.locator("body").innerText()
    ).catch(() => {});
  }
  throw error;
} finally {
  await app?.close();
  endpoint.closeAllConnections();
  await new Promise((done) => endpoint.close(done));
}
