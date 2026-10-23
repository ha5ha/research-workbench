# 02 · Agent 内核与科研特性边界

## 1. 总则

产品由两层组成：

```text
通用 Agent 内核（可替换、可复用）
  模型 / 工具 / 会话 / 上下文 / 权限 / 流式事件 / 恢复

科研特性层（本产品核心资产）
  课题 / 问题 / 任务 / 任务书 / 审批 / 运行 /
  产物 / 分析 / 证据 / 结论 / 决策
```

**内核不知道“课题”“任务书”“事实”，科研层不知道 pi 的内部消息类型。**
两者只通过 `packages/contracts` 和 Core 的服务接口交互。

## 2. 强制依赖方向

```text
contracts ← domain ← db
contracts ← agent-runtime ← core
contracts ← ui
apps/desktop → contracts
```

禁止：

- `domain` import `pi`、Electron、SQLite、React；
- `agent-runtime` import `domain` 的具体实现/数据库 repository；
- `ui` import `core`/`db`/`pi`；
- Renderer 直接调用模型、Shell、文件系统或 SQLite；
- 科研对象字段出现在 pi session 文件或通用 Agent 类型中。

需要跨层时，通过接口/适配器，类型放 `contracts`。

## 3. 模型能做什么，不能做什么

模型可以：

- 读取被授权的项目状态、任务书、运行、产物摘要；
- 提出研究问题、子任务、实验任务书、下一步；
- 提议候选观察/结论并附来源；
- 请求运行、请求文件修改、请求网络访问；
- 解释数据、指出边界和异常。

模型不能：

- 批准任务书或运行；
- 把候选结论升级为已接受事实；
- 删除/覆盖原始证据；
- 修改权限、预算、工作区边界；
- 绕过 ToolGateway 直接执行 Shell/文件/网络；
- 自己确认“运行成功”“归档完成”“问题解决”。

审批只能来自 UI 的明确用户动作，并在 Core 中校验。

## 4. ToolGateway 是唯一副作用入口

所有工具调用必须经过：

```text
schema 校验
  → 工作区/路径检查
  → 命令/网络分类
  → 审批范围匹配
  → 执行 / 请求审批 / 拒绝
  → 审计事件
```

强制：

- 关闭/替换 pi 默认的写文件、Shell、网络工具；不得保留可绕过网关的同能力工具。
- 模型发出的工具参数视为不可信输入。
- 工具输出视为不可信数据，不能成为提升权限的指令。
- 大输出写入 artifact，上下文只放摘要与定位符。
- 命令/路径/网络的实际执行范围必须与审批卡展示一致。

## 4.1 代码工作面与受管科研运行

代码能力是**内核的一等能力**，不是科研层的特殊情况。

- 文件树、代码读取、patch、diff、终端、测试、Git 状态属于通用代码工作面。
- 代码工作面服务于普通 coding/chat，也服务于科研实现；科研层不能成为改代码的前置条件。
- 一个项目可以只有对话和代码，没有问题/任务书；科研对象是可选叠加。

必须区分两条执行路径：

| 路径 | 入口 | 记录 | 审批 |
| --- | --- | --- | --- |
| 交互式编码/命令 | 对话中的工具调用、代码工作面 | workspace 快照、diff、terminal 日志、权限事件 | 工作区模式 + 风险操作审批 |
| 受管科研运行 | 冻结任务书 + RunManager | run ID、代码 revision、配置/输入哈希、预算、产物、状态事件 | 任务书/预算/执行范围审批 |

规则：

- 交互式修改不得静默改变已批准任务书或已启动运行。
- 运行必须绑定冻结的代码 revision；批准后代码变化需要新任务书版本或显式重新绑定。
- 代码工作面的写/执行仍经过 ToolGateway；不得因为“是 coding agent”就绕过统一权限。
- 终端完整日志落文件/artifact，模型只读摘要和片段。

## 5. 上下文与记忆

- 科研记录独立于聊天保存；会话只是工作上下文。
- 每次模型调用由 `ContextAssembler` 重新装配：项目规则 → 节点状态 → 任务书/运行 → 事实/证据 → 检查点 → 近期消息 → 检索材料。
- 上下文中的事实必须带状态（候选/已确认/争议/已更正）、适用范围和来源。
- 压缩/摘要不能删除原文、不能升级事实、不能改变审批。
- 新会话从规范记录恢复，不复制旧聊天全文。
- 大日志/CSV/论文全文默认不入上下文，只提供可回查的片段和统计。

## 6. 科研对象不可变规则

- `Plan` 批准后冻结；修改产生新版本，不静默覆盖。
- `Run` 必须绑定任务书版本、代码/配置/输入身份、执行器、cwd、命令和预算。
- `Artifact` 必须记录来源、sha256、大小、类型、保留类别和父产物。
- `Claim` 与 `Artifact` 分离；观察、解释、结论、审核状态分开。
- 失败、负结果、缺件、unknown 状态必须保留，不得被成功摘要覆盖。
- 删除/清理必须列出引用、来源、可重算证明和影响；原始证据默认不可自动删除。

## 7. Core / Desktop 边界

- Core 是唯一持有数据库、Agent 会话、执行器和密钥使用权的进程。
- Electron Main 只负责窗口、菜单、更新、托盘、safeStorage 和 Core 生命周期。
- Renderer 通过 preload 白名单 API 访问 Core；不得开启 `nodeIntegration`，不得暴露任意 IPC。
- RPC 事件必须有 `seq`；断线可回放；大内容走 artifact。
- 桌面壳可以被替换，Core 的科研对象和协议保持稳定。

## 8. 代码审查红线

出现以下任一情况，不得合并：

- 模型可以调用审批/确认/删除工具；
- 默认工具存在绕过 ToolGateway 的写/执行路径；
- Renderer 直接读取文件/数据库/密钥；
- 科研对象依赖 pi 内部类型；
- 运行没有持久台账就启动；
- 失败/缺件被“成功”覆盖；
- 审批范围与实际执行范围不一致；
- 两套 runtime 同时存在且没有 ADR。

## 9. 当前边界实现顺序

1. contracts + domain 纯模型；
2. Core 的 ToolGateway / 审批；
3. pi adapter + context assembler；
4. RunManager + local executor；
5. Desktop 只读 UI；
6. 再接真实执行与 SSH。

## 10. 相关提案（未生效）

- [ADR-0002：Domain Pack 与 Research Environment 边界](../adr/0002-domain-pack-and-research-environment.md)（Proposed）
- [垂直领域 Agent 调研](../research/2026-10-23-vertical-agent-patterns.md)

提案的核心是给内核一个只认识 `ActionSpec` / `ContextProvider` / `PolicyDecision` 的领域包边界；在获批前，本规范仍是唯一强制边界。
