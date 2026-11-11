# 2026-11-10 受管科研闭环交付记录

范围：所有者批准实现 G0–G5 方向，优先闭合本地小型实验；SSH 预览不等于真实主机验收。基于 `7b9b786` 的本地未提交变更；没有推送远端。

后续进展：[2026-11-11 真实科研输入与 SSH 维护验收](2026-11-11-real-ssh-validation.md)已完成部分现场验证；下文记录本交付日边界，当前状态以功能台账为准。

## 现在可以怎样用

1. 在代码工作面准备独立 Git 研究仓库并提交代码；受管运行只提取 HEAD 的普通文件。依赖环境需事先准备，快照不复制 node_modules、链接或密钥文件。
2. 打开“研究罗盘”，记录问题、约束、停止条件及下一步。创建任务书，配置命令、时间/日志预算、输入、seed、指标方向和输出契约。
3. 冻结计划后审阅 revision、命令、协议、文件哈希与预算；点击“批准并运行”。模型只有提议工具，不能批准或启动。
4. 独立 supervisor 运行并持久化日志、心跳和退出状态。应用重开后 Core 核对同一 Job；unknown 保留，不自动重提。
5. 必需产物按字节复制归档并计算 SHA-256。JSON/CSV 指标每行带 seed，工具计算均值、样本标准差与 n。缺件、非法指标、seed 错配不会成为成功运行。
6. 同协议、命令、输入身份、声明环境与锁文件组才允许比较；比较前重新核对原始证据。代码 revision 允许不同，以比较改进版本。
7. 选择具体支持/反证文件，记录候选结论与局限；人工核验证据后确认。决策显式选择引用结论，保存继续/修复/停止/放弃的理由。
8. 导出 Markdown 检查点，或通过四个 Research Skills 导出有版本与来源的结构化 JSON。文件写入 `.research/reports` / `.research/artifacts`，不上传。

最小指标输出：

```json
[{"seed":0,"score":3},{"seed":1,"score":5}]
```

## 实现边界

| 模块 | 权威职责 |
|---|---|
| contracts/research-loop | Plan、Run、协议、Claim、Decision、Compass DTO 与输入校验 |
| Core RunStore | 新增 SQLite 表：plans/runs/events/research_loop_records；不重写旧实验 ID |
| Core RunSnapshot | 从提交提取不可变代码与选定输入，生成身份哈希，审批/启动前核验 |
| Core RunService | 审批、幂等、状态核对、收集、指标解析、证据确认、导出 |
| Local supervisor / SSH adapter | 独立进程执行与持久状态；不持有模型凭据、不改科研结论 |
| Research Skills | checkpoint/evidence-ledger/decision-log/next-step 确定性投影；只生成 artifact/proposal |
| ResearchLoop UI | 人工审阅与操作；沿 Main 白名单 RPC 访问 Core |

## 验证与当前限制

- Core 集成测试执行两轮真实小型 Node 计算，覆盖批准门禁、重复提交、新服务实例恢复、原始哈希篡改、缺件、seed 错配、超时、取消。
- SSH 使用 RemoteExecutor 受控夹具验证“响应丢失 → unknown → 原 Job 恢复”、断线取消及不重提。**未连接真实 SSH 主机，Python/OpenSSH 传输尚未现场验收。**
- Electron 实际入口覆盖方向保存/刷新读回、任务书、冻结批准、运行、结论、决策、导出；注入存储失败后保留草稿。三尺寸检查见[截图说明](../../design/implementation/managed-loop-20261110/README.md)。
- 独立 UX 走查发现记录详情与受管运行状态割裂、手工草稿保存缺反馈；已修复并完成主 Agent 入口回归。[独立报告](../../design/implementation/managed-loop-20261110/ux-review/REPORT.md)保留修复前观察，未独立复测。
- `pnpm typecheck`、`pnpm lint`、Vitest 与 `pnpm build` 的最终结果见截图说明/测试说明；CI 文件已提供，远端运行未发生。
- Node 24.18.1、Git 2.55.0.windows.3、pnpm 10.34.5；本机 OpenSSH 9.5p2、Python 3.12.10。未新增第三方库；直接依赖固定为现有 lock 解析版本，详见[依赖台账](dependencies.md)。

这里的“已验证”指退出码、必需产物、数值/seed 和来源完整性通过；不代表科学假设成立。环境哈希没有证明驱动、硬件、Python 包与远端环境完全相同，不做统计显著性推断。

本地 Shell 是明确批准的执行环境，**不构成 OS 沙箱**；文件检查防止静态链接/junction 逃逸，但不抵御同权限恶意进程并发替换父目录。JSON 研究树写队列只覆盖单 Core 内的多个服务实例；同时启动两个 Core 写同一工作区不受支持。

快照限额 2000 文件/代码 128 MiB/含输入 256 MiB；产物单件 128 MiB、总计 256 MiB；指标 2 MiB。大数据、增量传输、指标实时流、完整复现包与科学评测另列后续任务。

实验列表现已投影最新 managed Run 的状态/指标，并跳转到真实 Run 详情，避免把任务书的 pending 显示为运行未完成。旧 `finish_experiment`/事实黑板仍兼容手工历史记录，不能把模型填写指标当作新受管证据；新 Claim 必须引用验证成功的 managed Run。旧 diff 归档仍有文本/数量限额；本次修复先过滤变更再截断，受管产物走独立 manifest。

## 数据与回滚

- 数据在 `.research/workbench.db`（新表追加）、`.research/plans`、`.research/jobs`、研究树与备份；旧记录保持原样，不编造缺失 revision。
- SQLite 事务先存运行意图和事件，再启动 Job。取消也先记录请求；状态未知时保留原 Job。
- 回滚前停止或核对活动 Job，关闭 Core，对整个 `.research` 做用户控制的备份；保留 jobs/plans/日志，不能只换应用后删除目录。旧版不访问新表，旧版读写会丢失新语义，回滚期间不要继续写新研究。
- 磁盘占用的保留/清理 UI、数据库统一迁移版本、证据更正链尚未交付；不得自动删除原始证据。

## 仍要做

1. 真实 SSH 两轮实验、断线/重开/取消、Linux Python supervisor 与安装包生命周期验收。
2. 第二个实际研究仓库、真实模型端到端、跨日 60 秒恢复与相同预算竞品对照。
3. 打包分发许可/NOTICE 完整核验、安装迁移、磁盘保留策略、证据更正链。
4. 更细的领域状态机与通用工具注入重构；将稳定模块迁到 db/executors 等包，避免空目录式架构。

没有完成这些验证前，不宣称整体超越 OpenResearch 或达到正式 1.0。
