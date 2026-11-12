// Reproducible audit regression against the production Electron/preload/Core.
// Local fixtures own every file, credential placeholder, endpoint and process.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { _electron, expect } from "@playwright/test";

const root = process.cwd();
const output = resolve(".tmp/ui/audit");
await mkdir(output, { recursive: true });
const task = await mkdtemp(join(root, ".tmp", "audit-ui-"));
const workspace = join(task, "100% %E4%"),
  profile = join(task, "profile");
await mkdir(workspace);
await mkdir(profile);
await writeFile(join(workspace, "analysis.py"), "# original disk\n");
for (const args of [
  ["init", "--quiet"],
  ["add", "analysis.py"],
  [
    "-c",
    "user.name=QA",
    "-c",
    "user.email=qa@example.invalid",
    "commit",
    "-qm",
    "fixture"
  ]
]) {
  execFileSync("git", ["-C", workspace, ...args], { windowsHide: true });
}
const pending = new Map();
const requests = [];
const endpoint = createServer((req, res) => {
  let body = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    const payload = JSON.parse(body),
      last = payload.messages.filter((item) => item.role === "user").at(-1);
    const text =
      typeof last.content === "string"
        ? last.content
        : last.content.map((part) => part.text || "").join("");
    const key = text.includes("audit-B") ? "B" : "A";
    requests.push(key);
    res.writeHead(200, { "content-type": "text/event-stream" });
    const chunk = (content, finish_reason = null) =>
      res.write(
        `data: ${JSON.stringify({ id: `audit-${key}`, object: "chat.completion.chunk", created: 1, model: payload.model, choices: [{ index: 0, delta: { content }, finish_reason }] })}\n\n`
      );
    if (text.includes("audit-approval")) {
      if (payload.messages.at(-1).role === "tool") chunk("审批已拒绝", "stop");
      else
        res.write(
          `data: ${JSON.stringify({ id: "approval", object: "chat.completion.chunk", created: 1, model: payload.model, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "audit-command", type: "function", function: { name: "run_command", arguments: JSON.stringify({ command: "node -e \"require('fs').writeFileSync('approval-marker','yes')\"" }) } }] }, finish_reason: "tool_calls" }] })}\n\n`
        );
      res.end("data: [DONE]\n\n");
      return;
    }
    chunk(`${key} partial `);
    pending.set(key, () => {
      chunk(`${key} final`);
      chunk("", "stop");
      res.end("data: [DONE]\n\n");
      pending.delete(key);
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
    model: "gpt-4o-mini",
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
  RW_CORE_BUNDLE: "1",
  RW_API_KEY: "qa-fixture-not-a-secret"
};
for (const name of [
  "ELECTRON_RUN_AS_NODE",
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY"
])
  delete env[name];
const checks = [],
  errors = [];
let app, page;
async function until(read, accept, label) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (accept(await read())) return;
    await new Promise((done) => setTimeout(done, 50));
  }
  throw new Error(`Timed out: ${label}`);
}
const rpc = (method, params) =>
  page.evaluate(({ method, params }) => window.rw.request(method, params), {
    method,
    params
  });
const capture = (name) =>
  page.screenshot({
    path: join(output, `${name}.png`),
    animations: "disabled"
  });
async function resize(width, height) {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setMinimumSize(320, 320);
      window.setContentSize(...size);
    },
    [width, height]
  );
  await until(
    () => page.evaluate(() => innerWidth),
    (actual) => actual === width,
    "viewport"
  );
}
async function layout(name) {
  const result = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    small: [...document.querySelectorAll("body *")]
      .filter(
        (node) =>
          node.getClientRects().length &&
          node.textContent.trim() &&
          parseFloat(getComputedStyle(node).fontSize) < 12
      )
      .map((node) => node.className)
  }));
  assert.equal(result.overflow, false, name);
  assert.deepEqual(result.small, [], name);
}
try {
  app = await _electron.launch({
    executablePath: createRequire(join(root, "apps/desktop/package.json"))(
      "electron"
    ),
    args: [bootstrap],
    cwd: root,
    env,
    timeout: 30_000
  });
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const button = (name) => page.getByRole("button", { name, exact: true });
  const input = () =>
    page.getByRole("textbox", { name: "给 Research Agent 发消息" });
  await expect(input()).toBeEnabled();
  await expect(button("切换研究项目")).toContainText("100% %E4%");
  const { projectId } = await rpc("system.hello");
  const { topic } = await rpc("research.createTopic", {
    title: "隔离课题",
    description: "fixture"
  });
  const { question } = await rpc("research.createQuestion", {
    topicId: topic.id,
    title: "隔离路线"
  });
  for (const title of ["任务 A", "任务 B"])
    await rpc("research.createTask", { routeId: question.id, title });
  await page.reload();
  await expect(input()).toBeEnabled();
  await button("隔离课题").click();
  const pickTask = (name) =>
    page.getByRole("button", { name: new RegExp(name) }).click();
  await pickTask("任务 A");
  await input().fill("audit-A");
  await input().press("Enter");
  await expect(page.locator(".chat-scroll")).toContainText("A partial");
  await pickTask("任务 B");
  await expect(page.locator(".chat-scroll")).not.toContainText("A partial");
  await input().fill("audit-B");
  await input().press("Enter");
  assert.deepEqual(requests, ["A"]);
  pending.get("A")();
  await until(() => pending.has("B"), Boolean, "queued B turn");
  await expect(page.locator(".chat-scroll")).toContainText("B partial");
  await expect(page.locator(".chat-scroll")).not.toContainText("A final");
  pending.get("B")();
  await expect(input()).toBeEnabled();
  await expect(page.locator(".chat-scroll")).toContainText("B final");
  await pickTask("任务 A");
  await expect(page.locator(".chat-scroll")).toContainText("A final");
  await expect(page.locator(".chat-scroll")).not.toContainText("B final");
  await button("新对话").click();
  await expect(page.locator(".chat-scroll")).not.toContainText("A final");
  checks.push(
    "A/B streaming turns, queued runtime, durable transcripts and new conversation isolation"
  );
  await page.getByRole("button", { name: /打开项目 IDE/ }).click();
  await page
    .getByRole("button", { name: /analysis\.py/ })
    .first()
    .click();
  const editor = () =>
    page.locator('.cm-content[contenteditable="true"]').last();
  await editor().fill("# user stale edit\n");
  await writeFile(join(workspace, "analysis.py"), "# agent disk version\n");
  await button("保存").click();
  const conflict = page.locator('[aria-label="文件保存冲突"]');
  await expect(conflict).toBeVisible();
  await expect(page.locator('.code-error[role="alert"]')).not.toContainText(
    /core:request|FILE_CONFLICT/
  );
  assert.equal(
    await readFile(join(workspace, "analysis.py"), "utf8"),
    "# agent disk version\n"
  );
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [390, 844]
  ]) {
    await resize(width, height);
    await layout("file conflict");
    if (width <= 900) {
      const bounds = await conflict.boundingBox();
      assert(
        bounds.width >= width * 0.8,
        "mobile conflict must use the available editor width"
      );
    }
    await expect(button("重新载入磁盘版本")).toBeInViewport();
    await expect(button("明确覆盖此版本")).toBeInViewport();
    await button("重新载入磁盘版本").focus();
    await page.keyboard.press("Tab");
    await expect(button("明确覆盖此版本")).toBeFocused();
    assert.notEqual(
      await button("明确覆盖此版本").evaluate(
        (node) => getComputedStyle(node).outlineStyle
      ),
      "none"
    );
    await capture(`conflict-${width}`);
  }
  await resize(1440, 900);
  page.once("dialog", (dialog) => dialog.accept());
  await button("重新载入磁盘版本").click();
  await expect(editor()).toContainText("agent disk version");
  await editor().fill("# approved overwrite\n");
  await writeFile(
    join(workspace, "analysis.py"),
    "# external second version\n"
  );
  await button("保存").click();
  await expect(conflict).toBeVisible();
  await writeFile(join(workspace, "analysis.py"), "# external third version\n");
  page.once("dialog", (dialog) => dialog.accept());
  await button("明确覆盖此版本").click();
  await expect(conflict).toContainText("external third version");
  assert.equal(
    await readFile(join(workspace, "analysis.py"), "utf8"),
    "# external third version\n"
  );
  page.once("dialog", (dialog) => dialog.accept());
  await button("明确覆盖此版本").click();
  await expect(conflict).toHaveCount(0);
  assert.equal(
    await readFile(join(workspace, "analysis.py"), "utf8"),
    "# approved overwrite\n"
  );
  checks.push(
    "stale save preserves disk; responsive focused diff/reload/explicit overwrite; second external edit also conflicts"
  );
  console.log("[audit-ui] conversation and file conflict checks passed");
  const command = page.getByRole("textbox", { name: "命令", exact: true });
  await command.fill('node -e "setInterval(()=>{},1000)"');
  await button("运行").click();
  await button("取消").click();
  await expect(command).toBeEnabled();
  await expect(page.locator(".terminal-output")).toContainText(
    "command canceled"
  );
  checks.push(
    "direct human terminal cancellation completes without an extra approval"
  );
  await button("对话").click();
  await input().fill("audit-approval");
  await input().press("Enter");
  await expect(page.getByRole("dialog")).toContainText("run_command");
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [390, 844]
  ]) {
    await resize(width, height);
    await layout("approval");
    await capture(`approval-${width}`);
  }
  await resize(1440, 900);
  await button("拒绝").click();
  await expect(input()).toBeEnabled();
  assert.equal(
    await stat(join(workspace, "approval-marker")).then(
      () => true,
      () => false
    ),
    false
  );
  checks.push(
    "Agent command approval stays human-owned; rejection prevents the write"
  );
  assert.deepEqual(errors, []);
  await writeFile(
    join(output, "report.json"),
    JSON.stringify({ passed: checks, errors }, null, 2)
  );
  console.log(JSON.stringify({ output, passed: checks.length, errors }));
} catch (error) {
  if (page) await capture("failure").catch(() => {});
  throw error;
} finally {
  for (const release of pending.values()) release();
  if (page && !page.isClosed()) await rpc("terminal.cancel").catch(() => {});
  await app?.close();
  endpoint.closeAllConnections();
  await new Promise((done) => endpoint.close(done));
}
