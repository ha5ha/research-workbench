# apps/desktop

Electron 桌面壳与 React renderer。

## 已实现（Phase 0）

- Electron main：窗口、CSP、外部导航拦截、单实例、`core:request` 白名单。
- CoreBridge：启动 Core 子进程，JSON-RPC 请求相关，转发 `seq` 事件与状态。
- Preload：`window.rw.request/status/onEvent/onStatus`，不暴露 Node。
- Renderer：原型的侧栏 / 顶栏 / 对话 / 检查器布局；Core 连接、Skills 列表、事件流、真实 `data-profile` 运行与 artifact 展示。
- pi 验证卡：运行 faux-model 工具循环，展示工具调用、被拦截工具、session 文件与 artifact。
- pi 对话：真实 DeepSeek 流式回复；需要数据画像时会调用 `data_profile` 工具。API Key 可在左下角设置里配置；没有 Key 时自动使用 faux 演示。
- 审批弹窗：`record_note`、`workspace.write`、`terminal.run` 执行前等待用户批准/拒绝；拒绝或超时不会执行。
- 独立 IDE 视图：从项目行代码图标进入，全窗口铺满，不保留研究侧栏/对话 Tab；有返回对话。
- 实验记录 Tab：对话下按原型列表一行一条记录，详情含概览/逐种子/文件/任务书/相关代码；任务书/指标/结论来自 SQLite。
- 设置：左下角 Agent 设置；DeepSeek / OpenAI 兼容 Provider、模型下拉、API Key（safeStorage 加密）、Git 路径、自动 commit、项目工作目录热切换。
- LSP：TypeScript/JavaScript language server 随包分发，IDE 显示 `TS LSP` 并提供诊断/补全/hover/跳转。
- 布局：研究视图左右侧栏可独立折叠并持久化；IDE 视图全窗口、42px 工具栏、文件树/编辑器独立滚动、终端可开合、左下角设置入口。

## 真实模型

在启动终端中设置，密钥不会写入仓库：

```powershell
$env:DEEPSEEK_API_KEY="sk-..."   # 可选；优先使用设置面板中保存的 Key
$env:DEEPSEEK_MODEL="deepseek-flash"
pnpm dev
```

模型可选 `deepseek-flash` 或 `deepseek-v4-pro`；默认 `deepseek-flash`。

## 运行

首次安装 Electron 预编译二进制：

```bash
pnpm setup:electron
```

开发模式：

```bash
pnpm dev
```

构建并启动：

```bash
pnpm build
pnpm --filter @research-workbench/desktop start
```

## 打包

```bash
pnpm package
```

会先执行 `build:core`（esbuild 打包 Core+pi 为 `resources/core/cli.mjs`），再执行 electron-vite 和 electron-builder，生成：

```text
release/ResearchWorkbench-0.1.0-x64.exe
```

打包版用 `process.execPath` + `ELECTRON_RUN_AS_NODE=1` 启动 bundled Core；skills 与样本 fixture 随 `extraResources` 分发，不依赖仓库路径。

如果 electron-builder 下载 7zip/NSIS 超时，可设置本机缓存：

```powershell
$env:ELECTRON_BUILDER_7ZIP_PATH="$env:LOCALAPPDATA\electron-builder\Cache\7zip@1.0.0\7zip-win-x64-a34pt\bin\7za.exe"
pnpm package
```

当前使用默认 Electron 图标、未签名；生产发布需要图标、代码签名与更新源。

## 约束

- Renderer 不直接访问 Node/文件系统/SQLite/Shell；只通过 preload 白名单。
- 不加载外部网页；`will-navigate` 和 `window.open` 被禁止。
- 开发模式用系统 `node --import tsx` 启动 Core 源码；打包模式用 bundled `resources/core/cli.mjs`。
- 研究工作区模型：项目来自真实工作目录；研究问题/任务由 Core 的 `.research/research.json` 持久化，新工作区为空，侧栏可直接新建问题与任务。
- 代码工作面、任务书/实验记录、SQLite 归档与 LSP 已在 Phase 1 接入；逐种子/artifact/并排 diff 可用。
