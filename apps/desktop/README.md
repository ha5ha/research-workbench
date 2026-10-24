# apps/desktop

Electron 桌面壳与 React renderer。

## 已实现（Phase 0）

- Electron main：窗口、CSP、外部导航拦截、单实例、`core:request` 白名单。
- CoreBridge：启动 Core 子进程，JSON-RPC 请求相关，转发 `seq` 事件与状态。
- Preload：`window.rw.request/status/onEvent/onStatus`，不暴露 Node。
- Renderer：原型的侧栏 / 顶栏 / 对话 / 检查器布局；Core 连接、Skills 列表、事件流、真实 `data-profile` 运行与 artifact 展示。
- pi 验证卡：运行 faux-model 工具循环，展示工具调用、被拦截工具、session 文件与 artifact。
- pi 对话：真实 OpenAI Chat Completions 流式回复；需要数据画像时会调用 `data_profile` 工具。API Key 可在左下角设置或输入框模型菜单配置；没有 Key 时自动使用 faux。
- 审批弹窗：`record_note`、`workspace.write`、`terminal.run` 执行前等待用户批准/拒绝；拒绝或超时不会执行。
- 独立 IDE 视图：从项目行代码图标进入，全窗口铺满，不保留研究侧栏/对话 Tab；有返回对话。
- 实验记录 Tab：对话下按原型列表一行一条记录，详情含概览/逐种子/文件/任务书/相关代码；任务书/指标/结论来自 SQLite。
- 研究结构：课题 → 研究路线 → 任务；课题含一句话描述、文献库和聚合状态；侧栏可新建/编辑，新工作区为空。
- 设置：左侧分栏宽面板；OpenAI 协议 + Anthropic 占位、模型即时切换、API Key（safeStorage 加密）、项目目录热切换、Git、权限。
- 输入框工具栏：附件（复制到 `uploads/`）、权限快捷设置、模型快捷切换。
- 对话：新建对话重置 Agent 运行时并创建新会话；消息与会话文件按任务保存在本机，重载后恢复上下文；对话标题显示当前模型并可点击切换。
- 权限：写入/终端/Git/笔记分别询问、允许或拒绝；由 Core 强制执行。
- LSP：TypeScript/JavaScript language server 随包分发，IDE 显示 `TS LSP` 并提供诊断/补全/hover/跳转。
- 布局：研究视图左右侧栏可独立折叠并持久化；IDE 视图全窗口、42px 工具栏、文件树/编辑器独立滚动、终端可开合、左下角设置入口。

## 真实模型

在设置面板或启动终端中配置，密钥不会写入仓库：

```powershell
$env:RW_API_KEY="sk-..."          # 可选；优先使用设置面板中保存的 Key
$env:RW_BASE_URL="https://api.openai.com/v1"
$env:RW_MODEL="gpt-4o-mini"
pnpm dev
```

默认使用 OpenAI Chat Completions 协议与 `gpt-4o-mini`；也兼容其他 `/v1/chat/completions` 服务。`DEEPSEEK_API_KEY` 仅作为旧环境变量兼容。

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
- 研究工作区模型：项目来自真实工作目录；课题/研究路线/任务由 Core 的 `.research/research.json` 持久化，新工作区为空，侧栏可直接新建与编辑。
- 代码工作面、任务书/实验记录、SQLite 归档与 LSP 已在 Phase 1 接入；逐种子/artifact/并排 diff 可用。
