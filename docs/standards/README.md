# 工程规范索引

本目录是研究型桌面 Agent 的**强制工程规范**。`AGENTS.md` 是入口，本目录提供展开规则。

## 规范层级

1. 用户当次明确指令
2. `AGENTS.md`
3. 本目录规范
4. `docs/product/desktop_agent_implementation_plan_v1.md`
5. ADR 与局部 README

若下层规则与上层冲突，以上层为准；冲突必须在实现前指出并记录，不得静默选择。

## 三条核心规范

| 规范 | 文件 | 一句话 |
| --- | --- | --- |
| 开源优先 | [01-open-source-first.md](01-open-source-first.md) | 有成熟开源可复用就复用；自研必须证明必要性并记录 ADR |
| 内核/科研分离 | [02-agent-kernel-and-research-boundary.md](02-agent-kernel-and-research-boundary.md) | Agent 做通用执行，科研层管对象、审批、证据；模型不能自批 |
| 原型 UI 合同 | [03-prototype-ui-contract.md](03-prototype-ui-contract.md) | 原型是视觉合同，逐项对齐，不擅自重设计 |

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
当前提案：[ADR-0002 Domain Pack / Research Environment](../adr/0002-domain-pack-and-research-environment.md)（Proposed）。
