# ADR-0001：Agent 运行时与进程边界

- 状态：Accepted（2026-10-24，Phase 0 gate 通过）
- 日期：2026-10-23
- 关联：[工程实施方案](../product/desktop_agent_implementation_plan_v1.md)

## 背景

产品需要同时具备：

- 通用桌面 Agent：模型、工具、会话、上下文、权限、恢复、流式事件；
- 科研层：课题、问题、任务书、审批、运行、产物、证据；
- 严格贴合现有原型的桌面 UI；
- Windows 可安装、可恢复、可审计。

不能把通用 Agent 和科研对象混在同一个会话/提示词层里，也不能为了“复用”同时接入多套 runtime。

## 候选

| 方案 | 优点 | 缺点 | 许可 |
| --- | --- | --- | --- |
| pi SDK 嵌入 Core | SDK/RPC、模型多、工具循环/会话/压缩/扩展齐全；Node/TS；可定制上下文与工具 | 需验证上下文钩子、Windows 打包、Electron Node 版本；API 仍会演进 | MIT |
| pi-agent-core + 自研会话/上下文 | 控制力强，适合科研上下文装配 | 需自研压缩、恢复、工具生命周期，首版成本高 | MIT |
| fork DSH/Codex 应用 | 成熟交互/安全实现 | 架构/UI 强耦合；科研层难插入；升级困难 | MIT / Apache-2.0 |
| 完全自研 loop | 最大控制 | 重复造轮子，工具/重试/压缩风险高 | — |
| Tauri + Node sidecar | 体积更小 | 仍需携带 Node；Electron 打包/PTY 更直接 | MIT |

## 决策

1. 桌面壳采用 **Electron + React + TypeScript**。
2. Agent 主选 **pi SDK（MIT）**，运行在独立 Core 进程内；Renderer 不直接接触 Agent。
3. 使用 pi 的扩展/`context`/工具钩子注入科研上下文与 ToolGateway；**关闭或替换可绕过网关的默认写/Shell 工具**。
4. Main 只做桌面生命周期与 safeStorage；Core 持有 SQLite、Agent 会话、RunManager 和执行器。
5. 只接一套完整 runtime；不并行引入 DSH/Codex/LangGraph 运行框架。
6. pi 的版本在 Phase 0 固定；升级必须过集成与权限测试。

## Phase 0 验证门

必须同时通过：

- 每轮 `context` 可注入当前科研状态；
- 自定义工具可注册、流式、取消；
- 写文件/Shell/网络/MCP 全部可被 ToolGateway 拦截；
- 会话恢复/fork/压缩保留工具调用配对；
- DeepSeek + 一个 OpenAI-compatible 本地模型可多步工具调用；
- Windows 下 Core 子进程、取消、路径、Electron 打包可用；
- 密钥不进入日志、会话、Renderer。

不通过则降级到 `pi-agent-core` + 自研会话/上下文；不并行接第二套完整 runtime。

## Phase 0 已验证（2026-10-24）

使用 pi `fauxProvider` 的确定性 spike 已通过：

- `before_agent_start` 注入 Research Workbench 系统提示。
- 自定义 `data_profile` 工具经 Core `SkillService` 执行并返回 artifact。
- `tool_call` 钩子拦截未授权的 `dangerous_echo`；工具未执行。
- `SessionManager.create` 生成真实 JSONL 会话文件。
- 桌面端 `agent.spike` RPC 可运行，UI 展示工具、拦截、session 与 artifact。

真实 provider 也已验证：

- `DEEPSEEK_API_KEY` + `deepseek-flash` 通过 pi 流式返回。
- `agent.chat` 将 `message_update` 增量、工具开始/结束和完成事件桥接到桌面 UI。
- 真实模型在“画像 data.csv”提示下调用 `data_profile`，返回行数/列数/缺失率。
- 密钥只存在进程内存，不使用文件 credential store。

审批与上下文：

- `ApprovalBroker` 发出 `agent.approval-required`，UI 弹窗等待用户批准/拒绝；Core CLI 并发处理 `approval.respond`，`record_note` 只在批准后写入 artifact。
- 每轮请求前从 `ResearchEnvironment.observe(scope)` 投影 facts/actions/artifact count 到 pi 系统提示。
- 拒绝和超时都会阻止工具执行。

打包：

- `scripts/build-core.mjs` 用 esbuild 打包 Core+pi 为 ESM，注入 `require`/`__dirname` shim。
- Electron packaged 模式用 `process.execPath` + `ELECTRON_RUN_AS_NODE=1` 启动 bundled Core。
- `electron-builder` 生成 Windows portable `ResearchWorkbench-0.1.0-x64.exe`；unpacked 和便携包均验证 Core 在线、skills 加载、data-profile 成功。
- 打包版使用资源内 fixture，避免依赖仓库路径。

状态转为 **Accepted**。剩余事项（应用图标、代码签名、自动更新、每轮 `context` 事件而非系统提示）属于生产硬化，不阻塞 Phase 0 gate。

## 后果

- 正面：通用能力复用、开发速度、上下文/权限可控、未来可做 headless CLI。
- 成本：需要维护 pi 适配层；需处理 Electron Node 版本与原生依赖；需验证升级兼容。
- 风险：如果 pi 的 context 钩子只能追加不能替换，需改走 agent-core 方案。
- 退出：`AgentRuntime` 接口隔离；Core/RPC/科研对象不依赖 pi 类型。

## 参考

- pi SDK / RPC / extensions / agent-core
- Codex approvals & security（参考，不作为依赖）
- DeepSeek Harness permission presets（参考，不作为依赖）
