# 功能台账

更新：2026-11-12 · 1.0.0 有限范围历史验收；审计整改与三平台 CI 通过，修复 PR 待合并 · 维护负责人待认领

状态说明见[项目总览](README.md)。下表“已实现”仅针对该行边界。最终发布状态以[1.0 门槛](1.0-release-gates.md)为准；模拟模型、真实模型、真实主机和实际分发包分别验收。

最新源码增量：文件冲突、会话归属、终端进程树、工具默认拒绝、Git 归属、共享协议、职责/CSS 拆分和质量门禁。新增依赖仅供开发测试，版本/许可见[依赖台账](dependencies.md)。[审计复验](validation.md#audit-2026-11-12)记录十四项证据、三平台 CI、三尺寸回归与故障合并阻断；本轮未重打便携包、未重跑真实模型/SSH。原始归档产物预览及完整 IDE 仍待建设。

## 执行底座

| ID  | 能力 / 状态                     | 实现与验证证据                                                                                                                                                                                                                                                            | 缺口 / 下一步                                                       |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| K01 | 桌面、Core RPC、聊天：已实现    | [rpc.ts](../../apps/core/src/rpc.ts)、[pi-chat 测试](../../tests/integration/pi-chat.test.ts)、[RPC 测试](../../tests/integration/rpc.test.ts)；本轮通过                                                                                                                  | 新增闭环 Electron E2E 已验收；全部旧页面与崩溃事件回放待验收        |
| K02 | 模型设置：已实现有限协议        | [设置页](../../apps/desktop/src/renderer/src/settings/SettingsDialog.tsx)、[请求级测试](../../tests/integration/pi-chat-openai.test.ts)、[模型闭环验证](validation.md#research-loop)；保持配置的模型 ID/endpoint                                                          | Anthropic Messages 是禁用占位；不能概括为所有兼容端点均已实测       |
| K03 | 工作区/权限：已加固             | [完整性测试](../../tests/unit/research-integrity.test.ts)、workspace/permissions/execution-env、单写者                                                                                                                                                                    | 内部文件/资源发现/真实NTFS短名已验收；不是 OS 级沙箱                |
| K04 | 文件编辑、diff、Git：已实现基础 | [文件冲突回归](../../tests/unit/audit-file-conflicts.test.ts)、[Git 归属回归](../../tests/unit/audit-git.test.ts)与真实 Electron；冲突保留 buffer、diff/重载/明确覆盖；自动提交仅纳入可归属的显式写入                                                                     | 逐 hunk 审核、快照回滚、对话跳转完整场景待验收；不扩展为完整 IDE    |
| K05 | 命令面板：已实现；受管执行另算  | [interactive-terminal.ts](../../apps/core/src/interactive-terminal.ts)、[真实进程树测试](../../tests/integration/interactive-terminal.test.ts)、[关闭恢复测试](../../tests/integration/core-shutdown.test.ts)；三平台 timeout/cancel 实际杀树、有界脱敏日志、退出等待清理 | 单次 Shell 默认 30 秒；无 PTY，日志不是科研产物                     |
| K06 | TS/JS LSP：已实现基础并复验     | [lsp-service.ts](../../apps/core/src/lsp-service.ts)、[CodeEditor](../../apps/desktop/src/renderer/src/CodeEditor.tsx)；三平台 Electron 等待真实初始化，[URI 回归](../../tests/unit/lsp-file-uri.test.ts)覆盖平台路径与编码                                               | 完整补全/诊断交互仍待专项验收；Python 有语法高亮，Python LSP 待建设 |
| K07 | 会话/上下文：部分实现           | [agent-chat.ts](../../apps/core/src/agent-chat.ts)、[会话隔离回归](../../tests/unit/conversation-isolation.test.ts)、[路径回归](../../tests/unit/agent-session-paths.test.ts)与 Electron A/B 流式；单 runtime 串行切换、不透明 session ID、迟到事件隔离                   | JSONL 与投影不等于执行恢复；会话审批崩溃恢复、来源版本索引待完善    |
| K08 | MCP / Web 检索：待建设          | 工程方案有设计，本次未找到对应可用集成                                                                                                                                                                                                                                    | 接入时仍受 Core 权限与来源审计约束                                  |

## 科研主线

| ID  | 能力 / 状态                            | 实现与验证证据                                                                                                                                           | 缺口 / 下一步                                                                        |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| R01 | 研究树：已实现并加固                   | 串行写、损坏阻止覆盖、备份、独立 SQLite 工作区锁                                                                                                         | 单 Core 写者；不支持多进程同时编辑                                                   |
| R02 | 任务书/计划/Run 分离：已实现           | [RunStore](../../apps/core/src/run-store.ts)、撤回/替代 closure、迁移原始备份与审计                                                                      | 手工补录独立保留，不当作受管运行证据                                                 |
| R03 | 冻结身份与人工批准：已实现             | 代码/输入/协议/命令/预算哈希；[冻结内容预览测试](../../tests/unit/frozen-plan-files.test.ts)；一次“批准并运行”                                           | 文本预览限完整 UTF-8 128 KiB，大文件/二进制明确拒绝；模型无批准/启动接口             |
| R04 | 受管产物/数值：已实现有限契约          | 按字节 manifest、SHA-256、JSON/CSV seed/mean/SD/n；缺件/非法指标回归                                                                                     | 单件 128 MiB / 总计 256 MiB；旧 diff 记录仍限文本，不当科学证据                      |
| R05 | 来源证据：新链已实现、旧黑板兼容       | Claim 引用 Run/artifact/hash，支持/反证，多来源，确认/导出前复核                                                                                         | 旧事实黑板无强来源保证；更正/撤销链待建设                                            |
| R06 | 研究罗盘：已实现最小闭环               | [ResearchLoop](../../apps/desktop/src/renderer/src/views/ResearchLoop.tsx)、[Electron 验证](../../scripts/verify-research-loop.mjs)                      | 方向/停止条件/下一步/计划/证据/决策；跨日效果评测待做                                |
| R07 | 重复实验提醒：已实现                   | [similarity.ts](../../apps/core/src/similarity.ts)、[测试](../../tests/unit/similarity.test.ts)；本轮通过                                                | 文本相似度提示；不等于代码/数据/协议身份校验                                         |
| R08 | 定时研究摘要：已实现基础               | [scheduler.ts](../../apps/core/src/scheduler.ts)、[schedule-store.ts](../../apps/core/src/schedule-store.ts)、[测试](../../tests/unit/scheduler.test.ts) | Core 存活时运行，重启后补到期任务；应用退出后不会自行继续，失败恢复/幂等副作用待加固 |
| R09 | Research Skills：5 个可执行            | data-profile + checkpoint/evidence-ledger/decision-log/next-step；[测试](../../tests/unit/research-record-skills.test.ts)                                | 输出确定性 artifact/proposal；baseline/repro/stats 等专业技能待建设                  |
| R10 | 文献库：条目管理已实现，检索管线待建设 | [research-service.ts](../../apps/core/src/research-service.ts) 的 literature 条目                                                                        | URL/标题/备注管理不等于论文搜索、PDF ingest、引用核验                                |
| R11 | 本地受管 Job：已实现                   | [模型闭环验证](validation.md#research-loop)、服务级恢复、幂等、超时/取消/缺件                                                                            | 实际桌面退出恢复已验收；长期作业和真实 ML 训练未验收                                 |
| R12 | SSH Job：已实现有限连接方式            | Main safeStorage 密码、明确指纹确认、冻结连接身份；[恢复验证](validation.md#local-ssh)：两轮重算、桌面恢复、幂等、错误路径                               | MFA/ProxyJump、真实 TCP 中断、长时 GPU、增量采集未验收；系统密钥别名依赖本机配置     |
| R13 | 可比性与重复测量：核心已实现           | 协议/数据/命令/环境组校验、按 seed 身份匹配、有限值、均值/样本 SD/n；真实输入 120 项复核通过                                                             | 环境身份不证明硬件/驱动等同；不做显著性推断                                          |
| R14 | 检查点导出：已实现；复现包部分         | Markdown 报告、四个 JSON 记录 Skill、来源身份                                                                                                            | 不含可搬运的完整数据/环境包，重放验证待建设                                          |

## 维护与协作

| ID  | 能力 / 状态                | 当前证据                                                                                                                                                                               | 缺口 / 下一步                                                           |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| M01 | MIT 与分发许可：已实现门禁 | 根 MIT、OpenResearch 归属、实际 bundle/LSP/Electron 闭包、完整 LICENSE/NOTICE 与哈希；[依赖台账](dependencies.md)                                                                      | 每次依赖升级重新收集核验；根 MIT 不替代第三方许可                       |
| M02 | 自动质量检查：已实现并验收 | typecheck、architecture/code/styles 三项 lint、增量格式、218 本地测试通过/1 opt-in 跳过、三平台构建/许可/UI；[工程检查](validation.md#engineering)；故障 PR 证实 main 必需检查阻断合并 | 修复 PR 待所有者审阅合并；不等同于 EXE 发布验收                         |
| M03 | 对话 UI：已实现并验收      | [界面与交互验证](validation.md#ui)，连续三轮、实际字体、独立视觉/UX 走查                                                                                                               | 无竞品同任务易用性数据；旧 IDE 不在本次全量视觉回归内                   |
| M04 | Windows 便携分发：已验收   | 最终1.0.0实际EXE冷启动/计算/重开/数据保留；142包完整许可与构建哈希核验                                                                                                                 | [分发范围](validation.md#distribution)；macOS/Linux、签名/更新后置      |
| M05 | 开源协作入口：已建立       | 项目台账、CONTRIBUTING、Issue/PR 模板、三平台 required checks                                                                                                                          | 专用安全报告渠道与发布迁移由维护者继续建设                              |
| M06 | 可替换模块：部分实现       | contracts 统一 80 个 RPC 的参数/响应和事件 schema；Core registry/领域 handler、Run Artifact/Evidence、renderer feature hooks/CSS；保持单写者/单状态来源                                | db/coding/executors/artifacts/testkit 目前仅 README；存储仍由 Core 持有 |
| M07 | 依赖版本：已固定           | 直接依赖精确版本、传递 lock、三平台远端 frozen install；Actions 固定完整提交 SHA；[台账](dependencies.md)列许可和开发依赖闭包核对                                                      | 升级重新核验分发闭包、完整许可与集成回归                                |

## 待定和暂缓

专业科研技能、证据更正链、复现包、磁盘保留和待决策项见[路线](roadmap.md)。多 Agent、自动论文、插件市场、Slurm/K8s、云算力市场与应用内多人协作继续暂缓。多人贡献开源代码属于当前工程目标。
