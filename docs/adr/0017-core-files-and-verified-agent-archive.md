# ADR-0017：Core 文件策略与可信 Agent 归档

- 状态：Accepted（2026-11-11，所有者要求直接重构；最终边界审查发现元数据路径绕过及无运行归档）
- 关联：规范 02、ADR-0007/0009/0010/0015

## 问题与复用决策

Agent 的原始路径前缀检查可被 `./`、父目录折叠和 Windows 分隔符绕过；`read_file`、Skill 读取又可能换入口读取 Job token。旧 `finish_experiment` 信任模型提供的指标、逐 seed 和产物路径，任务书已批准即可归档，没有受管 Run 的终态依据。

沿用已有 Node path/crypto/fs、RunStore、RunService、Zod，无新依赖。比较：①各 Agent 工具各加字符串过滤；②在现有 WorkspaceToolGateway 规范化后统一执行读写策略。选择②，覆盖普通文件和 Skill 读取，避免多个黑名单漂移。受管 snapshot/job/数据库的写入仍由专用服务使用既有 workspacePath/atomicWorkspaceWrite；不增加第二套执行器、状态库或 SDK。

## 决策

1. 通用文件访问先统一正反斜杠并规范化，拒绝越界、绝对/drive 路径、ADS、控制字符和 Windows 尾点/空格歧义。workspacePath 按每层 realpath 校正已有路径和最深已有父目录，返回真实目标；网关必须在不创建目录的解析后，以实际相对路径执行同一策略，因此 NTFS 短名等物理别名不能绕过。路径内任意 `.research/.git/.agent/.agents/.pi/.ssh/.aws/.codex` 目录及常见凭据文件不开放通用读写。文件读取拒绝链接/junction、硬链接和超额内容。Core 专用内部服务继续只受工作区/链接边界约束，不套用通用私有目录政策。
2. 通用工具永远不能写上述内部目录。受管产物保留只读：`.research/artifacts/profile-<12位内容哈希>.json` 核对内容寻址后缀；`.research/jobs/job-<UUID>/artifacts/results/metrics.json` 必须由该 Job manifest 精确登记为 present，并核对大小和完整 SHA-256。不能读取 Job config/status、数据库、锁、会话、冻结 source 或未登记文件；冻结代码通过独立的 plans.readFrozenFile 审阅接口读取。
3. `finish_experiment` 必须提供 experimentId/runId；移除模型的 metrics/seeds/seedResults/artifacts/status 输入和 reusable.path，不保留旧工具兼容分支。Core 要求该 Run 属于目标实验、state=succeeded、实验不存在活动/unknown Run，重新核验冻结协议必需产物并解析原始指标，派生均值、标准差、seed 数与逐 seed 数据和受管产物引用。撤回权限、失败、取消、缺件、篡改都拒绝归档。
4. 模型仍可写候选解释和 proposed facts；归档不会确认 claim 或实验结论。人工补录的 ExperimentStore/RPC 独立保持，不冒充受管执行。
5. 模型的 research_state 使用单一 Core 投影删除 ManagedRun.jobToken；普通 UI 契约保持原样。该工具先刷新受管运行状态。request_run 返回冻结计划而无 Job token；finish_experiment 仅返回实验身份/状态；产物读取返回核验后的内容。

## 验证与局限

回归覆盖 `./`、`..` 折叠、大小写、反斜杠、内部目录、内容寻址/manifest、junction/hardlink、篡改和未登记产物；受控 realpath 别名独立于主机短名配置验证实际路径策略、新路径无 mkdir、公有路径仍工作和产物核验。本机 Windows 可用的真实 NTFS 短名同样验证拒绝读取/写入内部文件。Agent 集成验证无 Run/各非成功状态、交叉实验、较新活动 Run、只读权限、可信数值派生、token 投影、重复归档及候选结论。

使用宿主注入工具和本地 fixture，不调用真实模型或 SSH。最终生产模型/打包验收需在新 schema 上重跑。用户已明确批准的 shell/full-access 仍是有副作用的系统命令能力；本策略针对通用文件工具，不能充当 OS 进程沙箱。回退前核对活动 Run 并保留台账与产物；旧版不能安全继续写入受管数据。
