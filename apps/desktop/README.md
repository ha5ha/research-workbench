# apps/desktop

Electron 桌面壳与 React renderer。

## 已实现（Phase 0）

- Electron main：窗口、CSP、外部导航拦截、单实例、`core:request` 白名单。
- CoreBridge：启动 Core 子进程，JSON-RPC 请求相关，转发 `seq` 事件与状态。
- Preload：`window.rw.request/status/onEvent/onStatus`，不暴露 Node。
- Renderer：原型的侧栏 / 顶栏 / 对话 / 检查器布局；Core 连接、Skills 列表、事件流、真实 `data-profile` 运行与 artifact 展示。
- pi 验证卡：运行 faux-model 工具循环，展示工具调用、被拦截工具、session 文件与 artifact。
- pi 对话：真实 DeepSeek 流式回复；需要数据画像时会调用 `data_profile` 工具。没有 `DEEPSEEK_API_KEY` 时自动使用 faux 演示。
- 审批弹窗：`record_note` 工具执行前等待用户批准/拒绝；拒绝或超时不会写入 artifact。
- `状态 / 实验记录 / 代码` Tab 已有 Phase 0 静态承接。

## 真实模型

在启动终端中设置，密钥不会写入仓库：

```powershell
$env:DEEPSEEK_API_KEY="sk-..."
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
- 代码工作面、任务书/受管运行、SQLite 归档仍在 Phase 1/2。
