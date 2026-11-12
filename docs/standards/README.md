# 工程规范索引

本目录是研究型桌面 Agent 的**强制工程规范**。`AGENTS.md` 是入口，本目录提供展开规则。

## 规范层级

1. 用户当次明确指令
2. 根与对应目录的 `AGENTS.md`（入口与局部约束）
3. 本目录规范，包括 [完整贡献规则](06-contributor-workflow.md)
4. 当前实现事实以 [architecture.md](../project/architecture.md) 为唯一当期架构地图，当前视觉与交互以 [03-prototype-ui-contract.md](03-prototype-ui-contract.md) 为唯一当期合同；批准的增量明确写入相应文档
5. 已接受 ADR 的决策依据、局部 README 与验证记录

[历史实施计划](../product/desktop_agent_implementation_plan_v1.md) 只提供背景，不再作为当前阶段、已实现能力或验收的权威。未实现目标不能覆盖当前架构；当前完成度统一查 [1.0 门槛](../project/1.0-release-gates.md) 和 [validation](../project/validation.md)。

若下层规则与上层冲突，以上层为准；冲突必须在实现前指出并记录，不得静默选择。

## 三条核心规范

| 规范               | 文件                                                                                 | 一句话                                                       |
| ------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| 开源优先           | [01-open-source-first.md](01-open-source-first.md)                                   | 有成熟开源可复用就复用；自研必须证明必要性并记录 ADR         |
| 内核/科研分离      | [02-agent-kernel-and-research-boundary.md](02-agent-kernel-and-research-boundary.md) | Agent 做通用执行，科研层管对象、审批、证据；模型不能自批     |
| 原型 UI 合同       | [03-prototype-ui-contract.md](03-prototype-ui-contract.md)                           | 原型是视觉合同，逐项对齐，不擅自重设计                       |
| 科研 Skills        | [04-research-skills.md](04-research-skills.md)                                       | Skill 不是 prompt：有输入、工具、产物、审批、来源和评测      |
| 科研代码规范       | [05-research-code-standards.md](05-research-code-standards.md)                       | 目录、风格、检查、实验归档；Agent 不能只把功能写出来         |
| 贡献流程与完整规则 | [06-contributor-workflow.md](06-contributor-workflow.md)                             | 从根入口迁移的安全、依赖、审批、工作流程和 DoD；没有降低要求 |

## 关键词

- **必须 / MUST**：不满足即不能合并。
- **应该 / SHOULD**：默认遵守；偏离需要理由并记录。
- **可以 / MAY**：可选增强。

## 变更规范

修改本目录的任何规则，必须：

1. 说明动机与影响范围；
2. 更新 `AGENTS.md` 或相关 ADR；
3. 若改变视觉，更新截图基线；
4. 由仓库所有者确认。

## 研究证据

外部架构调研放在 [`docs/research`](../research/README.md)，用于支撑 ADR，不自动变成规范。

- [ADR-0002 Domain Pack / Research Environment](../adr/0002-domain-pack-and-research-environment.md)（Proposed）
- [ADR-0003 代码工作面与受管科研运行](../adr/0003-coding-surface-and-managed-runs.md)（Accepted）
- [ADR-0004 计算科研能力门禁与 Research Skills](../adr/0004-computational-research-capability-gate.md)（Accepted）
- [ADR-0005 IDE 编辑器、diff 与 Git 的开源选型](../adr/0005-ide-editor-diff-git.md)（Accepted）
