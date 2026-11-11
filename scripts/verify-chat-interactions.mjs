// Real Electron/Main/preload/Core chat interactions; deterministic local SSE only.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { _electron: electron } = require(
  process.env.RW_PLAYWRIGHT_MODULE || "playwright"
);
const root = process.cwd();
const output = resolve(
  process.env.RW_QA_OUTPUT ||
    "design/implementation/openresearch-reuse-20261111"
);
await mkdir(output, { recursive: true });
await mkdir(join(root, ".tmp"), { recursive: true });
const task = await mkdtemp(join(root, ".tmp", "chat-interactions-"));
const workspace = join(task, "workspace"),
  profile = join(task, "profile");
await mkdir(workspace);
await mkdir(profile);
const requests = [];
const endpoint = createServer((req, res) => {
  let body = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const payload = JSON.parse(body);
    res.writeHead(200, { "content-type": "text/event-stream" });
    const chunk = (delta, finish_reason = null) =>
      res.write(
        `data: ${JSON.stringify({
          id: "chat-interactions",
          object: "chat.completion.chunk",
          created: 1,
          model: payload.model,
          choices: [{ index: 0, delta, finish_reason }]
        })}\n\n`
      );
    chunk({ role: "assistant" });
    requests.push({
      append: (text) => chunk({ content: text }),
      finish: () => {
        chunk({}, "stop");
        res.end("data: [DONE]\n\n");
      }
    });
  });
});
await new Promise((done) => endpoint.listen(0, "127.0.0.1", done));
await writeFile(
  join(profile, "settings.json"),
  JSON.stringify({
    workspace,
    permissionLevel: "workspace-write",
    provider: "openai-compatible",
    model: "qa-local-fixture",
    baseUrl: `http://127.0.0.1:${endpoint.address().port}/v1`
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
for (const name of [
  "ELECTRON_RUN_AS_NODE",
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY"
])
  delete env[name];
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
  throw new Error(`Timed out: ${label}; ${JSON.stringify(last)}`);
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
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const input = page.getByRole("textbox", { name: "给 Research Agent 发消息" });
  const region = page.getByRole("region", { name: "对话记录", exact: true });
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => requestAnimationFrame(done))
          )
        )
    );
  const position = () =>
    region.evaluate((el) => ({
      top: el.scrollTop,
      gap: el.scrollHeight - el.scrollTop - el.clientHeight,
      height: el.scrollHeight
    }));
  const bottom = () =>
    poll(position, (p) => p.gap <= 1, "transcript at bottom");
  const resize = async (width, height) => {
    await app.evaluate(
      ({ BrowserWindow }, size) => {
        const win = BrowserWindow.getAllWindows()[0];
        win.setMinimumSize(320, 320);
        win.setContentSize(...size);
      },
      [width, height]
    );
    await poll(
      () => page.evaluate(() => innerWidth),
      (actual) => actual === width,
      "viewport width"
    );
    await settle();
  };
  const screenshot = (name) =>
    page.screenshot({
      path: join(output, name + ".png"),
      animations: "disabled"
    });
  const layout = async (name) => {
    const check = await page.evaluate(() => ({
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
    }));
    assert.equal(check.overflow, false);
    assert.deepEqual(check.smallText, []);
    record(`${name}: ${check.width}px, no overflow or text below 12px`);
  };
  const append = async (request, text) => {
    request.append(text);
    await poll(
      () => page.locator(".live-prose").last().innerText(),
      (actual) => actual.includes(text.trim()),
      "stream chunk rendered"
    );
    await settle();
  };
  const longText = (label) =>
    Array.from(
      { length: 70 },
      (_, i) =>
        `${label} ${i + 1}：固定科研输入，用脚本复核数值和来源，保留分析的适用范围与未决问题。\n`
    ).join("");
  const scrollUp = async () => {
    const box = await region.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -500);
    await poll(position, (p) => p.gap > 200, "wheel scrolled away");
    await settle();
    return (await position()).top;
  };
  await poll(
    () => page.evaluate(() => window.rw.status()),
    (s) => s.state === "online",
    "Core online"
  );
  await poll(() => input.isEnabled(), Boolean, "composer enabled");
  await page.evaluate(() => document.fonts.ready);
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [390, 844]
  ]) {
    await resize(width, height);
    await layout("empty");
    await screenshot(`empty-${width}`);
  }
  await resize(1440, 900);
  await input.fill("中文候选确认");
  for (const event of [
    { isComposing: true, keyCode: 13 },
    { isComposing: false, keyCode: 229 }
  ]) {
    await input.dispatchEvent("keydown", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      cancelable: true,
      ...event
    });
    await settle();
    assert.equal(await input.isEnabled(), true);
    assert.equal(await input.inputValue(), "中文候选确认");
    assert.equal(requests.length, 0);
  }
  record("isComposing and legacy keyCode=229 do not send");
  await input.press("Shift+Enter");
  assert.match(await input.inputValue(), /\n/);
  assert.equal(requests.length, 0);
  record("Shift+Enter inserts a newline");
  await input.fill("输入法保护验证：分析科研记录");
  await input.press("Enter");
  await poll(
    () => requests.length,
    (n) => n === 1,
    "exactly one Enter request"
  );
  await append(requests[0], longText("分析段落"));
  await bottom();
  await append(requests[0], "底部跟随检查：保留来源。\n");
  await bottom();
  record("Enter sends once; streamed growth follows bottom");
  const reading = await scrollUp();
  await append(requests[0], longText("继续分析"));
  assert.ok(
    Math.abs((await position()).top - reading) <= 1,
    "stream interrupted history reading"
  );
  record("wheel scroll preserves reading position during streaming");
  await region.press("Home");
  await poll(position, (p) => p.top <= 1, "keyboard Home");
  await append(requests[0], "键盘阅读保位检查。\n");
  assert.ok((await position()).top <= 1);
  record("keyboard history reading is preserved");
  await region.press("End");
  await bottom();
  await append(requests[0], "回到底部后恢复跟随。\n");
  await bottom();
  record("keyboard End restores following");
  await region.evaluate((el) => {
    el.scrollTop = el.scrollHeight - el.clientHeight - 59;
  });
  await settle();
  await append(requests[0], longText("60px阈值"));
  await bottom();
  record("59px from bottom retains upstream follow threshold");
  for (const [width, height] of [
    [1024, 768],
    [390, 844],
    [1440, 900]
  ]) {
    await resize(width, height);
    await bottom();
  }
  record("viewport changes keep a pinned transcript at bottom");
  const paused = await scrollUp();
  await resize(1024, 768);
  assert.ok((await position()).gap > 200, "resize repinned history reading");
  await append(requests[0], "上翻期间改变窗口仍保持阅读位置。\n");
  assert.ok(Math.abs((await position()).top - paused) <= 1);
  await resize(1440, 900);
  record("viewport changes do not repin a paused transcript");
  requests[0].finish();
  await poll(() => input.isEnabled(), Boolean, "turn finished");
  await settle();
  assert.ok(
    Math.abs((await position()).top - paused) <= 1,
    "finishing turn interrupted reading"
  );
  record("final message replacement preserves paused reading");
  await input.fill("手动发送后跟随新回复");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await poll(
    () => requests.length,
    (n) => n === 2,
    "send button request"
  );
  await append(requests[1], "新回复已保留。\n");
  requests[1].finish();
  await poll(() => input.isEnabled(), Boolean, "second turn finished");
  await bottom();
  record("send button repins after reading history");
  await page.getByRole("button", { name: "新对话", exact: true }).click();
  await page.getByRole("heading", { name: "今天想研究什么？" }).waitFor();
  await input.fill("第二个独立会话");
  await input.press("Enter");
  await poll(
    () => requests.length,
    (n) => n === 3,
    "new session request"
  );
  await append(requests[2], longText("第二会话"));
  requests[2].finish();
  await poll(() => input.isEnabled(), Boolean, "new session finished");
  await bottom();
  record("new conversation follows its own transcript");
  const beforeCancel = await scrollUp();
  const oldSession = () =>
    page.locator(".history-row").filter({ hasText: "输入法保护验证" }).first();
  await page.getByRole("button", { name: "历史会话", exact: true }).click();
  await oldSession().waitFor();
  page.once("dialog", (dialog) => dialog.dismiss());
  await oldSession().click();
  await settle();
  assert.ok(Math.abs((await position()).top - beforeCancel) <= 1);
  record("cancelled history switch preserves reading position");
  await page.getByRole("button", { name: "历史会话", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await oldSession().click();
  await poll(
    () => page.locator(".live-user").first().innerText(),
    (text) => text.includes("输入法保护验证"),
    "old session loaded"
  );
  await bottom();
  record("successful history switch repins loaded transcript");
  await page.reload();
  await poll(() => input.isEnabled(), Boolean, "reloaded composer");
  await poll(
    () => page.locator(".live-prose").first().innerText(),
    (text) => text.includes("分析段落"),
    "persisted transcript"
  );
  await bottom();
  assert.equal(requests.length, 3, "reload resent a prompt");
  record("renderer reload restores transcript without another model request");
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [390, 844]
  ]) {
    await resize(width, height);
    await bottom();
    await region.press("End");
    const outline = await region.evaluate(
      (el) => getComputedStyle(el).outlineStyle
    );
    assert.notEqual(outline, "none", "transcript keyboard focus invisible");
    await layout("long transcript + visible keyboard focus");
    await screenshot(`transcript-${width}`);
  }
  assert.deepEqual(errors, []);
  const hashes = {};
  const hashFile = async (file) => {
    hashes[relative(root, file).replaceAll("\\", "/")] = createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  };
  for (const file of [
    "apps/desktop/out/main/index.cjs",
    "apps/desktop/out/renderer/index.html",
    "apps/desktop/resources/core/cli.mjs",
    "apps/desktop/src/renderer/src/views/ChatView.tsx",
    "THIRD_PARTY_NOTICES.md"
  ])
    await hashFile(join(root, file));
  for (const file of await readdir(
    join(root, "apps/desktop/out/renderer/assets")
  ))
    await hashFile(join(root, "apps/desktop/out/renderer/assets", file));
  await writeFile(
    join(output, "report.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        provider: "local deterministic SSE fixture",
        modelRequests: requests.length,
        checks,
        errors,
        hashes,
        scope:
          "Renderer interaction increment after the accepted 1.0 portable; no real-provider, SSH or new portable acceptance"
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify({
      output,
      passed: checks.length,
      modelRequests: requests.length
    })
  );
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
