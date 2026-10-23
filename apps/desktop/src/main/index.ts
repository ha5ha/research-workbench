import { app, BrowserWindow, ipcMain, Menu } from "electron";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
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
  "domain.apply"
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

async function prepareWorkspace(repoRoot: string): Promise<string> {
  const workspace = join(app.getPath("userData"), "workspace");
  await mkdir(workspace, { recursive: true });
  const dataPath = join(workspace, "data.csv");
  if (!existsSync(dataPath)) {
    const fixture = join(
      repoRoot,
      "packages/research-skills/fixtures/messy.csv"
    );
    if (existsSync(fixture)) {
      await copyFile(fixture, dataPath);
    } else {
      await writeFile(
        dataPath,
        "sample_id,group,score,latency_ms,split\ns1,control,0.71,120,train\ns2,treatment,0.83,,train\ns3,control,,98,val\n"
      );
    }
  }
  return workspace;
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
