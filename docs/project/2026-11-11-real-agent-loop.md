# 真实模型与本地数值科研闭环验收

状态：通过。2026-11-11 02:41:07–02:42:21（Asia/Shanghai）完成三臂真实运行，02:45:18 在同一隔离 session 中完成最终重启与记录核验。6 个真实模型回合、33 次工具调用：32 次成功，1 次参数校验拒绝后模型自行修正；没有未恢复的工具错误或页面错误。最终门槛为工作流、结果、证据与恢复完整，校验器必须拒绝无效输入，不能以模型从不输错字段代替安全验收。

## 验证范围

使用现有 pi 1.4.0（MIT）、生产 bundled Core、Electron Main/preload 与真实 `deepseek-reasoner`。不引入运行时或依赖。复用现有受管 Run/Job、ToolGateway、冻结 Git 快照、审批和证据服务；授权 QA 驱动器在人工侧 UI 独立操作审批、结论确认和决策。前两臂由模型提出方案和候选结论；第三臂明确由 QA 编写、提交和提议，模型只核验并归档。

Core 工具、提示和演示行为的迁移见 [ADR-0015](../adr/0015-host-owned-agent-tools.md)。删除旧 PiChatTools/runPiSpike 双接口；确定性 spike 也复用同一个 runtime。已修复 `deepseek-reasoner` 不在 SDK 目录时静默替换为另一模型的问题，实际请求保留配置的模型名称与 endpoint，并有请求级测试。

本次构建使用 host-only ResourceLoader 与内存模型配置，不自动扫描、执行或安装工作区/用户目录中的扩展、包、技能、模板、主题、AGENTS/SYSTEM，也不读取支持 shell 值的磁盘 models.json。会话、工具 schema 与授权由 Core 显式注入；单独回归测试证明恶意资源不执行、正常宿主工具仍需授权。

场景为固定二次函数 `(x-3)^2` 的梯度下降：初始点 `-1/0/1`、十步、CPU、无随机数。基线学习率为 0.1，变体只把源码中的学习率改为 0.2。模型必须读源码、创建任务书和冻结方案；QA 检查实际方案和冻结源码，再单独点击“批准并运行”。模型从归档文件读取结果、归档实验并提出带 SHA-256 的候选结论。QA 再核验证据、确认结论并记录决策。

科学负结果臂仅将同一源码的 learningRate 改为 1.1，仍保留十步、三个固定初始点、同一命令和评测协议。QA 独立提交源码、提议实验与冻结方案，并在 UI 审批；报告以 `modelProposed: false` 标记来源。模型读取该次成功运行的产物和 QA 脚本计算的比较值后归档，未新建或确认 claim，原有 claim/decision 的结构化内容逐字不变。

## 数值与证据要求

每个 seed 的数值由运行脚本输出，并与解析递推式校验；比较均值、差值、比例由 `scripts/verify-real-agent-loop.mjs` 从归档数据计算，写入 `analysis/comparison.json` 后供模型读取。模型不得口算派生指标或扩展到未计算的稳定性、显著性或泛化结论。

| 条件       |        平均 final_loss | 测量身份         |
| ---------- | ---------------------: | ---------------- |
| 学习率 0.1 |    0.11144907877866184 | 三个固定初始点   |
| 学习率 0.2 | 0.00035342864920609067 | 同三个固定初始点 |
| 学习率 1.1 |      370.5967992699239 | 同协议科学负结果 |

这些结果只验证确定性夹具和工作流，不代表真实科研数据、统计独立重复、算法普遍优越或最佳学习率。最终候选结论没有扩展到未测试的稳定性范围；人工确认前，驱动器强制核对两臂各自的 metrics.json 与 summary.json，共四个路径、runId 和 SHA-256 引用，均以 `supports` 支持整条比较结论。Core 提示明确证据关系相对于整条 claim，不能因为是 baseline 就标为反证。若候选引用不全，最多请求一次同 session 补充，旧候选保持未确认；本次最终执行无需补充。

| 身份          | baseline                                   | variant                                    | negative                                   |
| ------------- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| Run           | `job-2acc7184-7e6f-4063-a0a1-5e63100d0d85` | `job-eabfe98d-83e6-4ea2-9600-f2659eec3143` | `job-1a748566-d5e9-411b-b6e4-d3bb5f340eda` |
| 冻结 revision | `25393a7bde7bc10db7f0cffee6fcb3fa52cb44a5` | `ae865a6cfb672e4aa8cc96b0213840d96fd55d6a` | `6a6d519a700b408ccc123b69ae42deed401eb0af` |
| 状态          | succeeded / exit 0                         | succeeded / exit 0                         | succeeded / exit 0                         |

QA 比对学习率外所有源码字节、三次运行共六份产物 SHA-256、逐 seed 解析递推值及归档数值。`runs.compare` 对两项比较均返回 `comparable=true`：lr=0.2 相对基线的 delta 为 `-0.11109565012945574`；lr=1.1 的 delta 为 `370.48535019114524`，`better=false`。负结果的执行状态仍为 succeeded，实验仍归档并保留全部三个初始点的数值；没有作统计显著性推断。

对应生产 Core SHA-256 为 `1283a2e22489e2b57bd34858b353d66bda448c24b74180d0e497fc92d6410434`，Main 为 `6b4c35ec16ff6950a79aa9213c9c97539d1a20c0b8897bd13b2a40c4d5c77cca`。运行前后哈希一致；报告拒绝不同构建续用检查点。生产源码与构建在验收期间未修改。

## 归档与参数拒绝恢复

三次 `finish_experiment` 调用都只提交匹配的 experimentId/runId 及候选解释，负结果附带 curation/reusable 描述；没有模型输入的 metrics、seeds、seedResults、artifacts、status 或 reusable.path。Core 从匹配的 succeeded Run 重新核验产物并派生全部归档值。五次 research_state 工具结果均不包含 jobToken。逐调用审计见 [session-audit.json](../../design/implementation/real-agent-loop-20261111/session-audit.json)。

变体提议中，模型首次把必填 `hypothesis` 拼成 `hypotheses`。SDK schema 校验在 callback 执行前拒绝；紧接着的正确调用保持 title/goal/design/metrics/seeds 不变，成功创建 RUN-002。最终 RPC 核验恰为三个归档实验、三个成功 Run，没有额外实验或计算。报告保留 `toolErrors` 中这一项，并以 rejected/corrected toolCallId、同一意图字段和成功 experimentId 记录唯一 `recoveredSchemaRejections`；`unrecoveredToolErrors` 为空。仅该可证明无副作用、已恢复的参数拒绝可通过，其余执行失败或未恢复错误仍令验收失败。

## 安全与恢复

使用 `.tmp/real-agent-loop-*` 内的独立 Git 工作区与独立 userData。仅复制保存的 API 密文及 Windows `Local State/os_crypt` 中 DPAPI 包裹的密钥材料；明文仅由 Electron Main 的 safeStorage 在内存解密。原配置不修改，不把凭据、Job token、完整会话或原始 profile 纳入版本库。

完整关闭并重启 Electron/Core 后，plans/runs/claims/decisions 的结构化内容完全相同；三个成功运行、已确认结论和研究决策均恢复，原 pi 会话恢复并成功导出检查点。最终在同 session 再次重启并核验三实验/三 Run/四来源/人工决策，没有新增模型请求或重跑计算。退出后保留 `.tmp/real-agent-loop-a6YnL4` 用于审计和恢复；不覆盖用户研究目录。撤销验收只需关闭该实例；不修改原设置与原项目。

## 复算入口

先完成 `pnpm build:app`。配置 `RW_PLAYWRIGHT_MODULE` 指向已有 Playwright 包，然后运行 `node scripts/verify-real-agent-loop.mjs`。使用保存的真实 provider；脚本无 mock endpoint。可设置 `RW_REAL_SETTINGS` 指定保存配置，`RW_REAL_LOOP_OUTPUT` 指定报告目录。失败后使用 `RW_REAL_LOOP_SESSION=.tmp/real-agent-loop-<id>` 从同一构建的阶段检查点继续；`RW_REAL_LOOP_RECHECK=1` 在已完成的 session 中重新做恢复与最终核验，不重跑已有阶段。

机器证据与截图位于 [real-agent-loop-20261111](../../design/implementation/real-agent-loop-20261111/report.json)。报告包含实际模型标识、工具完成/拒绝与恢复、三次 revision 和方案摘要、产物哈希、两个单变量 diff、人工 QA 动作、负结果来源、数值复核与完整重启恢复结果。任何 `pass` 都只适用于对应报告中的实际执行，不替代安装包或真实 SSH 主机验收。

所有异步状态等待都在 Node 侧 `await RPC` 循环中带 deadline 核验；不以 Playwright 对 async 谓词的 Promise 真值作为成功依据。验证还包括通用工具注入、宿主拒绝、非法 schema、未注册工具、授权异常、会话恢复、Core 科研提示注入、managed-plan 人工边界、架构边界测试、类型检查、lint 和生产构建。
