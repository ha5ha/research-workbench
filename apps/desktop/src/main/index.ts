import { app, BrowserWindow, ipcMain, Menu } from "electron";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
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
  "git.log"
]);

let mainWindow: BrowserWindow | null = null;
let core: CoreBridge | undefined;

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

async function prepareWorkspace(repoRoot: string): Promise<string> {
  const workspace = join(app.getPath("userData"), "workspace");
  await mkdir(workspace, { recursive: true });
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

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  try {
    const repoRoot = findRepoRoot();
    const workspace = await prepareWorkspace(repoRoot);
    core = new CoreBridge({
      repoRoot,
      workspace,
      launch: resolveCoreLaunch(workspace),
      onEvent: broadcastEvent,
      onStatus: broadcastStatus
    });
    core.start();
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
