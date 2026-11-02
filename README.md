# Research Workbench

面向个人研究者的桌面 Agent 工作台：**改代码、对话、工具执行 + 科研记录、实验执行、数据归档与证据闭环**。

> 当前状态：**Phase 1 MVP 可运行。** 对话视图与全窗口 IDE 视图分离；研究结构为课题 → 研究路线 → 任务；Agent 可创建任务书/实验记录（SQLite），实验记录支持逐种子、artifact、并排 diff；Agent 设置使用左侧分栏宽面板，当前接入 OpenAI Chat Completions 协议（Anthropic 占位）、API Key、项目目录热切换、Git 与权限；IDE 有 CodeMirror、TypeScript LSP、命令面板与 Git。
> Windows 便携包：`pnpm package` 生成 `release/ResearchWorkbench-0.1.0-x64.exe`。

## 三类工作面，一个 Agent

- **对话**：主要控制面。讨论、规划、提问、让 Agent 调用工具。
- **代码**：一等工作面。文件树、编辑/补丁、diff、命令面板、测试、Git 状态；不是只读预览。
- **科研**：可选叠加层。课题、研究路线、任务书、审批、运行、产物、证据；普通 coding/chat 不强制建研究问题。

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

## Agent 配置

左下角设置是 Agent 配置入口，使用左侧分栏宽面板：

- **接口协议**：当前版本接入 OpenAI Chat Completions 协议；Anthropic Messages 仅占位，尚未启用。
- **模型**：OpenAI 预设 + 自定义模型 ID；输入框上方可直接切换，设置保存后立即应用。
- **新建对话**：重置 Agent 运行时并创建新会话；消息和会话文件按任务保存，重载后恢复上下文。
- **权限**：写入文件、终端命令、Git 提交、研究笔记分别可设“询问 / 允许 / 拒绝”，由 Core 强制执行；输入框上方可快速调整。
- **附件**：输入框工具栏选择 PDF/表格/文本/图片，复制到工作区 `uploads/`，发送时把相对路径交给 Agent。
- **课题**：课题下拉面板展示一句话描述、文献库与课题切换；每个课题下可建立多条研究路线，每条路线下建立任务。
- **API Key**：Electron `safeStorage` 加密保存，不回显、不写入工作区/仓库；也支持环境变量。
- **项目工作目录**：目录选择后保存并立即重启 Core、重载窗口，不重启应用；自定义目录不写入演示数据。
- **Git**：Git 可执行文件路径（保存时用 `git --version` 验证）+ 可选 Agent/终端成功后自动 commit。
- **逐种子归档**：`finish_experiment` 接受逐种子结果，也会自动读取 `results/seed-results.json` 或 `results/seed-metrics.csv`。
- **artifact 归档**：实验结束时自动收集 `results/`、`artifacts/` 等结果目录中新增/修改的文件，并在详情“文件”Tab 展示。
- **IDE LSP**：TypeScript/JavaScript 语言服务器随应用分发；显示 `TS LSP` 状态、诊断、补全、hover、跳转。

OpenAI 兼容端点按 `openai-completions` 协议接入，兼容 DeepSeek、OpenAI、OpenRouter、Ollama、vLLM 等标准 `/v1/chat/completions` 服务。实现依据 pi-ai 的 `createProvider()` + `openAICompletionsApi()`，配置模型为 `@earendil-works/pi-ai` 的自定义 Provider，而不是另写一套 HTTP 客户端。

## 目标架构

```text
React Renderer
  ↕ typed IPC（contextBridge）
Electron Main（窗口、更新、密钥、Core 生命周期）
  ↕ JSON-RPC
Core（Node）
  ├─ AgentHost（pi SDK、上下文装配、ToolGateway、coding/chat tools）
  ├─ WorkspaceService（文件树、diff、Git、快照、代码上下文）
  ├─ ResearchService（课题/研究路线/任务/任务书/审批/证据）
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
| 代码/命令 | CodeMirror 6、@codemirror/lsp-client、Shiki；命令面板为单次执行（node-pty/xterm 待评估） |
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
- `packages/agent-runtime`：pi SDK 适配；faux provider 与真实 DeepSeek 均已验证系统提示注入、自定义工具、审批等待、流式文本和 JSONL session。
- `apps/core`：`agent.chat`、`approval.respond`、`workspace.*`、`terminal.run`、`experiments.*`、`git.*`；SQLite 持久化任务书/实验记录，Git commit 需审批。
- `scripts/build-core.mjs`：把 Core/pi 打包成 14 MB ESM Runtime，供 electron-builder 随应用分发。

真实模型密钥可在应用左下角“设置”里配置，保存在本机 `safeStorage` 加密文件中，不写入 `auth.json`、工作区或仓库；也支持环境变量。项目工作目录在设置中选择，切换后立即重启 Core 并重载窗口，不关闭应用。MVP 已接入独立 IDE、Git、SQLite 实验记录、逐种子/artifact 归档、并排 diff、OpenAI 兼容 Provider 与 TypeScript LSP。

## 本地验证

```bash
pnpm install
pnpm setup:electron   # 首次安装 Electron 预编译二进制
pnpm typecheck
pnpm test
pnpm demo
pnpm dev              # Electron 桌面壳
pnpm package          # bundled Core + Windows portable exe
```

真实 DeepSeek 会话（Windows PowerShell）：

```powershell
$env:DEEPSEEK_API_KEY="sk-..."   # 开发时环境变量注入；也可在应用设置里配置
$env:DEEPSEEK_MODEL="deepseek-flash"
pnpm dev
```

没有 key 时桌面端自动使用 faux provider；输入“画像 data.csv”仍可验证工具链路。

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
- [代码工作面定位](docs/product/code-workbench.md)
- [OpenAI 兼容 Provider 调研](docs/research/2026-10-24-openai-compatible-provider.md)
- [规范索引](docs/standards/README.md)
- [科研代码规范](docs/standards/05-research-code-standards.md)
- [ADR-0005：IDE 编辑器、diff 与 Git](docs/adr/0005-ide-editor-diff-git.md)
- [开源 IDE 参考](docs/research/2026-10-24-ide-open-source.md)
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

研究侧栏已按仓库所有者要求重构：项目切换卡片、课题下拉（描述与文献库）、研究路线/任务嵌套树、聚合状态、显式“打开项目 IDE”、左下角 Agent 设置；输入框工具栏含附件、权限、模型；不再显示“本地示例 / Phase 1”等演示字样。

Phase 0 / Phase 1 真实实现截图：[design/implementation](design/implementation/README.md)。

规范不要求复制原型里的演示数据和内联脚本；生产应用必须用 React/TypeScript 重新实现，但视觉 token、布局尺寸和关键交互必须一致。研究视图左右侧栏可折叠、IDE 独立全窗口是仓库所有者确认的受控偏差，记录在 [UI 合同](docs/standards/03-prototype-ui-contract.md) 与 [代码工作面定位](docs/product/code-workbench.md)。

## 开发状态

- [x] 产品与工程方案
- [x] 开源优先、内核/科研分离、原型 UI 三条规范
- [x] 仓库结构与设计基线
- [x] Phase 0：contracts / domain / skill registry / data-profile / Core RPC
- [x] Phase 0：原型 UI token
- [x] Phase 0：Electron 主进程 + CoreBridge + preload + 最小桌面壳
- [x] Phase 0：pi SDK faux-model spike（工具/上下文/拦截/会话）
- [x] Phase 0：真实 DeepSeek provider + 流式对话 UI
- [x] Phase 0：审批等待 + 每轮研究状态投影
- [x] Phase 0：bundled Core/pi Runtime + Windows portable 包
- [x] Phase 1：真实文件树 / 文本编辑 / 保存审批 / 命令面板
- [x] Phase 1：pi 的 list_files / read_file / write_file / run_command
- [x] Phase 1：研究视图左右侧栏可折叠 + 独立 IDE 全窗口布局
- [x] Phase 1：项目 IDE + CodeMirror + 命令面板 + Git 改动/暂存/提交审批
- [x] Phase 1：对话“实验记录”列表 + 详情 + 任务书 + 相关代码 Tab
- [x] Phase 1：SQLite 任务书/实验记录 + Agent create/finish_experiment 工具
- [x] Phase 1：独立全窗口 IDE（对话视图 / IDE 视图）
- [x] Phase 1：AGENTS.md 代码规范模板 + 内置科研代码规范
- [x] Phase 1：真实研究工作区树（`.research/research.json`，新工作区为空）
- [x] Phase 1：课题 → 研究路线 → 任务层级，课题描述/文献库/聚合状态
- [x] Phase 1：输入框工具栏（附件上传、权限、模型切换）
- [x] Phase 1：左侧分栏 Agent 设置；OpenAI 协议 + Anthropic 占位
- [x] Phase 1：新建对话重置运行时 + 任务级消息持久化
- [x] Phase 1：模型即时切换 + 对话标题显示当前模型
- [x] Phase 1：可配置权限（询问/允许/拒绝）与 Core 强制执行
- [x] Phase 1：OpenAI Chat Completions 协议、模型下拉、Key 加密保存（Anthropic 占位）
- [x] Phase 1：Git 路径配置 + 可选自动 commit
- [x] Phase 1：项目工作目录热切换（重启 Core + 重载窗口，不重启应用）
- [x] Phase 1：逐种子表 + artifact 自动收集 + CodeMirror MergeView 并排 diff
- [x] Phase 1：TypeScript/JavaScript LSP（诊断、补全、hover、跳转等）
- [x] Phase 1：使用逻辑修复——审批覆盖 IDE、IPC 超时分方法、设置页如实回显、uploads/ 纳入忽略、全局错误出口、研究结构删除、实验记录 scope、12px 字号下限
- [ ] Phase 1：LSP 扩展到 Python、LSP 配置 UI、意图回归
- [ ] Phase 2：科研归档 MVP

## 远端

Gitee 私有仓库：<https://gitee.com/wx20030819/research-workbench>

## License

尚未选定。当前为私有仓库，未经明确授权不得分发。选定许可证后更新本文件，并核对所有第三方依赖的许可证与 NOTICE 要求。
