# 垂直领域 Agent 的“内核 / 领域特性”分层调研

日期：2026-10-23
范围：公开论文、官方文档、开源仓库；不是对商业产品内部实现的代码审计。
目的：回答一个工程问题——**通用 Agent 内核和科研领域特性应该怎样切分，哪些垂直领域的做法值得借鉴，哪些不该照搬。**

## 0. 结论摘要

1. **成熟垂直 Agent 几乎都不把领域逻辑放进 system prompt。** 领域状态、对象、权限、工具和评估各自有独立承载层；模型只做规划、选择与表达。
2. **共同结构是“薄内核 + 厚领域层”。** 内核负责循环、模型、工具调度、会话、上下文预算、审批执行；领域层负责对象、状态机、数据/知识、工具语义和评测。
3. **领域状态必须独立于聊天。** Harvey 的 matter/project、Copilot Studio 的 knowledge/topics、FinRobot 的 DataOps 都不是会话记忆；会话只是进入领域状态的一个工作面。
4. **“知识”与“动作”要分开。** 知识是只读证据，动作是受权限约束的副作用。把两者混成一个万能检索/执行 Agent，是垂直产品最常见的安全债。
5. **不可逆动作需要确定性控制层。** Microsoft 明确区分 deterministic / hybrid / AI 三层；Codex/CAI 也把审批与执行分开。不能把“运行实验、删除证据、确认结论”交给模型自行判断。
6. **领域评测必须领域化。** Aviary 用科学环境、Sierra 用 simulations、Harvey 用领域场景生成；通用 benchmark 不能证明领域可靠性。
7. **不要按领域/分支拆成一堆子 Agent。** Harvey 明确说按司法辖区拆子 Agent 会在 handoff 中丢上下文，改为“单一推理系统 + 参数化领域工具 + 声明式配置”。这条对科研问题树尤其重要。
8. 对我们：现有“通用内核 / 科研层”方向是对的，但还缺一个显式的 **Domain Pack / Research Environment 边界**，否则科研对象会逐渐渗进 Agent 内核。建议以 ADR-0002 固化，但首版只做一个内置科研包，不做插件市场。

---

## 1. 对照案例

| 领域 / 产品 | 通用内核 | 领域层 | 关键分离方式 | 控制 / 审批 | 对我们最有价值的一点 |
| --- | --- | --- | --- | --- | --- |
| 编程：Codex / pi | 模型循环、工具、会话、压缩、沙箱 | 代码库、终端、diff、仓库规则 | 协议/进程边界；工具调用；沙箱与审批分层 | 沙箱 + 审批；工作区边界 | Agent 内核可以独立于 UI 和业务对象 |
| 金融：FinRobot | 多模型接入、LLMOps、DataOps | 金融分析 Agent、金融 CoT、数据/工具 | 四层架构：Agent / 算法 / LLMOps+DataOps / 基础模型 | 研究原型，非生产审批系统 | 领域算法、数据与模型接入要分层 |
| 科学：Aviary | 语言 Agent 策略、训练/优化 | 科学环境：文献、克隆、蛋白稳定性 | **Agent policy ↔ Environment**；工具改变环境状态 | 环境返回观察；评估独立 | 把科研系统做成“环境”，Agent 只看到类型化动作/观察 |
| 安全：CAI | 模块化 Agent、工具集成 | 渗透/侦察/取证工具与流程 | 工具插件 + HITL + 自主等级 | 人类监督；自主等级 | 领域工具可以很强，但必须有人类控制点 |
| 客服：Sierra Agent SDK | 编排、目标、guardrails | skills、knowledge、actions、channel | 编排内核 ↔ 可组合 skills / 知识 / 行动 | guardrails + 人工 handoff | 领域能力应是可组合 skill，不是改内核 |
| 企业低代码：Copilot Studio | standard harness / planner | knowledge、tools、topics、triggers | planner ↔ 领域组件；三层控制 | deterministic / hybrid / AI 三层 | 不可逆动作走确定性层，不交给 planner |
| 法律：Harvey | 统一推理系统、Agent 运行时 | matter/project、权限、知识源、jurisdiction config | 领域上下文自动装配；领域源变参数化工具 | 权限/ethical walls；律师审核 | 单一 Agent + 领域工具，避免按领域拆子 Agent |

---

## 2. 逐个看：它们到底怎么切

### 2.1 编程 Agent：内核与 IDE/仓库语义分离

Codex 和 pi 的共同点不是“会写代码”，而是把通用执行能力做成独立层：

- 模型/工具/会话/压缩/重试是内核；
- 代码库、终端、diff、仓库规则是领域环境；
- 沙箱、审批、工作区是执行边界；
- UI 通过 RPC/SDK 接内核，而不是把内核写在页面里。

这证明：**桌面 Agent 的内核可以独立存在，领域对象应由外层服务管理。**
我们的 Core / Renderer / ToolGateway 分层与这一方向一致。

参考：[pi SDK](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md)、[Codex approvals & security](https://developers.openai.com/codex/agent-approvals-security)。

### 2.2 FinRobot：四层领域平台，而不是一个万能 Agent

FinRobot 的公开架构分为四层：

1. Financial AI Agents：市场预测、文档分析、交易策略等；
2. Financial LLM Algorithms：领域模型/算法；
3. LLMOps + DataOps：模型选择、数据接入、实时处理；
4. Multi-source Foundation Models：通用/领域模型接入。

值得借鉴的是：**领域算法、领域数据、模型接入、Agent 编排不是同一层。**
不值得首版照搬的是 Director / Analyst 多 Agent 工作流：角色多、上下文 handoff 成本高，且更适合作为领域模板而非通用内核。

参考：[FinRobot paper](https://ar5iv.labs.arxiv.org/html/2405.14767)。

### 2.3 Aviary：把科学任务做成 Environment

Aviary 把语言 Agent 定义为策略，把科学任务定义为语言决策过程（LDP）：Agent 输出动作，环境返回观察；DNA 克隆、文献问答、蛋白稳定性分别作为环境实现，工具操作环境状态。

这是本调研里**最贴合科研产品的抽象**：

- 科研对象/状态在环境里，不在对话里；
- Agent 只能通过类型化动作改变环境；
- 观察是状态的受控投影，不是整库数据；
- 训练、评测与环境解耦；
- 同一套 Agent 可以换环境。

对我们的映射：

```text
AgentHost（策略）
   ↕ typed actions / observations
ResearchEnvironment（课题/问题/任务书/运行/产物/证据）
   ↕
执行器 / 数据 / 证据存储
```

参考：[Aviary paper](https://ar5iv.labs.arxiv.org/html/2412.21154)、[FutureHouse Aviary](https://www.futurehouse.org/research/aviary)。

### 2.4 CAI：领域工具 + 人类监督 + 自主等级

CAI 的公开描述强调模块化 Agent、工具集成和 human-in-the-loop，并把网络安全自主性分级。它没有把“安全工具”写进模型，而是把 Nmap、取证、漏洞验证等作为工具/能力接入，人类保留监督点。

可借鉴：

- 领域工具可以很专业，但工具注册、执行和审计要独立；
- 高风险领域必须显式定义自主等级；
- HITL 不是失败回退，而是产品的一等能力。

不照搬：安全领域的“高自主 + 攻击性工具”不能直接迁移到科研；科研的风险点是证据污染、资源浪费和错误结论，不是入侵。

参考：[CAI paper](https://ar5iv.labs.arxiv.org/html/2504.06017)。

### 2.5 Sierra：编排内核 + 可组合 skills + 知识 + 行动

Sierra Agent SDK 的公开架构把能力拆成：

- orchestration：目标、步骤、资源调度；
- goals / guardrails；
- composable skills：triage、respond、confirm 等；
- knowledge engine：只读知识；
- systems integrations / secure actions；
- simulations、debugging、omnichannel deployment。

这印证了：**领域能力应该以 skill/action 组合进编排层，而不是改编排器本身。**
它还强调 simulations 和 logic traces，说明垂直 Agent 的评测/可观测性必须和领域一起设计。

参考：[Sierra Agent SDK](https://sierra.ai/uk/product/agent-sdk)。

### 2.6 Microsoft Copilot Studio：planner + 领域组件 + 三层控制

Microsoft 的公开文档把标准 harness 描述为 LLM planner，周围是：

- knowledge layer（只读检索，带引用）；
- tools/connectors（确定性函数，有输入/输出/错误）；
- topics / inline agents（可复用领域流程）；
- event triggers（无用户消息也能启动）。

最关键的是三层控制：

| 层 | 谁决策 | 适用 |
| --- | --- | --- |
| Deterministic | 规则/固定流程 | 付款、删除、不可逆动作 |
| Hybrid | AI 起草 + 人/规则拦截 | 中风险、需确认 |
| AI harness | 模型在 guardrails 内规划 | 低风险查询/多步任务 |

它明确建议：**mission-critical 或不可逆动作不要交给 AI planner；要么不暴露给 planner，要么包在需要确认的固定流程里。**

这直接支持我们的任务书审批、运行启动、证据删除和结论确认设计。

参考：[Microsoft Copilot Studio · generative orchestration](https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-orchestration)。

### 2.7 Harvey：matter 上下文、权限墙、参数化领域工具

Harvey II 的公开描述强调：Agent 在 matter/project 内启动，继承文档、当事方、任务、权限、ethical walls 和历史；不是每次让用户重新上传/解释。

Harvey 的 Data Factory 文章更具体：

- 用声明式 config 定义一个司法辖区：可检索域、过滤层级、权限、Agent 指令；
- 把领域知识源做成**参数化工具**；
- 明确拒绝“每个辖区一个专用 Agent”，因为 subagent handoff 会丢多轮上下文；
- 采用**单一推理系统**在多个辖区间切换；
- 有独立的来源 intake、法律审核、评测/模拟 pipeline。

这几乎可以直接映射到科研：

- 一个课题/问题/子任务就是一个“matter”；
- 进入会话自动装配项目状态、材料、权限、历史；
- 领域能力做成参数化工具，而不是“每个研究问题一个 Agent”；
- 领域配置负责来源/模板/权限，领域代码负责不变量和状态机；
- 评测用例独立于聊天。

参考：[Introducing Harvey II](https://www.harvey.ai/blog/introducing-harvey-ii)、[Using Agents to Scale Harvey's Knowledge Sources](https://www.harvey.ai/blog/using-agents-to-scale-harveys-knowledge-sources)。

---

## 3. 横向规律

### 3.1 薄内核，厚领域层

通用内核只应拥有：

- 模型调用、流式输出、重试、取消；
- 工具注册/调用/结果配对；
- 会话、压缩、检查点；
- 上下文预算与投影；
- 权限执行点、审批等待、审计事件；
- UI 协议。

领域层拥有：

- 对象、状态机、版本、不变量；
- 领域数据/知识/来源；
- 领域工具及其语义；
- 领域权限、审批范围、预算；
- 领域评测、模拟、回归样例；
- 面向 UI 的视图模型。

### 3.2 会话不是系统记录

Harvey 的 matter、Copilot 的 knowledge/actions、FinRobot 的 DataOps 都说明：
**聊天是操作界面，不是权威状态。**
我们的课题/问题/任务书/运行/证据必须在 SQLite 与项目文件中，聊天只是进入它们的入口。

### 3.3 知识只读，动作受控

- 知识：论文、材料、项目记录、检索结果，带来源和适用范围，只读。
- 动作：改文件、运行实验、发网络请求、删除/清理、确认结论，必须有权限与审计。

不要把“检索”和“执行”合成一个 `do_anything` 工具。
知识检索不能直接触发副作用；动作必须明确、可审批、可回滚。

### 3.4 三层控制

采用 Copilot 的三层思路，但映射到科研：

| 层 | 科研映射 |
| --- | --- |
| Deterministic | 任务书冻结、运行启动、预算扣减、删除/清理、结论确认、权限变更 |
| Hybrid | Agent 起草任务书/分析/候选结论，人审后生效 |
| AI | 读文件、检索、解释、对比、草拟、提出下一步 |

模型不能进入 Deterministic 层的决策位置；它最多生成待审批提案。

### 3.5 领域评测

- Aviary：环境化任务 + 轨迹评估；
- Sierra：simulations；
- Harvey：来源 intake + 评测场景 + 生产模拟；
- CAI：CTF/漏洞场景与自主等级。

我们的评测不能只有“模型回答看起来对”。必须有：

- 任务书→运行→归档→证据的固定样例；
- 失败/缺件/重试/断线；
- 权限越界；
- 长会话/新会话接续；
- 跨层级（课题/问题/任务）记录一致性；
- 领域专家可读的评分标准。

### 3.6 单 Agent + 参数化领域工具，优先于按领域拆 Agent

Harvey 的反例很重要：按司法辖区拆子 Agent 会造成上下文 handoff 丢失。
对应到我们：

- 不要为每个研究问题/子任务创建一个专用 Agent；
- 用一个 Agent，通过 `project_id/question_id/task_id` 参数和领域工具切换上下文；
- 问题树是领域对象，不是 Agent 拓扑；
- 子 Agent 只在明确的并行搜索/独立审阅场景中使用，且要显式传递上下文与来源。

### 3.7 配置层做覆盖面，代码层做不变量

Harvey 用声明式 config 扩展司法辖区；Microsoft 用 topics/tools 配置领域流程。
但两者都把不可逆动作放在 deterministic 流程/平台策略里。

我们的对应：

- 配置/模板：实验类型、字段、输出解析器、统计模板、任务书模板、来源列表；
- 代码：对象状态机、审批边界、运行台账、证据不可变、权限执行；
- 不能把“审批规则”只写在 prompt 或 YAML 里。

---

## 4. 对我们的具体建议

### 4.1 引入 Domain Pack 接口（建议 ADR-0002，Proposed）

不是做插件市场，而是给内核一个明确的领域边界：

```ts
interface DomainPack {
  id: string;
  version: string;
  objectSchemas: ObjectSchema[];
  actionSpecs: ActionSpec[];       // 名称、参数、权限、风险、审批要求
  contextProviders: ContextProvider[];
  workflowTemplates: WorkflowTemplate[];
  policyRules: PolicyRule[];
  evaluationFixtures: EvaluationFixture[];
  viewModelSchemas: ViewModelSchema[]; // 只给 UI 数据，不执行任意 UI 代码
}
```

内核只认识 `DomainPack`、`ActionSpec`、`ContextProvider`，不认识“课题/任务书/证据”。
科研包是第一个内置 pack；未来生物、化学、法律等可复用同一入口。

### 4.2 引入 ResearchEnvironment

把科研服务显式建模成环境，而不是一堆松散工具：

```ts
interface ResearchEnvironment {
  observe(scope: ResearchScope): Promise<Observation>;
  listActions(scope: ResearchScope): Promise<ActionSpec[]>;
  validate(action: DomainAction): Promise<PolicyDecision>;
  apply(action: DomainAction): Promise<ActionResult & { events: DomainEvent[] }>;
  snapshot(scope: ResearchScope): Promise<EnvironmentSnapshot>;
}
```

- Agent 只看到观察和可用动作；
- 动作由 `validate` 检查权限/版本/预算；
- `apply` 产生领域事件，写入事件日志；
- 运行、审批、证据变更都是环境状态转换；
- 不在 Agent 侧复制一套科研状态。

### 4.3 会话从 Research Space 启动

参考 Harvey II：进入会话时自动装载当前项目/问题/任务、权限、历史、活动运行、未决审批和已接受证据；不要求用户手工粘贴背景。

这不是把整个项目塞进 prompt，而是由 `ContextAssembler` 生成受控的“研究简报”。

### 4.4 明确三层控制矩阵

把“哪些动作可自动、哪些需确认、哪些绝对禁止”写成规范与代码，不靠 prompt：

- Deterministic：任务书冻结、run 启动、预算、删除、claim 确认；
- Hybrid：计划/任务书/分析/候选结论；
- AI：读取、检索、比较、草拟。

### 4.5 领域评测作为交付物

Phase 0/1 就建立 `research-eval`：

- 固定项目 + 任务书 + 假运行；
- 成功、失败、缺件、断线、重试、权限拒绝；
- 新会话接续；
- 跨层级记录；
- 模型切换；
- 证据链下钻。

### 4.6 不做什么

- 不做 FinRobot 式的 Director/Analyst 多 Agent 默认拓扑；
- 不做“每个研究问题一个 Agent”；
- 不把领域逻辑放在 prompt 或 UI 文案里；
- 不用通用 benchmark 替代科研闭环评测；
- 不把知识检索工具和副作用工具合并；
- 不为了“平台化”在首版做插件市场或任意 UI 插件。

---

## 5. 需要确认的决策

1. 是否接受 ADR-0002 的 `DomainPack` + `ResearchEnvironment` 边界？（建议接受；首版只实现一个内置 research pack。）
2. 是否确认“单 Agent + 参数化领域工具”优先，不按研究问题拆 Agent？
3. 是否把三层控制矩阵和领域评测套件写入硬规范？

---

## 6. 参考

- FinRobot: <https://ar5iv.labs.arxiv.org/html/2405.14767>
- Aviary: <https://ar5iv.labs.arxiv.org/html/2412.21154> · <https://www.futurehouse.org/research/aviary>
- CAI: <https://ar5iv.labs.arxiv.org/html/2504.06017>
- Sierra Agent SDK: <https://sierra.ai/uk/product/agent-sdk>
- Microsoft Copilot Studio generative orchestration: <https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-orchestration>
- Harvey II: <https://www.harvey.ai/blog/introducing-harvey-ii>
- Harvey knowledge sources: <https://www.harvey.ai/blog/using-agents-to-scale-harveys-knowledge-sources>
- pi SDK/RPC/extensions: <https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md>
- Codex approvals & security: <https://developers.openai.com/codex/agent-approvals-security>

核对日期：2026-10-23。上述商业产品只依据公开文档/论文，未验证其内部实现；采用其代码或服务前需单独核对许可证、数据条款和安全边界。
