import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  safeStorage
} from "electron";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { CoreBridge, type CoreStatus } from "./core-bridge.js";
import type { RpcEvent } from "@research-workbench/contracts";

const ALLOWED_METHODS = new Set([
  "system.hello",
  "skills.list",
  "skills.run",
  "domain.observe",
  "domain.actions",
  "domain.apply",
  "agent.spike",
  "agent.chat",
  "approval.respond",
  "workspace.tree",
  "workspace.read",
  "workspace.write",
  "terminal.run",
  "experiments.list",
  "experiments.get",
  "git.status",
  "git.diff",
  "git.stage",
  "git.unstage",
  "git.commit",
  "git.log",
  "lsp.start",
  "lsp.status"
]);

let mainWindow: BrowserWindow | null = null;
let core: CoreBridge | undefined;
let currentWorkspace = "";
let defaultWorkspace = "";

interface StoredSettings {
  encryptedApiKey?: string;
  workspace?: string;
  provider?: "deepseek" | "openai-compatible";
  baseUrl?: string;
  model?: string;
  gitBinary?: string;
  autoCommit?: boolean;
}

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-flash";

function settingsPath(): string {
  return join(app.getPath("userData"), "settings.json");
}

async function readStoredSettings(): Promise<StoredSettings> {
  try {
    const text = await readFile(settingsPath(), "utf8");
    return JSON.parse(text.replace(/^\uFEFF/, "")) as StoredSettings;
  } catch {
    return {};
  }
}

async function writeStoredSettings(settings: StoredSettings): Promise<void> {
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2), {
    encoding: "utf8",
    mode: 0o600
  });
}

function decryptSavedApiKey(settings: StoredSettings): string | null {
  if (!settings.encryptedApiKey) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(
      Buffer.from(settings.encryptedApiKey, "base64")
    );
  } catch {
    return null;
  }
}

async function settingsSummary(): Promise<{
  hasApiKey: boolean;
  apiKeySource: "saved" | "env" | "none";
  provider: "deepseek" | "openai-compatible";
  baseUrl: string;
  model: string;
  workspace: string;
  isDefaultWorkspace: boolean;
  gitBinary: string;
  autoCommit: boolean;
}> {
  const stored = await readStoredSettings();
  const saved = decryptSavedApiKey(stored);
  const envKey = process.env.RW_API_KEY || process.env.DEEPSEEK_API_KEY;
  return {
    hasApiKey: Boolean(saved || envKey),
    apiKeySource: saved ? "saved" : envKey ? "env" : "none",
    provider: stored.provider ?? "deepseek",
    baseUrl: stored.baseUrl ?? DEFAULT_BASE_URL,
    model: stored.model ?? DEFAULT_MODEL,
    workspace: currentWorkspace,
    isDefaultWorkspace: currentWorkspace === defaultWorkspace,
    gitBinary: stored.gitBinary ?? "",
    autoCommit: stored.autoCommit ?? false
  };
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.setName("Research Workbench");

function findRepoRoot(): string {
  const candidates = [
    app.getAppPath(),
    resolve(app.getAppPath(), "../.."),
    process.cwd(),
    resolve(process.cwd(), "../..")
  ];
  return (
    candidates.find((candidate) =>
      existsSync(join(candidate, "apps/core/src/cli.ts"))
    ) ?? app.getAppPath()
  );
}

function configureLspServer(): void {
  const candidate = app.isPackaged
    ? join(process.resourcesPath, "lsp", "cli.mjs")
    : join(app.getAppPath(), "resources", "lsp", "cli.mjs");
  process.env.RW_LSP_SERVER = existsSync(candidate) ? candidate : "";
}

function resolveCoreLaunch(
  workspace: string
): { command: string; args: string[]; cwd: string; env?: Record<string, string> } | undefined {
  const useBundled = app.isPackaged || process.env.RW_CORE_BUNDLE === "1";
  if (!useBundled) return undefined;

  const resourcesRoot = app.isPackaged
    ? process.resourcesPath
    : join(app.getAppPath(), "resources");
  const corePath = join(resourcesRoot, "core", "cli.mjs");
  const skillsDir = join(resourcesRoot, "skills");
  if (!existsSync(corePath)) {
    throw new Error(`打包后的 Core 不存在：${corePath}`);
  }

  return {
    command: app.isPackaged
      ? process.execPath
      : (process.env.RW_NODE_BIN ?? "node"),
    args: [
      corePath,
      "--workspace",
      workspace,
      "--skills-dir",
      skillsDir
    ],
    cwd: workspace,
    env: app.isPackaged ? { ELECTRON_RUN_AS_NODE: "1" } : undefined
  };
}

async function prepareWorkspace(
  repoRoot: string,
  workspace: string,
  seedDemo: boolean
): Promise<string> {
  await mkdir(workspace, { recursive: true });
  if (!seedDemo) return workspace;
  const dataPath = join(workspace, "data.csv");
  if (!existsSync(dataPath)) {
    const packagedFixture = join(
      process.resourcesPath,
      "fixtures/messy.csv"
    );
    const repoFixture = join(
      repoRoot,
      "packages/research-skills/fixtures/messy.csv"
    );
    const fixture = existsSync(packagedFixture)
      ? packagedFixture
      : repoFixture;
    if (existsSync(fixture)) {
      await copyFile(fixture, dataPath);
    } else {
      await writeFile(
        dataPath,
        "sample_id,group,score,latency_ms,split\ns1,control,0.71,120,train\ns2,treatment,0.83,,train\ns3,control,,98,val\n"
      );
    }
  }
  await ensureInternalGitIgnore(workspace);
  await ensureAgentRules(repoRoot, workspace);
  return workspace;
}

async function ensureAgentRules(
  repoRoot: string,
  workspace: string
): Promise<void> {
  const target = join(workspace, "AGENTS.md");
  if (existsSync(target)) return;
  const packaged = join(process.resourcesPath, "templates", "AGENTS.md");
  const development = join(
    repoRoot,
    "packages/research-skills/templates/AGENTS.md"
  );
  const source = existsSync(packaged) ? packaged : development;
  if (existsSync(source)) {
    await copyFile(source, target);
  }
}

async function ensureInternalGitIgnore(workspace: string): Promise<void> {
  const path = join(workspace, ".gitignore");
  const text = await readFile(path, "utf8").catch(() => null);
  if (text === null) {
    await writeFile(
      path,
      "# Research Workbench internal records\n.research/\n.agent/\nnode_modules/\n"
    );
    return;
  }
  const clean = text.replace(/^\uFEFF/, "");
  if (!/^\.research\/?$/m.test(clean)) {
    await writeFile(path, `${clean.replace(/\s*$/, "")}\n.research/\n`);
  }
}

function broadcastStatus(status: CoreStatus): void {
  mainWindow?.webContents.send("core:status", status);
}

function launchCore(repoRoot: string, workspace: string): void {
  core?.stop();
  core = new CoreBridge({
    repoRoot,
    workspace,
    launch: resolveCoreLaunch(workspace),
    onEvent: broadcastEvent,
    onStatus: broadcastStatus
  });
  core.start();
}

function broadcastEvent(event: RpcEvent): void {
  mainWindow?.webContents.send("core:event", event);
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#ffffff",
    title: "Research Workbench",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const current = mainWindow?.webContents.getURL();
    if (current && url !== current) event.preventDefault();
  });
  mainWindow.webContents.on("did-finish-load", () => {
    if (core) broadcastStatus(core.getStatus());
  });

  const rendererUrl = process.env["ELECTRON_RENDERER_URL"];
  if (rendererUrl) {
    await mainWindow.loadURL(rendererUrl);
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

ipcMain.handle(
  "core:request",
  async (_event, payload: { method?: unknown; params?: unknown }) => {
    if (!core) throw new Error("Core 尚未启动");
    if (typeof payload?.method !== "string") {
      throw new Error("无效的 Core 请求");
    }
    if (!ALLOWED_METHODS.has(payload.method)) {
      throw new Error(`Core 方法未授权：${payload.method}`);
    }
    return core.request(payload.method, payload.params);
  }
);

ipcMain.handle("core:status", () => core?.getStatus() ?? null);

ipcMain.handle("settings:get", () => settingsSummary());

ipcMain.handle(
  "settings:saveApiKey",
  async (_event, payload: { apiKey?: unknown }) => {
    const apiKey =
      typeof payload?.apiKey === "string" ? payload.apiKey.trim() : "";
    if (apiKey.length < 8) {
      throw new Error("API Key 长度无效");
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("系统加密不可用，无法安全保存 API Key");
    }
    const stored = await readStoredSettings();
    stored.encryptedApiKey = safeStorage
      .encryptString(apiKey)
      .toString("base64");
    await writeStoredSettings(stored);
    process.env.RW_API_KEY = apiKey;
    process.env.DEEPSEEK_API_KEY = apiKey;
    if (core) {
      await core.request("agent.setApiKey", { apiKey });
    }
    return settingsSummary();
  }
);

ipcMain.handle(
  "settings:saveProvider",
  async (
    _event,
    payload: {
      provider?: unknown;
      baseUrl?: unknown;
      model?: unknown;
      apiKey?: unknown;
    }
  ) => {
    const provider =
      payload?.provider === "openai-compatible"
        ? "openai-compatible"
        : "deepseek";
    const baseUrl =
      typeof payload?.baseUrl === "string" && payload.baseUrl.trim()
        ? payload.baseUrl.trim()
        : DEFAULT_BASE_URL;
    const model =
      typeof payload?.model === "string" && payload.model.trim()
        ? payload.model.trim()
        : DEFAULT_MODEL;
    const apiKey =
      typeof payload?.apiKey === "string" ? payload.apiKey.trim() : "";
    if (provider === "openai-compatible") {
      try {
        const url = new URL(baseUrl);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error();
        }
      } catch {
        throw new Error("OpenAI 兼容 Base URL 必须是 http(s) 地址");
      }
    }
    if (apiKey.length > 0 && apiKey.length < 8) {
      throw new Error("API Key 长度无效");
    }
    const stored = await readStoredSettings();
    stored.provider = provider;
    stored.baseUrl = baseUrl;
    stored.model = model;
    if (apiKey) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("系统加密不可用，无法安全保存 API Key");
      }
      stored.encryptedApiKey = safeStorage
        .encryptString(apiKey)
        .toString("base64");
    }
    await writeStoredSettings(stored);
    const effectiveKey =
      apiKey ||
      decryptSavedApiKey(stored) ||
      process.env.RW_API_KEY ||
      process.env.DEEPSEEK_API_KEY ||
      "";
    process.env.RW_PROVIDER = provider;
    process.env.RW_BASE_URL = baseUrl;
    process.env.RW_MODEL = model;
    if (effectiveKey) {
      process.env.RW_API_KEY = effectiveKey;
      process.env.DEEPSEEK_API_KEY = effectiveKey;
    }
    if (core) {
      await core.request("agent.configureProvider", {
        provider,
        baseUrl,
        model,
        apiKey: effectiveKey || undefined
      });
    }
    return settingsSummary();
  }
);

ipcMain.handle("settings:clearApiKey", async () => {
  const stored = await readStoredSettings();
  delete stored.encryptedApiKey;
  await writeStoredSettings(stored);
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.RW_API_KEY;
  if (core) {
    await core.request("agent.setApiKey", { apiKey: "" });
  }
  return settingsSummary();
});

ipcMain.handle(
  "settings:saveGit",
  async (
    _event,
    payload: { gitBinary?: unknown; autoCommit?: unknown }
  ) => {
    const gitBinary =
      typeof payload?.gitBinary === "string" ? payload.gitBinary.trim() : "";
    const autoCommit = Boolean(payload?.autoCommit);
    if (core) {
      await core.request("git.configure", { binary: gitBinary, autoCommit });
    }
    const stored = await readStoredSettings();
    stored.gitBinary = gitBinary;
    stored.autoCommit = autoCommit;
    await writeStoredSettings(stored);
    process.env.RW_GIT_BINARY = gitBinary;
    process.env.RW_AUTO_COMMIT = autoCommit ? "1" : "0";
    return settingsSummary();
  }
);

ipcMain.handle("settings:chooseGitBinary", async () => {
  if (!mainWindow) throw new Error("窗口尚未就绪");
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择 Git 可执行文件",
    properties: ["openFile"]
  });
  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }
  return { canceled: false, path: result.filePaths[0] };
});

async function switchWorkspace(
  workspace: string,
  seedDemo: boolean
): Promise<void> {
  const repoRoot = findRepoRoot();
  currentWorkspace = await prepareWorkspace(repoRoot, workspace, seedDemo);
  launchCore(repoRoot, currentWorkspace);
  mainWindow?.webContents.send("workspace:changed", {
    workspace: currentWorkspace
  });
  setTimeout(() => mainWindow?.webContents.reload(), 350);
}

ipcMain.handle("settings:chooseWorkspace", async () => {
  if (!mainWindow) throw new Error("窗口尚未就绪");
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择项目工作目录",
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }
  const selected = resolve(result.filePaths[0]);
  const info = await stat(selected);
  if (!info.isDirectory()) {
    throw new Error("请选择文件夹");
  }
  if (selected === currentWorkspace) {
    return { canceled: true };
  }
  const stored = await readStoredSettings();
  stored.workspace = selected;
  await writeStoredSettings(stored);
  await switchWorkspace(selected, false);
  return { canceled: false, workspace: selected };
});

ipcMain.handle("settings:resetWorkspace", async () => {
  const stored = await readStoredSettings();
  delete stored.workspace;
  await writeStoredSettings(stored);
  await switchWorkspace(defaultWorkspace, true);
  return { canceled: false };
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  configureLspServer();

  try {
    const repoRoot = findRepoRoot();
    const stored = await readStoredSettings();
    defaultWorkspace = join(app.getPath("userData"), "workspace");
    let customWorkspace = false;
    let workspace = defaultWorkspace;
    if (stored.workspace) {
      try {
        const info = await stat(stored.workspace);
        if (info.isDirectory()) {
          workspace = stored.workspace;
          customWorkspace = true;
        }
      } catch {
        // Fall back to the managed demo workspace when the saved folder is gone.
      }
    }
    const savedKey = decryptSavedApiKey(stored);
    process.env.RW_PROVIDER = stored.provider ?? "deepseek";
    process.env.RW_BASE_URL = stored.baseUrl ?? DEFAULT_BASE_URL;
    process.env.RW_MODEL = stored.model ?? DEFAULT_MODEL;
    process.env.RW_GIT_BINARY = stored.gitBinary ?? "";
    process.env.RW_AUTO_COMMIT = stored.autoCommit ? "1" : "0";
    if (savedKey) {
      process.env.RW_API_KEY = savedKey;
      process.env.DEEPSEEK_API_KEY = savedKey;
    }
    currentWorkspace = await prepareWorkspace(
      repoRoot,
      workspace,
      !customWorkspace
    );
    launchCore(repoRoot, currentWorkspace);
  } catch (error) {
    broadcastStatus({
      state: "error",
      message: error instanceof Error ? error.message : "Core 初始化失败"
    });
  }

  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("before-quit", () => {
  core?.stop();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
