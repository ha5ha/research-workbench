# 桌面科研 Agent 工程实施方案 v1

日期：2026-10-23
状态：历史总体方案；当前按 ADR-0007/0009/0015 交付 1.0.0 有限范围，验收以 [项目控制台](../project/README.md)为准。下文各阶段目标不自动视为实现，也不作为当前完成度清单。
当前架构的唯一当期地图为 [architecture.md](../project/architecture.md)，当前视觉与交互的唯一当期合同为 [03-prototype-ui-contract.md](../standards/03-prototype-ui-contract.md)。下文 Phase 0、Drizzle/FTS5/WAL 等历史目标不能覆盖当前实现和已批准增量；不要求每个任务重读全部历史方案。
上游文档：[桌面科研 Agent 产品方案 v0.2](research_agent_desktop_proposal_v0_2.md)、[实验科研工作台产品计划 v0.2](experiment_workbench_plan_v0_2.md)、[跨会话记忆与上下文管理 v0.1](context_memory_design_v0_1.md)

本文只回答一个问题：**怎样把已经确定的产品与交互，落成一个可维护、可验证、可逐步扩展的桌面 Agent。**
产品定位、科研流程和验收场景以上游文档为准，本文不重复论证。

---

## 0. 结论先行

### 0.1 技术路线

| 决策            | 选择                                                          | 理由                                                                                                                                                         |
| --------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 桌面壳          | **Electron + React + TypeScript + Vite**                      | Agent runtime 本身是 Node/TypeScript；Electron 直接复用同一运行时，桌面打包、自动更新、PTY、子进程和 Windows 支持成熟。Tauri 仍需额外携带 Node，首版不划算。 |
| 通用 Agent 底座 | **pi（MIT）作为主选，Phase 0 嵌入验证后锁定**                 | 已有 SDK、RPC、模型供应商、工具循环、会话、压缩和扩展钩子；许可允许产品化。只接一套 runtime，不把 DSH、Codex、pi 同时叠进来。                                |
| 嵌入方式        | **pi SDK 跑在独立 core 进程；React 只通过 main/preload 访问** | 保留进程隔离、崩溃恢复和未来 headless CLI 的可能性。Renderer 不直接接触模型、文件或 Shell。                                                                  |
| 科研层          | **自研领域层**                                                | 课题、问题、任务书、运行、产物、证据、审批和上下文装配是产品核心，不能塞进 Agent 会话或模型记忆。                                                            |
| 本地存储        | **SQLite（WAL）+ FTS5 + Drizzle + 文件系统**                  | 元数据、版本、审批、运行台账和检索需要事务；大文件留在工作区/证据目录，数据库存身份、哈希和索引。                                                            |
| UI              | **严格按现有原型做设计系统**                                  | 复用原型的布局、字号、颜色、间距、响应式和交互；Radix 只提供无样式行为，不引入会覆盖视觉的组件主题。                                                         |
| 平台            | **Windows 优先，接口跨平台**                                  | 当前用户和工作环境是 Windows；Electron 跨平台，macOS/Linux 放到发布阶段验证，不阻塞首版。                                                                    |
| 仓库            | **独立新仓库，不复用科研课题仓库做应用主体**                  | 应用代码、桌面依赖、构建产物和研究数据必须隔离；原型只作为设计输入。                                                                                         |

### 0.2 一句话架构

> 一个本地 core 服务，内部同时持有科研领域数据库、pi Agent 会话和一个执行管理器；Electron 只是它的桌面客户端。

### 0.3 首版不做什么

- 不做多 Agent 编排平台，不把 planner/executor/reviewer 做成默认多进程。
- 不同时接 pi、DSH、Codex、LangGraph 四套运行框架。
- 不做云端账户、团队协作和跨设备同步。
- 不做全学科实验模板、文献知识图谱和自动论文生成。
- 不把“模型总结”当成事实、归档完成或审批通过。
- 不做无人值守的无限自动实验循环。

---

## 1. 目标、边界与验收

### 1.1 首版产品目标

用户可以在一个桌面工作区里：

1. 接入自己的模型 API，选择本地项目目录和允许访问的范围。
2. 像使用 Codex / DeepSeek Harness 一样对话，让 Agent 读文件、改代码、运行命令、查资料。
3. 把当前工作归属到课题、研究问题和子任务。
4. 审阅并冻结一份实验任务书，在明确预算和目录内启动一次运行。
5. 在运行结束后收集产物、核对完整性、生成可复算分析。
6. 在“实验记录”中按运行查看任务书、数据、文件和对话定位。
7. 形成带来源和适用范围的候选观察/结论，再决定下一步。
8. 新开窗口或长对话后，仍能从项目记录恢复，而不是靠复制聊天历史。

### 1.2 MVP 验收：两个闭环

**通用 Agent 闭环**

- 打开任意工作区，流式对话，中断、恢复、fork 会话。
- 读、搜索、改文件；运行命令；调用 MCP 工具；查看 diff 和完整日志。
- 在代码工作面查看文件树、diff、终端、测试结果与 Git 状态；Agent 修改可审阅、可回滚。
- 权限模式可切换；越界操作必须被代码拦截并请求审批，不靠提示词。
- 切换模型后会话不丢工具结果和引用关系。
- 应用崩溃/重启后能恢复会话和未完成操作的状态。

**科研闭环**

- 建课题 → 建问题/子任务 → 起草任务书 → 修改 → 批准 → 运行 → 收集 → 分析 → 候选结论 → 下一步。
- 每次运行可追到任务书版本、代码/配置、输入、目录、命令、预算和产物哈希。
- 失败、负结果、缺件、未知状态都保留，不被“成功摘要”覆盖。
- 关闭窗口/断线后不盲目重复提交；恢复时先核对原运行身份。
- 实验记录是运行归档入口，不承担聊天流内容。

这两个闭环同时通过，才算 MVP。只做一个漂亮的聊天壳，不算；只做一个实验记录 CRUD，也不算。

### 1.3 非目标与后置项

| 后置项                       | 原因                                                             |
| ---------------------------- | ---------------------------------------------------------------- |
| 多用户协作、权限组、云端同步 | 先验证单机闭环；数据模型不阻止后续加 `workspace_id` / `actor_id` |
| 论文库、PDF 精读、引文网络   | 高价值但不属于首个执行闭环；Phase 3 以适配器接入                 |
| 自动文献综述、自动写论文     | 依赖证据层和引用层稳定后再做                                     |
| 多 Agent 并行、Agent 市场    | 先用单 Agent + 工具 + Skills 证明任务完成率                      |
| SLURM/K8s 调度器             | 本地 + SSH 足够验证运行台账；调度器放 Phase 4                    |
| 全 OS 沙箱                   | 首版做工作区约束 + 审批 + 进程隔离；OS 级沙箱单独评估            |

### 1.4 代码、对话、科研：一个 Agent，三类工作面

这不是三个产品，也不是三个 Agent。底座必须先是一个能改代码、能对话、能调用工具的通用桌面 Agent；科研是可选叠加层。

| 工作面 | 职责                                                      | 不要求                       |
| ------ | --------------------------------------------------------- | ---------------------------- |
| 对话   | 讨论、规划、提问、工具调用、任务跟进                      | 不要求先建研究问题           |
| 代码   | 文件树、编辑/补丁、diff、终端、测试、Git 状态、代码上下文 | 不是只读预览，也不是完整 IDE |
| 科研   | 课题、问题、任务、任务书、审批、受管运行、产物、证据      | 不阻塞普通 coding/chat       |

**项目/工作区**：一个项目绑定一个工作目录，可以只有对话和代码，没有问题树；需要科研时再添加问题/任务/任务书。这样普通 coding 任务不会被科研结构强制打断。

**两条执行路径必须分开：**

1. **交互式编码/命令**：Agent 在工作区读写、运行测试、调试；产生 workspace 快照、diff、terminal 日志和权限审计。这是 Codex/pi 场景。
2. **受管科研运行**：只有冻结任务书后才启动；绑定代码 revision、配置、输入、预算、执行器和产物清单；由 RunManager 记录状态，不由聊天窗口持有生命周期。

任务书批准时冻结代码 revision。交互式修改代码不会自动改变已批准运行；运行使用冻结版本，后续代码变化必须生成新任务书版本或新的 run 绑定。

**代码工作面的最低验收：**

- 文件树与忽略规则、打开文件、语法高亮。
- Agent 补丁的 diff 预览、接受/拒绝/回滚（至少做到 workspace 快照级回滚）。
- 集成终端（PTY）、测试命令运行与输出摘要。
- Git status/diff；不要求首版做完整 Git 客户端。
- 从对话里的文件变更卡直接跳到代码工作面。
- 不把完整终端输出/大文件塞进模型上下文，保留 artifact 引用。

**顺序要求：** Phase 1 必须先通过“真实 coding 任务”验收，Phase 2 再叠加科研归档。否则会出现“科研功能很多、但连日常改代码都不好用”的倒置。

### 1.5 计算科研能力门禁

不是所有通用 Agent 能力都值得做。保留标准只有一个：**它是否直接减少研究者在代码、数据分析、结论整理或研究路线上的手工负担。**

保留：

- workspace、代码编辑/patch、diff、终端、测试、Git；
- 会话/恢复/压缩/检查点、模型切换；
- 权限/审批、MCP、Web、Skills；
- 长任务/后台状态；
- 子 Agent 仅在独立检索、独立审阅等明确场景使用。

暂缓或不做：

- IDE 插件、PR review/issue 自动化、云端开发环境；
- 多仓库/多人协作、应用部署；
- 与计算科研无关的客服/销售连接器、通用浏览器自动化；
- 自动论文生成/投稿作为首版目标。

### 1.6 科研特性的三条主线

用户用普通编程 Agent 时，真正变乱的是三件事，产品必须分别接住：

| 痛点           | 产品机制                                                           | 不能只靠                 |
| -------------- | ------------------------------------------------------------------ | ------------------------ |
| 数据分析靠手工 | data.profile / data.analyze / stats.review；脚本、artifact、可复算 | 聊天里贴一张表、模型口算 |
| 结论整理靠手工 | claim/evidence ledger、支持/反证、适用范围、更正链                 | 一段“总结如下”           |
| 科研路线靠记忆 | question/task tree、decision log、checkpoint、next-step            | 聊天历史/用户笔记        |

### 1.7 Research Skills

科研能力以有合同的 skills 交付，不以 prompt 代替：

- Tier 0（首版必须）：checkpoint、decision-log、evidence-ledger、next-step。
- Tier 1（Phase 3）：literature.scout、literature.ingest、literature.review、citation.verify、experiment.design、data.profile、data.analyze、stats.review、evidence.synthesize、repro.audit。
- Tier 2（后置）：related-work matrix、paper outline/draft、research.review、领域包。

每个 skill 必须有输入、工具、确定性步骤、输出、审批点、来源、失败模式和评测；只能产生 artifact/proposal，不能自动确认 claim、批准 run 或删除证据。详见 [Research Skills 规范](../standards/04-research-skills.md) 和 [Skills 体系](../research/computational-research-skills.md)。

---

## 2. 总体架构

### 2.1 进程与职责

```text
┌────────────────────────────────────────────────────────────┐
│ Electron Renderer (React)                                  │
│ 对话 / 状态 / 实验记录 / 代码 / 设置                         │
│ 不接触 Node、文件系统、数据库、模型密钥                       │
└──────────────────────────┬─────────────────────────────────┘
                           │ contextBridge + typed IPC
┌──────────────────────────▼─────────────────────────────────┐
│ Electron Main                                              │
│ 窗口、菜单、托盘、更新、safeStorage、core 生命周期           │
│ 只做外壳与转发，不写科研业务逻辑                             │
└──────────────────────────┬─────────────────────────────────┘
                           │ JSON-RPC over stdio / MessagePort
┌──────────────────────────▼─────────────────────────────────┐
│ Core (Node, 独立进程)                                       │
│                                                            │
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────────┐ │
│  │ ResearchService│  │ AgentHost        │  │ RunManager  │ │
│  │ 项目/问题/任务  │  │ pi SDK session   │  │ 运行台账     │ │
│  │ 任务书/审批     │  │ context assembly │  │ 状态轮询     │ │
│  │ 证据/记录       │  │ ToolGateway      │  │ 本地/SSH     │ │
│  └───────┬────────┘  └────────┬─────────┘  └──────┬──────┘ │
│          │                    │                    │        │
│  ┌───────▼────────────────────▼────────────────────▼──────┐ │
│  │ WorkspaceService: file tree / diff / Git / snapshot     │ │
│  └────────────────────────────┬───────────────────────────┘ │
│                               │                             │
│  ┌────────────────────────────▼───────────────────────────┐ │
│  │ SQLite / migrations / event log / FTS5                 │ │
│  └────────────────────────────┬───────────────────────────┘ │
│                               │                             │
│  ┌────────────────────────────▼───────────────────────────┐ │
│  │ ArtifactStore: manifest / sha256 / path / parser       │ │
│  └────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### 2.2 为什么 Core 必须独立

- Agent 会崩溃、被中断、升级或重启；科研记录和运行台账不能跟着丢。
- 未来 CLI、无窗口模式和自动化测试需要复用同一套服务。
- Renderer 被攻破时不应直接获得文件系统和 Shell 权限。
- 模型调用、工具执行和数据库写入必须在同一权限边界内串行审计。
- Electron main 只负责桌面生命周期，换成别的壳时 Core 不变。

### 2.3 通信协议

- Renderer ↔ Main：`contextBridge` 暴露白名单方法，TypeScript 类型由 `packages/contracts` 生成。
- Main ↔ Core：版本化 JSON-RPC 2.0，stdin/stdout 或 `MessagePort`；不监听公网端口。
- 命令：`project.get`、`chat.prompt`、`chat.abort`、`approval.respond`、`run.start`、`record.get`。
- 事件：`session.delta`、`tool.start`、`tool.end`、`approval.request`、`run.status`、`artifact.added`、`context.built`。
- 每个事件有单调递增 `seq`，断线重连可从 `seq` 回放；大输出走 artifact 引用，不走消息 JSON。
- 协议只暴露领域能力，不暴露 pi 内部对象；pi 的升级不能改变 UI 契约。

### 2.4 一次请求的数据流

```text
用户发送消息
  → Renderer 生成 clientRequestId
  → Main 转发 chat.prompt 到 Core
  → ContextAssembler 读取当前项目/问题/状态/证据/检查点
  → pi session 组装模型请求
  → 流式 delta / tool.start 事件回到 Renderer
  → 工具执行经过 ToolGateway
      ├─ 允许：执行并记录
      ├─ 需要审批：发 approval.request，等待用户
      └─ 拒绝：返回结构化拒绝结果
  → agent_settled 后保存会话检查点摘要与事件
```

---

## 3. Agent 运行时

### 3.1 选型：pi 作为通用层

已核对 pi 当前公开资料：

- 包名：`@earendil-works/pi-coding-agent`，README 标注 MIT；当前包版本为 `1.4.0`，要求 Node `>=22.19`。
- 同时提供 SDK、RPC、JSON 事件流、扩展和会话树；适合“嵌入自有 UI”，而不是只能 fork TUI。
- `pi-agent-core` 明确提供 `transformContext`、工具执行、事件流和 `beforeToolCall` / `afterToolCall` 钩子。
- `pi-ai` 覆盖 OpenAI、Anthropic、DeepSeek、Google、OpenRouter、OpenAI-compatible（Ollama/LM Studio/vLLM）等供应商。

参考：[pi SDK](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md)、[pi RPC](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/rpc.md)、[pi 扩展](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)、[pi-agent-core](https://github.com/badlogic/pi-mono/blob/main/packages/agent/README.md)。

**采用方式：**

- 在 Core 进程内使用 pi SDK 创建 Agent session，不启动 TUI。
- 通过 `DefaultResourceLoader` 注入我们的科研扩展和工具，不加载用户不可信的项目扩展。
- pi 负责模型调用、工具循环、流式事件、重试、会话与压缩。
- 我们负责科研上下文装配、工具权限、运行台账、产物和证据；不把科研状态交给 pi 的会话文件。

### 3.2 Phase 0 嵌入验证门

在写业务 UI 前，先做一个最小 Core + pi spike，必须验证：

1. 自定义 `context` / `context_with_system` 钩子能否在每次模型请求前注入当前科研上下文。
2. 自定义工具能否被注册、流式更新、取消，并拿到完整工具结果。
3. `tool_call` / `beforeToolCall` 能否拦截任意写文件、Shell、网络和 MCP 调用，且模型无法绕过。
4. 会话能否持久化、恢复、fork、压缩，并保留工具调用/结果配对。
5. DeepSeek 和至少一个 OpenAI-compatible 本地模型能完成多步工具调用。
6. Windows 下子进程启动、取消、退出、路径编码和 Electron 打包可用。
7. 模型 API 密钥不进入日志、会话文件或 Renderer。

**通过**：锁定 pi SDK，进入 Phase 1。
**不通过**：保留 `AgentRuntime` 接口，降级到 `pi-agent-core` + 自研会话/上下文循环；不并行接入第二套完整 runtime。任何选择都写成 ADR。

### 3.3 上下文装配

每轮请求按固定顺序装配，而不是把聊天历史全塞进去：

1. 产品规则、项目规则、当前权限与预算。
2. 当前课题 → 问题 → 子任务状态（含版本）。
3. 当前任务书版本、活动运行、最近检查时间和未决审批。
4. 直接依赖的事实/观察/结论，含状态、适用范围、反证和更正链。
5. 会话检查点：目标、用户纠正、已完成、未决、唯一下一动作。
6. 近期完整消息与工具结果。
7. 按当前问题和来源范围检索到的补充证据。
8. 明确的输出/工具预算和“哪些内容未加载”的说明。

实现上优先使用 pi 扩展的 `context` 钩子；如果它只能追加、不能替换完整投影，使用 `transformContext` 或自研 loop。无论哪种方式，`ContextAssembler` 都独立于 pi，可单独测试。

**硬规则：**

- 上下文装配不能升级事实状态、改变审批或扩大执行权限。
- 摘要必须带来源 `sourceEventSeqs` / 对象 ID；原文永久保留。
- 大日志、整份 CSV、完整论文不反复注入；返回定位符、统计摘要和按需片段。
- 每轮保存实际加载的对象 ID、版本和 token 估算，UI 可查看。

### 3.4 工具分层

**通用工具**

- `fs.read` / `fs.write` / `fs.patch` / `fs.list` / `fs.search`
- `shell.exec` / `shell.pty` / `shell.cancel`
- `web.search` / `web.fetch`
- `mcp.*`（官方 MCP SDK）
- `todo` / `plan` / `skill`（Skills 通过受控目录加载）
- 后续：`browser`、`subagent`、`notebook`

**科研工具**

- `project.get_state` / `project.search`
- `task.propose` / `plan.propose` / `plan.get`
- `run.request`（只创建待审批请求，不直接执行）
- `run.status` / `run.cancel`
- `artifact.list` / `artifact.stat` / `artifact.read_slice`
- `analysis.run`（仅运行已登记分析器）
- `evidence.propose` / `evidence.link`
- 后续：`literature.search` / `material.ingest` / `paper.export`

**禁止暴露给模型的工具**

- `approval.approve` / `approval.reject`
- `claim.confirm` / `claim.retract`
- `run.force_start` / `artifact.delete`
- 任何可以修改权限策略或密钥的工具

审批必须来自 UI 的明确用户动作；模型只能“提议”。

### 3.5 工具网关与权限

所有工具调用经过 `ToolGateway`，而不是依赖模型自觉：

```text
模型 tool_call
  → 参数 schema 校验
  → 路径规范化与工作区边界检查
  → 命令分类（读/写/执行/网络/删除/提权）
  → 当前审批范围匹配
  → 允许 / 需要审批 / 拒绝
  → 执行或返回结构化 blocked 结果
  → 记录 tool_call、cwd、参数摘要、结果摘要、artifact 引用
```

三种用户可见模式：

| 模式       | 文件       | Shell                      | 网络              | 适用                 |
| ---------- | ---------- | -------------------------- | ----------------- | -------------------- |
| 只读分析   | 工作区只读 | 只读命令                   | 需审批            | 阅读、审查、方案讨论 |
| 工作区执行 | 工作区内写 | 范围内可执行；危险操作审批 | 需审批/域名白名单 | 默认的日常 Agent     |
| 完全访问   | 不限       | 不限                       | 不限              | 高级用户；默认不开启 |

首版实现：

- 路径规范化 + 符号链接解析 + 工作区 jail。
- 命令分类器和危险命令拒绝清单；不是安全边界，但能减少误操作。
- 子进程使用独立进程组/Job Object；取消时杀进程树。
- 环境变量白名单；清除模型/密钥环境变量。
- 网络工具和外部发送单独审批。
- 写入前保存可回滚快照/变更记录（至少记录 diff 与文件哈希）。

后续再加 OS 级沙箱；参考 Codex 的“沙箱与审批分层”，但不把 Rust 二进制直接嵌入首版。参考：[Codex approvals & security](https://developers.openai.com/codex/agent-approvals-security)。

### 3.6 会话、压缩与恢复

- pi 负责会话文件、分支、压缩和自动重试；Core 把会话元数据映射到项目/问题/子任务。
- 会话不直接成为科研事实；会话检查点只是工作材料。
- 每次工具执行前持久化事件；副作用前写 checkpoint。
- 崩溃/重启后：
  - 恢复会话与待审批请求。
  - 对运行先查台账，再决定是否重试。
  - 状态未知的本地进程标记 `unknown`，不自动重跑。
- 新会话不复制旧聊天，装载项目状态、当前任务书、活动运行、已接受事实/反证和检查点。
- 会话分支可 fork；科研问题树独立，不把聊天分支当问题分支。

### 3.7 模型接入

- 使用 `pi-ai` 的 provider/model 目录；首版优先 DeepSeek、OpenAI、Anthropic、OpenAI-compatible。
- 密钥存 Electron `safeStorage`；Core 通过受控 IPC 获取短期解密值，不写日志/数据库。
- 模型设置包含 API base、model id、context 上限、工具调用能力、费用元数据。
- 切换模型时重建上下文投影；不静默裁剪关键约束。
- 连接测试必须验证“文本 + 工具调用 + 工具结果回传”，不能只测聊天。
- 模型选择可绑定项目默认、会话覆盖；每次调用记录 provider/model/version。

### 3.8 MCP、Skills 与子 Agent

- MCP 用官方 SDK；连接配置存项目/用户设置，工具列表进入 ToolGateway，仍受权限约束。
- Skills 是受控的 Markdown/脚本包，用于科研流程；Skill 不能绕过工具权限。
- 子 Agent 后置：先用单 Agent + 明确工具分层验证任务完成率；架构保留 `spawn_subagent` 接口但不默认启用。

---

## 4. 科研领域层

### 4.1 对象模型

```text
Project (课题)
  ├─ Material (背景/论文/数据说明)
  ├─ Question (研究问题, 可父子/关联)
  │    ├─ Task (子任务)
  │    │    ├─ Plan (实验任务书, 多版本)
  │    │    │    └─ Approval (冻结/预算/范围)
  │    │    └─ Run (一次实际执行/尝试)
  │    │         ├─ RunEvent (状态事件)
  │    │         ├─ Artifact (原始/派生/缓存)
  │    │         └─ Analysis (可复算分析)
  │    └─ Claim (观察/解释/结论, 状态+范围)
  │         └─ EvidenceLink (支持/反证/来源)
  ├─ Decision (下一步/改向/收尾)
  └─ Session (会话, 绑定节点)
```

核心约束：

- `Plan` 是版本化合同；批准后不可静默修改，修改生成新版本。
- `Run` 绑定 `plan_id + plan_version`、唯一 run ID、attempt ID、执行器、cwd、command、代码/配置/输入身份。
- `Artifact` 绑定 `run_id` 或外部来源，记录 sha256、大小、类型、保留策略、父产物。
- `Claim` 不等于 `Artifact`；观察、解释、审核结论分开，状态可为 candidate / confirmed / disputed / corrected / unresolved。
- `Approval` 不可变，记录批准范围、对象版本、批准人、时间和撤销链。
- 关系表允许多个问题引用同一证据，不复制原始文件。

### 4.2 状态机

**Run**

```text
preparing → submitted → queued → running
   → finished → collecting → verified → analyzing → review
   ↘ failed
   ↘ unknown（连接/进程状态不可确认）
   ↘ canceled
```

- `finished` ≠ `verified` ≠ `analyzing` ≠ `review` ≠ 问题解决。
- 每次状态变更记录来源（local/ssh/poll/event/UI）、时间、依据。
- 技术重试创建新 attempt；科学条件改变创建新 plan version。

**Approval**

- `draft → pending → approved | rejected | expired | revoked`
- 批准内容必须包含：任务书版本、cwd、命令/输入范围、预算、执行器、产物路径、停止条件。
- 单次批准不等于无限循环；批量授权必须有次数/预算/停止条件。

### 4.3 运行与执行器

首版：

- `LocalExecutor`：Windows 进程组、stdout/stderr 落盘、PTY 交互、取消、退出码。
- `SshExecutor`：系统 SSH 或 `ssh2`；远程目录、命令、状态、产物同步。
- `RunManager`：先写台账再启动；幂等键；状态轮询短连接；完成事件；未知状态核对。
- 本地任务在应用退出时明确标注“可能已终止”；远端任务由远端决定。
- 大输出不进入模型上下文；按段读取、统计摘要、错误索引。

Phase 4 再加 SLURM/K8s、MLflow、DVC；它们都是适配器，不进入科研核心对象。

### 4.4 产物、分析与证据

- 任务书声明预期产物：路径/模式、来源、粒度、关键字段、单位、数量/覆盖、解析器、保留类别。
- 运行后生成 manifest：缺失、意外文件、哈希、解析状态、大小、重复。
- 解析器先支持 CSV/JSON/日志/图片/压缩包/简单表格；失败进入待解析，不静默丢弃。
- 分析脚本登记版本、参数、输入 artifact IDs、输出表图；重新分析生成新版本。
- Claim 必须引用 artifact/analysis/run 或外部来源；UI 可从结论下钻到原文件行/页。
- 清理只处理“可重算、无引用、来源明确”的缓存；删除前列出影响并审计。

### 4.5 科研 Skills（首版）

| Skill            | 职责                              | 不能做什么             |
| ---------------- | --------------------------------- | ---------------------- |
| 研究规划         | 从问题/证据生成候选任务与任务书   | 不能自行批准或扩大范围 |
| 数据审计         | 检查缺件、schema、覆盖、异常      | 不能修改原始数据       |
| 统计复核         | 检查配对、聚合、效应量、多重比较  | 不能替代研究者接受结论 |
| 证据审阅         | 为候选结论整理支持/反证/边界      | 不能把候选升级为已接受 |
| 实验复现         | 根据任务书/运行材料重建命令与环境 | 不能静默改变条件       |
| 论文写作（后置） | 只从已接受 claim 组织草稿         | 不能虚构引用或结果     |

### 4.6 数据存储

- 全局元数据库：`appData/research-workbench.db`，WAL，迁移用 Drizzle。
- 项目证据目录：`<project>/.research/` 或用户指定目录；存 manifest、run logs、关键 artifact 副本、导出。
- 大文件优先引用原位置；关键证据可复制并记哈希；不强制迁移用户数据目录。
- FTS5 索引会话、材料摘要、claim、artifact 名；向量检索后置。
- 事件表 append-only；对象表有 `version` 和 `updated_at`；写入用事务 + 乐观版本检查。

建议核心表：

```text
projects, materials, questions, tasks, plans, plan_versions, approvals,
runs, run_events, artifacts, analyses, claims, claim_evidence,
decisions, sessions, session_checkpoints, audit_events, settings
```

---

## 5. UI 与设计系统

### 5.1 原型是唯一视觉基线

以 `docs/product/prototype/index.html` 为准，不在实现阶段“重新设计一版”：

| 原型元素                                   | 实现                                                            |
| ------------------------------------------ | --------------------------------------------------------------- |
| 272px 侧栏 / 720px 对话 / 300px 检查器     | CSS Grid / 三栏布局；1279px 以下检查器抽屉；900px 以下侧栏 rail |
| 系统字体栈、无 WebFont                     | `Inter → Segoe UI → Microsoft YaHei`；禁用 `font-synthesis`     |
| 正文 14/24，元数据 13，最小 12             | 设计 token 固化；低于 12px 的声明直接 lint 拦截                 |
| 颜色 #F9FAFB / #ECEEF0 / #EDF3FE / #4176E6 | `tokens.css` 变量；不在组件里写散落色值                         |
| 1px 实线边框、克制的圆角                   | 统一 border/radius token                                        |
| 对话 / 状态 / 实验记录 / 代码              | 顶部 Tab + 右侧状态检查器                                       |
| 实验记录 master-detail                     | 记录列表 + 概览/逐种子/文件/任务书                              |
| 无衬线数字、等宽代码                       | 只使用系统字体；代码用等宽栈                                    |

### 5.2 组件与行为

- `packages/ui`：设计 token、基础控件、布局、消息卡、任务书、记录表、状态面板。
- Radix 只用于 Dialog、Popover、Menu、Tabs、Tooltip 的行为；样式全部自定义。
- 不引入 Tailwind 默认主题、Ant Design、MUI 等会覆盖原型视觉的库。
- 图标从原型 SVG 提取成统一 icon registry；不混用多套图标库。
- 统一键盘焦点、`aria-*`、Esc/回车、快捷键和 reduced-motion。
- 桌面交互：原生菜单、最近项目、更新提示、托盘/后台运行说明、窗口尺寸记忆。
- 首版只做浅色主题；深色主题不阻塞。

### 5.3 视觉验收

- Playwright 截图回归：1440×900、1024×768、390×844。
- 关键页面：对话、状态、实验记录列表、记录详情（概览/逐种子/文件/任务书）、代码、设置、审批弹窗。
- 自动检查：无横向溢出、无 <12px 文本、无 700+ 字重、无低对比正文、焦点可见。
- 真实数据长度测试：长标题、长路径、长日志、空数据、错误状态、窄屏。

---

## 6. 开源复用边界

原则：**能复用成熟底层就复用，科研对象和交互自己拥有。**
任何依赖在引入前固定版本/提交、核对直接与传递依赖许可证、写 ADR；不为“看起来先进”增加第二套运行时。

### 6.1 采用

| 能力                         | 项目                                        | 许可              | 用法                                  |
| ---------------------------- | ------------------------------------------- | ----------------- | ------------------------------------- |
| Agent 循环、模型、会话、工具 | `@earendil-works/pi-coding-agent` / `pi-ai` | MIT               | Core 内嵌 SDK；固定版本；Phase 0 验证 |
| 桌面壳                       | Electron                                    | MIT               | 主进程/preload/renderer               |
| UI 框架                      | React + Vite                                | MIT               | renderer                              |
| 无样式交互                   | Radix Primitives                            | MIT               | 对话框、菜单、Tabs、Tooltip           |
| SQLite 驱动                  | better-sqlite3                              | MIT               | 本地元数据/事件/FTS                   |
| ORM/迁移                     | Drizzle ORM                                 | Apache-2.0        | schema 与迁移                         |
| MCP                          | `@modelcontextprotocol/sdk`                 | MIT（引入前复核） | 外部工具                              |
| 终端                         | node-pty + xterm.js                         | MIT               | 交互式命令/日志                       |
| 代码查看                     | CodeMirror 6 + Shiki                        | MIT               | diff/语法高亮                         |
| Markdown/公式                | react-markdown + remark-gfm + KaTeX         | MIT               | 消息渲染                              |
| PDF（后置）                  | pdf.js                                      | Apache-2.0        | 论文阅读                              |
| SSH                          | ssh2 或系统 ssh                             | MIT               | 远程执行                              |
| 打包/更新                    | electron-builder + electron-updater         | MIT               | 安装包/更新                           |
| 测试                         | Vitest + Playwright                         | MIT / Apache-2.0  | 单测/E2E/截图                         |
| 日志                         | pino                                        | MIT               | Core 结构化日志                       |

### 6.2 参考，不作为依赖

| 项目             | 参考点                                           | 许可/处理                            |
| ---------------- | ------------------------------------------------ | ------------------------------------ |
| DeepSeek Harness | 权限预设、检查点、事件日志与上下文投影、会话查询 | MIT；只参考机制/交互，不 fork 产品   |
| Codex            | 沙箱与审批分层、越界展示、app-server 交互        | Apache-2.0；参考安全模型，不嵌入 CLI |
| OpenCode         | 桌面端与 server 分离、agent 模式                 | 参考；不引入第二套 runtime           |
| LangGraph        | checkpoint / store 分层                          | MIT；只参考持久化边界                |
| MLflow           | 参数/指标/运行/产物对比                          | Apache-2.0；Phase 4 适配器           |
| DVC              | 数据版本与引用回收                               | Apache-2.0；Phase 4 适配器           |
| Jupyter          | kernel/notebook 执行                             | BSD；后置                            |

### 6.3 自研

- 科研对象模型、状态机、审批边界、任务书版本。
- `ContextAssembler` 与检查点策略。
- `ToolGateway` / 权限分类 / 工作区 jail。
- Run ledger、执行器适配、产物 manifest/哈希/解析。
- Claim/evidence/provenance 与实验记录 UI。
- 原型设计系统与桌面交互。

### 6.4 不采用

- 直接把 Codex/DSH 的 UI 或整个应用 fork 成产品。
- 用 LangGraph 做首版 runtime；会和 pi 的会话/工具循环重复。
- 用 AutoGen/CrewAI 这类多 Agent 框架承载主流程；首版不需要。
- 用 AGPL/GPL 代码进入闭源客户端；如需要，只能通过独立进程/服务边界评估。

---

## 7. 仓库结构

推荐独立仓库：`research-workbench/`（名称待定）。

```text
research-workbench/
  apps/
    desktop/
      src/main/                 # 窗口、菜单、更新、safeStorage、core supervisor
      src/preload/              # 白名单 IPC
      src/renderer/
        app/                    # 路由/启动
        features/
          chat/
          projects/
          records/
          status/
          code/
          settings/
        styles/                 # tokens/base
    core/
      src/
        rpc/                    # JSON-RPC server、schema、seq
        agent/                  # pi session、context assembler、tool gateway
        research/               # 项目/问题/任务/任务书/审批/证据
        runs/                   # run manager、状态机、轮询
        executors/              # local / ssh
        artifacts/              # manifest/hash/parser
        store/                  # sqlite、migrations、repositories
        security/               # path jail、command policy、redaction
  packages/
    contracts/                  # RPC/事件/领域 DTO（无内部实现依赖）
    domain/                     # 纯领域模型与状态机
    db/                         # Drizzle schema/migrations
    agent-runtime/              # pi adapter + research tools
    executors/                  # 执行器接口与实现
    artifacts/                  # 产物/解析工具
    ui/                         # 设计系统与组件
    config/                     # tsconfig/eslint/prettier
    testkit/                    # fake provider/executor/fixtures
  tests/
    e2e/                        # Playwright Electron
    integration/                # core + sqlite + rpc
    security/                   # 越界、命令、密钥泄漏
  docs/
    architecture/
    adr/
    product/
  scripts/
  package.json
  pnpm-workspace.yaml
  turbo.json
```

依赖方向：

```text
contracts ← domain ← db
contracts ← agent-runtime ← core
contracts ← ui (types only)
apps/desktop → contracts (not core internals)
```

- 禁止 `ui` 直接依赖 `db`/`core` 的实现。
- 禁止 `domain` 依赖 Electron/pi/SQLite。
- Core 是唯一拥有副作用和数据库连接的地方。
- 所有跨进程类型从 `contracts` 导出；协议变更走版本与兼容测试。

工程规范：

- pnpm workspace + Turborepo；TypeScript strict；ESLint + Prettier。
- 每个包有 README、边界说明和测试入口。
- 提交前：`typecheck`、`lint`、`test`、`build`；CI 矩阵至少 Windows + macOS。
- 数据库迁移只增不改；事件 schema 有版本。
- 错误使用结构化 code；UI 展示可操作信息，不显示堆栈。
- 日志默认脱敏；密钥、token、用户路径按规则 redaction。

---

## 8. 安全与隐私

| 风险                  | 措施                                                             |
| --------------------- | ---------------------------------------------------------------- |
| Renderer 拿到 Node/FS | sandbox、contextIsolation、CSP、无 remote module；preload 白名单 |
| 模型越界执行          | ToolGateway 代码拦截；审批来自 UI；模型不能调用批准工具          |
| 路径穿越/符号链接     | realpath + 根目录校验；禁止未授权挂载                            |
| Shell 注入            | 参数化/直接 exec；不拼接不可信字符串；命令分类与审计             |
| 密钥泄漏              | safeStorage；不写日志/DB/会话；内存最小化；导出时排除            |
| 外部内容提示注入      | 材料/网页/工具输出标记为 untrusted；指令不能提升权限             |
| 供应链                | lockfile、依赖审查、SBOM、签名更新、固定 pi 版本                 |
| 数据外发              | 明确“允许发送给模型”的范围；本地模型可离线；网络审批             |
| 运行重复提交          | run ledger + 幂等键；未知状态先查后重试                          |
| 证据被覆盖            | append-only 事件；版本化 claim/plan；删除需审批与审计            |

本地优先：默认不需要产品云账户；遥测默认关闭，可显式开启；崩溃报告不含研究内容。

---

## 9. 测试与验收

### 9.1 测试层次

- **Domain 单测**：任务书版本、审批范围、run 状态机、claim 状态、清理规则。
- **Store 集成**：SQLite 事务、迁移、FTS、乐观版本冲突。
- **RPC 集成**：seq 回放、断线重连、取消、错误码、背压。
- **Agent 测试**：fake provider + fake tools，确定性地测工具循环、审批、压缩、恢复。
- **Executor 测试**：本地进程取消、超时、退出码、日志、缺件；SSH 用 mock/容器。
- **E2E**：Playwright + Electron，走真实 UI 到 fake core。
- **视觉回归**：原型关键页截图；字号/对比/溢出自动检测。
- **安全测试**：路径穿越、符号链接、命令注入、密钥日志泄漏、MCP 越权。

### 9.2 必须通过的场景

1. 新建项目 → 对话 → 读文件 → 提议任务书 → 用户编辑/批准 → 本地运行 → 产物 → 分析 → 记录详情 → 下一步。
2. 模型请求写工作区外文件 / 执行危险命令 → 正确拦截并请求审批。
3. 运行超时、断网、应用重启 → 不重复提交；状态可解释。
4. 失败运行和负结果保留；重试是新 attempt。
5. 长会话触发压缩 → 新会话恢复；关键约束和事实不丢。
6. 切换模型 → 工具结果和引用保持；密钥不可见。
7. 产物缺件/解析失败 → 记录显示不完整，不生成看似完整的结论。
8. 从结论下钻到 run → artifact → 原文件/行；从记录定位对话。
9. 两个窗口同时改同一任务书/事实 → 版本冲突，旧写入不覆盖。
10. 390px/1440px 无横向溢出；无 <12px 文本/低对比正文。

---

## 10. 阶段计划

按 2–3 名工程师估算；单人开发至少翻倍。时间不是承诺，退出标准才是。

| 阶段                       | 时间   | 交付                                                                                                                                                                                           | 退出标准                                                                                        |
| -------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Phase 0 基础与选型验证** | 1–2 周 | 新仓库骨架、RPC 契约、Electron/core 最小进程、设计 token 与静态壳；pi 嵌入 spike；ADR-001/002/003                                                                                              | 能流式对话、调用一个受控工具、审批拦截、崩溃重启恢复；原型主布局 1:1；pi 选型通过或明确降级     |
| **Phase 1 通用 Agent MVP** | 3–4 周 | 项目选择、chat、文件/搜索/Shell/diff、**代码工作面（文件树/编辑/diff/终端/Git）**、权限三模式、模型设置、会话恢复、MCP 基础、命令面板、错误/中断                                               | 能作为日常 coding agent 完成一个真实小任务；代码修改可审阅/回滚；越界不可绕过；切换模型不丢会话 |
| **Phase 2 科研归档 MVP**   | 4–5 周 | 课题/问题/任务、**研究路线/决策/证据台账、Tier 0 skills**、任务书版本、审批、本地运行台账、产物 manifest、实验记录 master-detail、任务书/逐种子/文件、对话定位                                 | 一条完整“任务书→运行→归档→记录查看”闭环；路线/决策/未决项可恢复；失败/缺件保留；UI 与原型一致   |
| **Phase 3 研究闭环**       | 4–6 周 | **Tier 1 skills（data.profile/analyze、stats.review、evidence.synthesize、literature、repro）**、分析器版本化、claim/evidence、上下文装配、检查点/新会话、SSH 执行器、状态轮询、对比视图、导出 | 新会话能接续；数据分析可复算；结论可追溯；断线不重复；两个计算场景通过                          |
| **Phase 4 加固与 Beta**    | 2–3 周 | 安装包、签名、自动更新、崩溃恢复、性能、可访问性、安全审计、文档                                                                                                                               | Windows Beta 可安装、可升级、可恢复；无高危安全阻断；已知问题清单明确                           |

**MVP 范围 = Phase 2 结束。** Phase 3 才是“科研 Agent”真正闭环；不要把 Phase 2 的 CRUD 演示说成完整产品。

---

## 11. 风险与备选

| 风险                              | 触发信号                        | 备选                                                               |
| --------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| pi 上下文钩子不足以支撑科研装配   | 无法替换完整投影/无法按请求注入 | 降级 `pi-agent-core` + 自研 session/compaction；仍用 pi-ai；写 ADR |
| pi 与 Electron Node 版本/打包冲突 | 原生依赖/ESM/子进程问题         | Core 用独立 Node 22 runtime；应用壳不改                            |
| Windows 沙箱能力不足              | 危险命令无法可靠隔离            | 首版明确“审批 + 工作区约束”定位；Phase 3 做 OS 沙箱/容器适配       |
| 上下文装配错误导致事实越权        | 新会话把旧候选当已确认          | 强制状态/版本/来源；用固定接续样例回归；宁可不加载                 |
| 科研对象过度设计                  | 首版流程走不通                  | 先锁定任务书/运行/产物/claim 四对象；其余后置                      |
| UI 迁移偏离原型                   | 组件库样式覆盖/字号漂移         | 原型 token 单一来源；截图回归；禁用默认主题                        |
| Agent 工具权限被绕过              | 任意内置工具不受网关            | 关闭默认写/Shell 工具，只注册受控工具；扩展白名单                  |
| 运行重复/状态漂移                 | 超时后自动重启                  | run ledger、幂等键、unknown 状态、先查后重试                       |
| 范围膨胀                          | 同时做多 Agent/文献/论文        | 以 Phase 2/3 退出标准为准；新需求进 backlog                        |

### 关键 ADR（实现前落文件）

- ADR-001：pi SDK 嵌入 vs `pi-agent-core` 自研 loop。
- ADR-002：Electron main / core / renderer 进程边界与 RPC。
- ADR-003：SQLite schema、事件日志与审计。
- ADR-004：权限模型与命令分类。
- ADR-005：任务书冻结、运行台账与幂等。
- ADR-006：UI token 与原型迁移策略。

---

## 12. 立即可执行（确认后前 10 个工作日）

1. 建独立仓库 `research-workbench`，pnpm + Turborepo + TS strict + CI。
2. 复制原型设计为 `packages/ui/tokens.css` 和静态壳，先不接真实数据。
3. 立 Electron 最小窗口 + preload 白名单 + core 子进程 + JSON-RPC 握手。
4. 完成 pi spike：流式、工具、审批拦截、会话恢复、Windows 打包。
5. 写 ADR-001/002，锁定 runtime 与进程边界。
6. 用 fake provider/fake executor 打通“发送消息 → 工具调用 → 审批 → 运行状态”链路。
7. 建 SQLite schema v0 与 domain 纯模型；不接真实执行。
8. 用原型主场景做 E2E 骨架与视觉基线截图。
9. 产出第一份技术 demo：真实文件读取 + 受控写 + 权限拒绝 + 断线恢复。
10. 评审后再进入 Phase 1 完整工具与 UI。

---

## 13. 待确认

1. **仓库与品牌**：是否用独立仓库 `research-workbench`？产品名是否沿用 “Research / 科研工作台”？
2. **平台顺序**：确认 Windows 优先、macOS/Linux 后置？还是首版就要求三端安装包？
3. **Agent 底座**：认可“pi SDK 为主选、Phase 0 验证后锁定、失败降级 pi-agent-core”？
4. **首版执行器**：Phase 2 只做本地执行器，SSH 放 Phase 3；还是首版必须包含 SSH？
5. **模型范围**：首版 DeepSeek + OpenAI-compatible 是否够？Anthropic 是否必须首版？
6. **团队/时间**：几个人、期望首个可演示版本的时间点？

---

## 14. 参考

- [pi SDK](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md) · [pi RPC](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/rpc.md) · [pi 扩展](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md) · [pi-agent-core](https://github.com/badlogic/pi-mono/blob/main/packages/agent/README.md)
- [Codex approvals & security](https://developers.openai.com/codex/agent-approvals-security) · [Codex repository](https://github.com/openai/codex)
- [DeepSeek Harness permission presets](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/interaction/permission-presets/README.md)
- [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence)
- [MLflow Tracking](https://mlflow.org/docs/latest/ml/tracking/) · [DVC](https://dvc.org/doc)
- 本仓库产品文档：`research_agent_desktop_proposal_v0_2.md`、`experiment_workbench_plan_v0_2.md`、`context_memory_design_v0_1.md`
