# 功能台账

更新：2026-11-11 · 1.0.0 本地验收完成 · 维护负责人待认领

状态说明见[项目总览](README.md)。下表“已实现”仅针对该行边界。最终发布状态以[1.0 门槛](1.0-release-gates.md)为准；模拟模型、真实模型、真实主机和实际分发包分别验收。

最新源码增量：M03 统一聊天滚动/IME、共享控件、窄屏设置和中性表面；K04 两处 CodeMirror 共用 token 主题。无新依赖，尚未重打便携包。[界面与交互验证](validation.md#ui)汇总三尺寸回归和限制；原始归档产物预览及完整 IDE 仍待建设。

## 执行底座

| ID  | 能力 / 状态                     | 实现与验证证据                                                                                                                                                                                                   | 缺口 / 下一步                                                                                      |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| K01 | 桌面、Core RPC、聊天：已实现    | [rpc.ts](../../apps/core/src/rpc.ts)、[pi-chat 测试](../../tests/integration/pi-chat.test.ts)、[RPC 测试](../../tests/integration/rpc.test.ts)；本轮通过                                                         | 新增闭环 Electron E2E 已验收；全部旧页面与崩溃事件回放待验收                                       |
| K02 | 模型设置：已实现有限协议        | [设置页](../../apps/desktop/src/renderer/src/settings/SettingsDialog.tsx)、[请求级测试](../../tests/integration/pi-chat-openai.test.ts)、[模型闭环验证](validation.md#research-loop)；保持配置的模型 ID/endpoint | Anthropic Messages 是禁用占位；不能概括为所有兼容端点均已实测                                      |
| K03 | 工作区/权限：已加固             | [完整性测试](../../tests/unit/research-integrity.test.ts)、workspace/permissions/execution-env、单写者                                                                                                           | 内部文件/资源发现/真实NTFS短名已验收；不是 OS 级沙箱                                               |
| K04 | 文件编辑、diff、Git：已实现基础 | [CodeWorkbench](../../apps/desktop/src/renderer/src/CodeWorkbench.tsx)、[Git 测试](../../tests/unit/git-service.test.ts)；服务测试通过                                                                           | 逐 hunk 审核、快照回滚、对话跳转完整场景待验收；不扩展为完整 IDE                                   |
| K05 | 命令面板：已实现；受管执行另算  | [workspace-service.ts](../../apps/core/src/workspace-service.ts)；RPC 命令测试通过                                                                                                                               | 单次 Shell，默认 30 秒、输出截断；没有 PTY 和完整日志 artifact 闭环                                |
| K06 | TS/JS LSP：已实现，未复验       | [lsp-service.ts](../../apps/core/src/lsp-service.ts)、[CodeEditor](../../apps/desktop/src/renderer/src/CodeEditor.tsx)；历史截图                                                                                 | 缺自动测试；Python 有语法高亮，Python LSP 待建设                                                   |
| K07 | 会话/上下文：部分实现           | [agent-chat.ts](../../apps/core/src/agent-chat.ts)、[Working Set 测试](../../tests/unit/working-set.test.ts)；本轮通过                                                                                           | JSONL 与投影不等于执行恢复；managed Job 与 checkpoint 已新增；会话审批崩溃恢复、来源版本索引待完善 |
| K08 | MCP / Web 检索：待建设          | 工程方案有设计，本次未找到对应可用集成                                                                                                                                                                           | 接入时仍受 Core 权限与来源审计约束                                                                 |

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

| ID  | 能力 / 状态                   | 当前证据                                                                                                          | 缺口 / 下一步                                                                 |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| M01 | MIT 与分发许可：已实现门禁    | 根 MIT、OpenResearch 归属、实际 bundle/LSP/Electron 闭包、完整 LICENSE/NOTICE 与哈希；[依赖台账](dependencies.md) | 每次依赖升级重新收集核验；根 MIT 不替代第三方许可                             |
| M02 | 类型/边界 lint/测试：已有实现 | typecheck、AST 边界 lint、Vitest；[工程检查](validation.md#engineering)                                           | CI 配置因 workflow scope 尚未推送；真实 provider 跳过，UI 单独验收            |
| M03 | 对话 UI：已实现并验收         | [界面与交互验证](validation.md#ui)，连续三轮、实际字体、独立视觉/UX 走查                                          | 无竞品同任务易用性数据；旧 IDE 不在本次全量视觉回归内                         |
| M04 | Windows 便携分发：已验收      | 最终1.0.0实际EXE冷启动/计算/重开/数据保留；142包完整许可与构建哈希核验                                            | [分发范围](validation.md#distribution)；macOS/Linux、签名/更新后置            |
| M05 | 开源协作入口：已建立          | 项目台账、CONTRIBUTING、Issue/PR 模板                                                                             | 专用安全报告渠道、远端 CI 与发布迁移由维护者继续建设                          |
| M06 | 可替换模块：部分实现          | contracts/domain/runtime/ui 有代码                                                                                | db/coding/executors/artifacts/testkit 目前仅 README；实际存储/归档等集中 Core |
| M07 | 依赖版本：已固定              | 现有直接依赖固定 lock 解析版本；[台账](dependencies.md)；frozen-lockfile                                          | 依赖升级重新核验分发闭包与完整许可；Actions 当前固定 release tag              |

## 待定和暂缓

专业科研技能、证据更正链、复现包、磁盘保留和待决策项见[路线](roadmap.md)。多 Agent、自动论文、插件市场、Slurm/K8s、云算力市场与应用内多人协作继续暂缓。多人贡献开源代码属于当前工程目标。
