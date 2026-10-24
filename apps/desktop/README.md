# apps/desktop

Electron 桌面壳与 React renderer。

## 已实现（Phase 0）

- Electron main：窗口、CSP、外部导航拦截、单实例、`core:request` 白名单。
- CoreBridge：启动 Core 子进程，JSON-RPC 请求相关，转发 `seq` 事件与状态。
- Preload：`window.rw.request/status/onEvent/onStatus`，不暴露 Node。
- Renderer：原型的侧栏 / 顶栏 / 对话 / 检查器布局；Core 连接、Skills 列表、事件流、真实 `data-profile` 运行与 artifact 展示。
- pi 验证卡：运行 faux-model 工具循环，展示工具调用、被拦截工具、session 文件与 artifact。
- `状态 / 实验记录 / 代码` Tab 已有 Phase 0 静态承接。

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

## 约束

- Renderer 不直接访问 Node/文件系统/SQLite/Shell；只通过 preload 白名单。
- 不加载外部网页；`will-navigate` 和 `window.open` 被禁止。
- 当前 Core 用系统 `node --import tsx` 启动 TS 源码，这是 Phase 0 开发方式；打包版需改为随应用分发 Core runtime。
- 当前没有真实模型/pi；对话输入与代码工作面将在后续接入。
