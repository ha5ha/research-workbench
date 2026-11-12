# 仓库 Agent 入口

适用所有贡献者。MUST / REQUIRED、SHOULD / RECOMMENDED、MAY / OPTIONAL 遵循 RFC 2119；NEVER = MUST NOT，AVOID = SHOULD NOT。

## 不可违背的边界

- MUST 先检索开源，比较候选/许可/维护/适配/退出成本，记录 ADR；固定版本和许可。
- NEVER 将 GPL/AGPL 代码链接进客户端；独立进程评估须取得明确批准。
- MUST 保持一套 pi runtime、Core 单写者及现有 React/SQLite/设计系统。
- MUST 经 Core ToolGateway/服务层执行副作用；权限、审批、工作区边界由代码强制。
- NEVER 让 Renderer 访问 Node/文件/Shell/SQLite/密钥；跨进程契约来自 contracts。
- MUST 将交互式代码工作面与冻结任务书/预算/产物绑定的受管科研运行分开。
- NEVER 让模型或 Skill 批准运行、确认结论、删除证据、扩大权限、修改预算。
- MUST 保留原型 tokens、字体下限、响应式与交互；视觉偏差须明确批准。
- MUST 以 Research Skills/可复算工具减少科研手工负担；研究决策和证据结构化沉淀。
- NEVER 引入第二套 runtime、多 Agent 编排、文献平台、论文生成或无关产品面。
- NEVER 将凭据/个人数据写入源码、日志、截图或远端。
- MUST 依完整规则处理删除、覆盖、外发、越界、安装、提权与不可信代码的明确审批。
- NEVER 未经明确授权推送、修改远端设置或公开仓库；禁止未获批准的破坏性 Git 操作。

## 开始与权威文档

实现前按顺序阅读 README → [规范索引](docs/standards/README.md) → [当前架构](docs/project/architecture.md) → [UI 合同](docs/standards/03-prototype-ui-contract.md) → [完整贡献规则](docs/standards/06-contributor-workflow.md) → 当前任务相关 ADR 与局部 AGENTS。完整规则的开源/依赖/安全/工作流程/DoD 均为强制要求。

当前交付与真实验收以 [1.0 门槛](docs/project/1.0-release-gates.md) 和 [validation](docs/project/validation.md) 为准。[历史实施计划](docs/product/desktop_agent_implementation_plan_v1.md) 仅作历史参考，Phase 0 不限制当前真实实验。规范与用户当次明确指令冲突时 MUST 指出并请求确认。

## 工作与检查

1. MUST 说明影响包、复用结论、测试与恢复路径；非平凡架构变化先记 ADR。
2. MUST 为改动提供对应回归；UI 提供三尺寸截图和视觉回归。
3. MUST 运行 pnpm typecheck、pnpm lint、pnpm format:check、相关 pnpm test；涉及分发执行 pnpm build:app / pnpm build:licenses，UI 执行 pnpm test:ui。
4. MUST 处理失败、空状态、权限拒绝；1440×900、1024×768、390×844 无横溢、无 <12px 文本、焦点可见。
5. MUST 检查 git diff / git status；小步提交，格式 type(scope): summary。
6. MUST 仅提交源码、测试、配置、必要文档/许可；截图、日志、构建产物、临时操作及机器记录只留本地，结论归入 validation。
7. MUST 报告实际运行结果、剩余风险与恢复说明；源码或截图存在不能替代功能通过。

新逻辑 MUST 优先放入领域服务、hook、视图与功能 CSS；向 App.tsx/rpc.ts/styles.css 直接扩充协调职责须说明原因。NEVER 靠禁用校验、移除测试、静默覆盖用户数据使门禁通过。
