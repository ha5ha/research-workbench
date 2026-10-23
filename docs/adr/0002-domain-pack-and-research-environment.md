# ADR-0002：Domain Pack 与 Research Environment 边界

- 状态：Proposed（待确认；确认后转 Accepted）
- 日期：2026-10-23
- 关联：[垂直领域 Agent 调研](../research/2026-10-23-vertical-agent-patterns.md)、[ADR-0001](0001-agent-runtime-and-process-boundary.md)

## 背景

当前规范已经要求 Agent 内核和科研特性分离，但还没有一个显式的“领域包/领域环境”接口。实现时容易出现两种漂移：

1. 科研对象（课题、任务书、运行、证据）以特殊分支的形式渗入 AgentHost；
2. 领域逻辑被写成 prompt、tool 描述或 UI 分支，而没有状态机和权限执行点。

对 FinRobot、Aviary、CAI、Sierra、Microsoft Copilot Studio、Harvey 等公开架构的核对显示，成熟系统普遍采用“薄内核 + 厚领域层”，并把领域状态、工具、知识和控制层分开。

## 决策（Proposed）

1. 在内核与科研层之间增加 `DomainPack` 接口：
   - object schemas / state machines
   - action specs（参数、权限、风险、审批要求）
   - context providers
   - workflow templates
   - policy rules
   - evaluation fixtures
   - view-model schemas（只产生数据，不执行任意 UI 代码）
2. 增加 `ResearchEnvironment` 抽象：
   - `observe(scope)`
   - `listActions(scope)`
   - `validate(action)`
   - `apply(action)`
   - `snapshot(scope)`
3. 内核只认识 `DomainPack`、`ActionSpec`、`ContextProvider`、`PolicyDecision` 等 contracts，不 import 科研对象。
4. 首版只实现一个内置 research pack；不做第三方插件市场、不执行 pack 提供的任意 React/脚本。
5. 采用单 Agent + 参数化领域工具；不按研究问题/子任务拆默认子 Agent。子 Agent 仅用于明确的并行检索/独立审阅，并显式传递来源。
6. 三层控制：
   - Deterministic：任务书冻结、run 启动、预算、删除、claim 确认、权限变更；
   - Hybrid：任务书/分析/候选结论由 Agent 起草，人审后生效；
   - AI：读取、检索、比较、解释、草拟。
7. 科研评测作为领域包的一部分，不以通用 benchmark 替代闭环场景。

## 不选择

- **不选择把科研字段直接加进 pi session/AgentHost**：会让内核绑定科研，破坏替换与测试。
- **不选择按问题树拆多个领域 Agent**：Harvey 的公开经验表明 handoff 会丢失多轮上下文；问题树属于领域对象，不属于 Agent 拓扑。
- **不选择 prompt/YAML 作为审批执行点**：审批和预算必须由代码执行。
- **不在首版做通用插件运行时**：接口先服务内部边界，避免过早平台化。

## 后果

- 正面：领域可替换；内核测试不依赖科研对象；新垂直领域有明确入口；上下文/动作/权限边界更清楚。
- 成本：需要先定义 contracts 与适配层；研究 pack 的实现需要同时维护 schema、action registry 和 UI view model。
- 风险：接口过度抽象会让首版变慢；必须限制为“内部边界”，只实现 research pack，不做插件生态。
- 退出：若接口不成立，保留 contracts，退回“Core 内部模块 + 显式服务接口”，不引入第二套 runtime。

## 验证门

- 内核包不出现 `research`/`plan`/`claim` 等领域类型；
- research pack 能注册至少 6 个 typed actions（读状态、提案、请求运行、读产物、提案证据、查询历史）；
- 所有 action 经过 `validate`，拒绝路径可测试；
- Agent 上下文只看到 `observe` 的受控投影；
- 一个 fake domain pack + fake environment 能完成内核集成测试；
- 科研 pack 的领域评测可在无真实模型/执行器时运行。

## 参考

- [垂直领域 Agent 调研](../research/2026-10-23-vertical-agent-patterns.md)
- Aviary: agent policy / environment
- Microsoft Copilot Studio: planner + knowledge + tools + three control layers
- Harvey: matter context + parameterized domain tools + single reasoning system
