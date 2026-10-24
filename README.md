# Research Workbench

面向个人研究者的桌面 Agent 工作台：**改代码、对话、工具执行 + 科研记录、实验执行、数据归档与证据闭环**。

> 当前状态：**Phase 0 已有可运行的 Core / Skill / Electron 桌面壳 / pi faux-model spike；真实模型 provider 尚未接入。**
> 桌面端已能运行 `data-profile` 和 pi 自定义工具循环，展示 artifact、被拦截工具与真实 session 文件。

## 三类工作面，一个 Agent

- **对话**：主要控制面。讨论、规划、提问、让 Agent 调用工具。
- **代码**：一等工作面。文件树、编辑/补丁、diff、终端、测试、Git 状态；不是只读预览。
- **科研**：可选叠加层。课题、问题、任务书、审批、运行、产物、证据；普通 coding/chat 不强制建研究问题。

它们不是三个 Agent，也不是三套 runtime。同一个 Agent 内核、同一套会话与权限，通过视图和上下文切换工作面。

**能力门禁：** 只保留服务计算科研的通用能力。代码、终端、diff、测试、Git 是科研工具，必须保留；IDE 插件、PR review、团队协作、应用部署等与计算科研无关的产品面暂缓。

两条执行路径必须分开：

| 路径 | 用途 | 记录 |
| --- | --- | --- |
| 交互式编码/命令 | 日常读代码、改代码、跑测试、探索 | workspace 快照、diff、terminal 日志、权限审计 |
| 受管科研运行 | 按冻结任务书执行实验 | run 台账、代码/配置/输入身份、预算、产物、状态事件 |

## 三条硬规范

1. **开源优先**
   有成熟、许可兼容、可维护的开源实现时，优先采用或适配；没有合适实现，才自研。每项关键依赖必须有 ADR、固定版本/提交和许可证记录。

2. **Agent 内核与科研特性分离**
   通用运行时负责模型、工具、会话、上下文、代码工作面、执行边界；科研层负责课题、问题、任务、任务书、运行、产物、证据和审批。科研对象不得写进 Agent 内核，Agent 也不得绕过科研审批。

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
  ├─ AgentHost（pi SDK、上下文装配、ToolGateway、coding/chat tools）
  ├─ WorkspaceService（文件树、diff、Git、快照、代码上下文）
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
  agent-runtime/pi 适配、上下文装配、coding/chat/research tools
  coding/        文件索引、patch、diff、Git、测试结果、代码上下文
  research-skills/内置科研 Skill、manifest、fixture、版本与评测
  executors/    local / ssh
  artifacts/    manifest / hash / parser
  ui/           设计系统与组件（含代码工作面）
  testkit/      fake provider / fake executor / fixtures
tests/          e2e / integration / security
docs/           product / standards / adr
design/         UI 参考与视觉基线
```

当前 Phase 0 已落地：

- `packages/contracts`：Skill / Artifact / ResearchEnvironment / JSON-RPC 契约。
- `packages/domain`：可测试的内存科研环境，写动作必须审批。
- `packages/research-skills`：SKILL.md 加载、注册表、`data-profile` 可执行 skill、`research-checkpoint` planned 示例。
- `apps/core`：工作区路径约束、ToolGateway 的 allowed-tools 限制、SkillService、JSON-RPC Core、CLI 与 demo。
- `packages/ui`：原型 token 与基础排版。
- `apps/desktop`：Electron main/preload/renderer；真实 Core 连接、Skills/事件/artifact UI；Phase 0 三栏原型壳。
- `packages/agent-runtime`：pi SDK 适配；faux provider 已验证系统提示注入、自定义工具、未授权工具拦截和 JSONL session。

pi 真实模型 provider、流式会话 UI、代码工作面编辑/终端、受管运行仍在后面。

## 本地验证

```bash
pnpm install
pnpm setup:electron   # 首次安装 Electron 预编译二进制
pnpm typecheck
pnpm test
pnpm demo
pnpm dev              # Electron 桌面壳
```

`pnpm demo` 会在临时工作区复制样例 CSV，执行 `data-profile`，输出 JSON-RPC 事件之外的分析摘要与 artifact 路径。

桌面端启动后，Electron main 会启动 Core 子进程；点击“运行数据画像”走完整链路：

```text
Renderer → preload → main → Core JSON-RPC → data-profile → artifact
```

Core 也可作为 JSONL/JSON-RPC stdin 服务运行：

```bash
pnpm --filter @research-workbench/core dev -- --workspace <workspace-dir>
```

## 文档索引

- [产品文档索引](docs/product/README.md)
- [工程实施方案](docs/product/desktop_agent_implementation_plan_v1.md)
- [产品方案 v0.2](docs/product/research_agent_desktop_proposal_v0_2.md)
- [实验工作台计划 v0.2](docs/product/experiment_workbench_plan_v0_2.md)
- [上下文与记忆设计 v0.1](docs/product/context_memory_design_v0_1.md)
- [规范索引](docs/standards/README.md)
- [ADR-0001：运行时与进程边界](docs/adr/0001-agent-runtime-and-process-boundary.md)
- [ADR-0002：Domain Pack 与 Research Environment（Proposed）](docs/adr/0002-domain-pack-and-research-environment.md)
- [ADR-0003：代码工作面与受管科研运行](docs/adr/0003-coding-surface-and-managed-runs.md)
- [ADR-0004：计算科研能力门禁与 Research Skills](docs/adr/0004-computational-research-capability-gate.md)
- [计算科研 Skills 体系](docs/research/computational-research-skills.md)
- [Research Skills 规范](docs/standards/04-research-skills.md)
- [垂直 Agent 架构调研](docs/research/2026-10-23-vertical-agent-patterns.md)
- [UI 参考](design/reference/README.md)

## UI 基线

当前视觉基线来自 `docs/product/prototype/index.html` 的 v8 版本，关键截图保存在 [design/reference/screens](design/reference/screens)。

Phase 0 真实实现截图：[design/implementation](design/implementation/README.md)。

规范不要求复制原型里的演示数据和内联脚本；生产应用必须用 React/TypeScript 重新实现，但视觉 token、布局尺寸和关键交互必须一致。

## 开发状态

- [x] 产品与工程方案
- [x] 开源优先、内核/科研分离、原型 UI 三条规范
- [x] 仓库结构与设计基线
- [x] Phase 0：contracts / domain / skill registry / data-profile / Core RPC
- [x] Phase 0：原型 UI token
- [x] Phase 0：Electron 主进程 + CoreBridge + preload + 最小桌面壳
- [x] Phase 0：pi SDK faux-model spike（工具/上下文/拦截/会话）
- [ ] Phase 0：真实 provider + 流式会话 UI
- [ ] Phase 1：通用 Agent MVP
- [ ] Phase 2：科研归档 MVP

## 远端

Gitee 私有仓库：<https://gitee.com/wx20030819/research-workbench>

## License

尚未选定。当前为私有仓库，未经明确授权不得分发。选定许可证后更新本文件，并核对所有第三方依赖的许可证与 NOTICE 要求。
