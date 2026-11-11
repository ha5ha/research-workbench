# ADR-0006：围绕科研闭环渐进重构与可验证交付

- 状态：**Accepted**（2026-11-10，所有者明确要求实现闭环、参考开源与 OpenResearch 风格；范围见 ADR-0007）
- 日期：2026-11-10
- 输入：用户提供的产品理念/竞品调研；[本轮源码审计](../research/2026-11-10-project-review.md)
- 关联：[ADR-0001](0001-agent-runtime-and-process-boundary.md)、[ADR-0003](0003-coding-surface-and-managed-runs.md)、[ADR-0004](0004-computational-research-capability-gate.md)

## 问题与约束

代码已超过阶段文档描述，但尚无可恢复受管 Run；科研工具、存储与 DTO 边界分散。项目需要可持续维护的能力台账，以及优先保证证据、审批、恢复的演进路线。现有主线为 Electron/TypeScript/Core/pi；不得为竞品对标同时接两套 runtime 或擅改 UI。

## 候选与结论

| 方案 | 适配/维护与退出成本 | 结论 |
| --- | --- | --- |
| 保留现栈，修完整性，分离 Experiment/Run/Job，收敛 contracts | 可保留现有代码和测试；逐模块替换；须维护旧数据与迁移映射 | **推荐** |
| 整体 fork OpenResearch | 其 Run/CLI/Skill 机制值得参考，但技术栈、数据/执行/界面和当前规范均要重新对齐；长期跟进 fork 成本高 | 本次不采用 |
| 替换 pi / Electron 或加入另一套完整 runtime | 现有问题主要是 Core 权限与科研对象语义，尚无证据证明由 runtime/桌面壳导致 | 暂不推进；需要单独能力/打包 spike |
| 继续在 AgentChat/RPC/Renderer 单文件加功能 | 短期快，权限分叉和重复类型继续扩张，无法解决记录与恢复问题 | 不推荐 |

## 开源复用、许可与版本

本提案**不新增依赖、不复制竞品代码、不批准升级**。本地审计基线 `7b9b786`；当前依赖解析以 `pnpm-lock.yaml` 为准，manifest 中的范围版本问题另行收口。

OpenResearch 根 LICENSE 本轮核验为 MIT；官方发布页显示稳定版 v0.2.25 / `c9123a6f70828f8021e11f6b9a16197ce77f53f9`，另有当日 Canary。功能文档来自 current docs/main，未证明均包含于该稳定版。见[核验记录](../research/2026-11-10-project-review.md#竞品核验与复用)。未核验其全部传递依赖，因此当前仅参考机制，不据此宣告整仓可直接分发。

autoresearch 仅参考有限回合协议；README 声明 MIT，但根许可证正文未完成核验，不纳入可复制代码的已批准来源。SSH/指标/数据库适配器引入前，分别比较至少两个候选并记录根许可证、传递依赖、维护/issue、固定版本、打包、替换成本和 NOTICE。

## 建议决策

1. 建立单一[项目控制台](../project/README.md)，能力状态与验证证据分开；不再用多份勾选清单表达当前完成度。
2. 优先修复写入边界、凭据、科研动作权限、确认版本、研究树恢复与归档缺件。
3. 先在 Core 内拆明确服务接口，再迁稳定包；纯规则进 domain，跨进程 schema/DTO 进 contracts。
4. 受管 Run 使用冻结 PlanVersion、代码/数据/环境身份、预算及持久 Job；与普通 coding 命令分开。
5. 科研差异化以 Compass/Evidence/学生流程及真实场景评测验证；保持单 runtime，不做插件平台化。
6. 数据迁移必须备份、保留旧 ID/来源，缺少历史身份明确 unknown；不重写为貌似完整的证据。

## 验证、后果与退出

按[路线 G0–G5](../project/roadmap.md)逐步验收；本地两轮实验先于 SSH。保留当前可运行应用，新增契约用兼容适配；每步单独回滚，数据不兼容时恢复备份。若边界抽象无法通过两个样板验证，退回 Core 内部显式服务，不强建 DomainPack/插件框架。

收益是审阅范围和证据清晰；成本是需要暂停横向功能扩张，补回归、迁移、恢复和社区文档。所有者后续明确要求已批准本方向；实际交付与未验收边界以项目台账为准。
