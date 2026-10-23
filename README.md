# Research Workbench

面向个人研究者的桌面科研 Agent 工作台：通用 Agent 内核 + 科研记录、实验执行、数据归档与证据闭环。

> 当前状态：**方案与工程规范阶段，尚无运行时代码。**
> 本仓库先固化技术路线、协作规范和 UI 视觉合同，随后进入 Phase 0 架构验证。

## 三条硬规范

1. **开源优先**
   有成熟、许可兼容、可维护的开源实现时，优先采用或适配；没有合适实现，才自研。每项关键依赖必须有 ADR、固定版本/提交和许可证记录。

2. **Agent 内核与科研特性分离**
   通用运行时负责模型、工具、会话、上下文和执行边界；科研层负责课题、问题、任务、任务书、运行、产物、证据和审批。科研对象不得写进 Agent 内核，Agent 也不得绕过科研审批。

3. **UI 完整贴合原型**
   现有 HTML 原型是视觉合同，不是参考图。布局、字体、字号、颜色、间距、响应式和关键交互必须逐项对齐；改动视觉必须显式批准并更新视觉基线。

完整规范见 [docs/standards](docs/standards/README.md)。任何人类或 AI 贡献者开始工作前必须先读 [AGENTS.md](AGENTS.md)。

## 目标架构

```text
React Renderer
  ↕ typed IPC（contextBridge）
Electron Main（窗口、更新、密钥、Core 生命周期）
  ↕ JSON-RPC
Core（Node）
  ├─ AgentHost（pi SDK、上下文装配、ToolGateway）
  ├─ ResearchService（课题/问题/任务/任务书/审批/证据）
  ├─ RunManager（运行台账、状态机、轮询、本地/SSH 执行器）
  ├─ ArtifactStore（manifest、哈希、解析、清理候选）
  └─ SQLite（WAL、FTS5、事件日志）
```

核心原则：**Renderer 不直接接触 Node、文件系统、数据库、Shell 或模型密钥。**

## 技术栈

| 层 | 选择 |
| --- | --- |
| 桌面 | Electron + React + TypeScript + Vite |
| Agent | pi SDK（MIT，Phase 0 嵌入验证后锁定） |
| 数据 | SQLite + Drizzle + FTS5 |
| 终端/代码 | node-pty、xterm.js、CodeMirror 6、Shiki |
| UI 行为 | Radix Primitives（无样式），视觉全部自定义 |
| 测试 | Vitest + Playwright（含 Electron E2E 与视觉回归） |
| 打包 | electron-builder + electron-updater |

## 仓库结构（规划）

```text
apps/
  desktop/      Electron main / preload / React renderer
  core/         RPC、AgentHost、科研服务、运行管理、SQLite
packages/
  contracts/    跨进程协议与 DTO
  domain/       纯科研领域模型与状态机
  db/           schema、迁移、repository
  agent-runtime/pi 适配、上下文装配、科研工具
  executors/    local / ssh
  artifacts/    manifest / hash / parser
  ui/           设计系统与组件
  testkit/      fake provider / fake executor / fixtures
tests/          e2e / integration / security
docs/           product / standards / adr
design/         UI 参考与视觉基线
```

当前只有目录占位和文档；Phase 0 再添加可运行包。

## 文档索引

- [产品文档索引](docs/product/README.md)
- [工程实施方案](docs/product/desktop_agent_implementation_plan_v1.md)
- [产品方案 v0.2](docs/product/research_agent_desktop_proposal_v0_2.md)
- [实验工作台计划 v0.2](docs/product/experiment_workbench_plan_v0_2.md)
- [上下文与记忆设计 v0.1](docs/product/context_memory_design_v0_1.md)
- [规范索引](docs/standards/README.md)
- [ADR-0001：运行时与进程边界](docs/adr/0001-agent-runtime-and-process-boundary.md)
- [UI 参考](design/reference/README.md)

## UI 基线

当前视觉基线来自 `docs/product/prototype/index.html` 的 v8 版本，关键截图保存在 [design/reference/screens](design/reference/screens)。

规范不要求复制原型里的演示数据和内联脚本；生产应用必须用 React/TypeScript 重新实现，但视觉 token、布局尺寸和关键交互必须一致。

## 开发状态

- [x] 产品与工程方案
- [x] 开源优先、内核/科研分离、原型 UI 三条规范
- [x] 仓库结构与设计基线
- [ ] Phase 0：Electron/core/RPC 最小链路
- [ ] Phase 0：pi 嵌入验证
- [ ] Phase 1：通用 Agent MVP
- [ ] Phase 2：科研归档 MVP

## 远端

Gitee 私有仓库：<https://gitee.com/wx20030819/research-workbench>

## License

尚未选定。当前为私有仓库，未经明确授权不得分发。选定许可证后更新本文件，并核对所有第三方依赖的许可证与 NOTICE 要求。
