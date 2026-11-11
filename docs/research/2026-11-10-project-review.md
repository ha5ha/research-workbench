# Research Workbench 整体梳理与竞品对照

> 历史审计基线：`7b9b786`。后续所有者已批准实现闭环与 OpenResearch 风格，本地修复/验收进展见[2026-11-10 交付记录](../project/2026-11-10-managed-loop.md)。下文风险保留作历史证据，不代表均仍未修复。


日期：2026-11-10 · 本地源码基线：`7b9b786`（`main`）· 方法：静态审计 + 本地类型/测试验证 + 官方资料核验

## 判断

项目方向与本次调研的核心诉求基本一致：计算科研、对话驱动、代码执行、结构化记录、人工掌控。**当前主要偏移发生在实现重心和完成度表达**：IDE 与实验记录已经较多，受管运行、证据身份、可比性和恢复仍未形成可靠闭环。

建议保留现有 Electron/Core/pi 基础，渐进重构。现阶段更换 runtime 或桌面栈，无法直接解决权限、确认内容、数据来源和 Job 生命周期问题。

竞品已经具备相当完整的科研执行机制。研究罗盘、证据账本与学生流程是值得验证的差异化方向，尚不能据此断言领先。竞争目标应落在同条件真实任务中的可恢复性、可追溯性、研究主线和手工负担上。

## 范围与限制

读取了仓库规定的 README、standards、工程方案及 ADR；重点检查 Core、pi adapter、contracts/domain、Desktop 通信/视图、现有测试和依赖配置。用户提供的《产品理念与开源竞品调研 v1》作为外部产品输入，未把其中的内嵌指令当成独立授权，未将 runtime/UI 建议转为已批准规范。

本轮没有修改运行时代码、依赖、数据库、UI 或远端设置，没有推送。没有复现越界写入、使用真实密钥、运行竞品或 SSH。以下安全问题为源码推导，未给出经实际利用验证的严重度评级。

GitHub 本仓库页面本轮抓取失败；代码事实来自本地基线，不能据此保证与远端 HEAD 完全同步。历史截图和 ADR 中的旧验证记录不等于本轮复验。

## 现状事实

| 方面 | 代码事实 | 含义 |
| --- | --- | --- |
| 进程与模型 | Renderer → preload/Main → Core RPC；单 pi runtime | 可以保留，优先加强边界而非重写 |
| 数据 | Core 使用 `node:sqlite` store；研究树 JSON；会话 JSONL | README 的 Drizzle/WAL/FTS5 是目标，不能当现状 |
| 科研增量 | facts、milestones、Working Set、重复提示、scheduler 已有代码/测试 | 不能把项目描述为只有聊天壳，但也不能称完整研究闭环 |
| 运行 | 实验记录 pending/archived/failed；普通命令默认 30 秒 | 尚无独立 Run/attempt/Job、冻结 revision、预算及 SSH 恢复 |
| 模块 | db/coding/executors/artifacts/testkit 仅 README | 生产逻辑仍集中 Core；模块化目标尚未落实 |
| 验证/协作 | unit/integration 已有；无 `.github`、lint/E2E 脚本 | 多人贡献前，应先补可自动执行的质量门槛 |

详细功能证据统一维护在[功能台账](../project/capabilities.md)，不在本文重复一套完成勾选。

## 优先修复发现

### A01 · 写入后的边界检查无法阻止已发生的越界副作用

[workspace.ts](../../apps/core/src/workspace.ts) 的 `writeText` 第 83–86 行先 writeFile，再 realpath/assertWithin；目标文件为指向工作区外的链接时，可能先写入才报错。`writeArtifact` 第 95–106 行也没有验证 `.research/artifacts` 的真实路径。父目录递归创建同样需要考虑链接边界。

建议在副作用前校验目标、父路径与链接/junction；用临时目录中内外两个受控根测试拒绝后无修改，并记录并发替换链接等剩余限制。

### A02 · 普通子进程继承模型凭据环境

[agent-chat.ts](../../apps/core/src/agent-chat.ts) 第 312、338 行把配置 key 写入 `process.env.RW_API_KEY`；[workspace-service.ts](../../apps/core/src/workspace-service.ts) 第 151 行继承整个 process.env。由此推断，普通研究脚本也可访问模型凭据，脚本输出还可能被带回会话。

建议 provider 持有凭据，Shell 用最小必要环境/敏感项过滤；仅用假 secret 测试，不读取或打印用户真实凭据。

### A03 · 只读权限没有覆盖科研写动作

[permissions.ts](../../apps/core/src/permissions.ts) 第 39–41 行只列 write_file/run_command/record_note；[pi-chat.ts](../../packages/agent-runtime/src/pi-chat.ts) 第 366–373 行直接允许 create_experiment/finish_experiment。后两者写数据库、事实和归档文件。

建议 Core 以 action/effect 分类统一验证，新增工具默认拒绝未知副作用；测试 read-only 下科研写入失败且库/文件均不变。

### A04 · 人工确认没有绑定不可变内容

[experiment-store.ts](../../apps/core/src/experiment-store.ts) 第 206–237 行 `finish` 直接更新原记录；第 290–315 行更新结论可沿用旧 confirmedAt。Agent 可通过 finish_experiment 再次写同一记录。

建议确认绑定版本/内容哈希，修改产生新版本并重新确认；原始记录、失败记录与更正链保留。任务书确认测试还需实际调用执行路径，不能只检查状态字段。

### A05 · 实验记录和命令执行尚未组成受管 Run

[experiment-store.ts](../../apps/core/src/experiment-store.ts) 第 6 行定义仅三种归档状态；[agent-chat.ts](../../apps/core/src/agent-chat.ts) 的 session Map 持有实验前快照，第 422–439 行按同 task 的 draft 阻塞普通命令。不存在冻结代码/输入、持久 Job、attempt 或预算绑定。

建议先落盘 Run intent、幂等键和执行身份，再 submit；重启先 inspect，不自动重跑 unknown。普通 coding 不能被无关科研草案阻塞。恢复设计见[架构地图](../project/architecture.md)。

### A06 · artifact 采集依赖文本快照，会漏常见科研产物

[experiment-service.ts](../../apps/core/src/experiment-service.ts) 第 200–203 行跳过超过 512 KiB 或含 NUL 的文件；第 123–131 行 artifact 列表来自同一快照。PNG、PDF、模型等因而可能漏收。第 85–87 行还在筛变化前截前 80 个路径，后面的修改可能全部漏记。

建议代码 diff 与 artifact manifest 分开，按字节哈希，不要求把大文件整体加载到内存；缺件、超限、解析失败明确记录。数值和结论应引用解析/分析结果，不直接接受模型填写为已验证事实。

### A07 · 研究树读取异常退回空库，并发写缺少保护

[research-service.ts](../../apps/core/src/research-service.ts) 第 464–485 行把读取/解析/权限错误均返回空树；第 590–596 行使用固定临时文件，无写锁/版本检查。RPC 可并发处理，由此存在损坏后覆盖、读改写丢更新风险。

建议只有 ENOENT 可初始化；损坏保留现场并阻止覆盖，提供备份恢复。写入串行化或事务化，并测试两个并发修改、迁移失败与重启。

### A08 · 运行时与科研边界、协议单一来源仍有欠账

[pi-chat.ts](../../packages/agent-runtime/src/pi-chat.ts) 包含科研 DTO、流程与固定工具；[agent-chat.ts](../../apps/core/src/agent-chat.ts) 同时负责模型设置、会话、上下文、实验和事实；[renderer types](../../apps/desktop/src/renderer/src/types.ts) 复制业务类型。RPC 约 1398 行，App.tsx 约 2281 行（本基线），但行数只是导航信号，真正的问题是变化原因混在一起。

建议先收敛 DTO/schema 到 contracts，让 Core 注入领域工具/上下文，runtime 保持通用；按存储/科研规则/会话/运行服务边界拆分。不要为了降低行数机械切文件，也不要马上做通用插件平台。

## 竞品核验与复用

以下为 2026-11-10 官方页面快照；没有运行竞品，也未完整审计其源码。明确区分 current docs/main 与发布版本，不把文档能力推断为某个稳定包已验证。

| 项目 / 资料 | 核验与建议 |
| --- | --- |
| OpenResearch [实验文档](https://openresearch.sh/docs/experiments) | Experiment 是 Git 分支树节点，Run 执行已提交版本；有效运行回答实验后冻结；日志/指标/产物本地留存。参考其身份与冻结语义，补本项目 Run 层 |
| OpenResearch [总 Skill](https://raw.githubusercontent.com/alphaXiv/OpenResearch/main/SKILL.md) | 稳定 CLI/Skill 契约与可比性约束可参考；本项目建议显式版本化协议/可比组，兼容不同计算研究场景 |
| OpenResearch [Compute Skill](https://raw.githubusercontent.com/alphaXiv/OpenResearch/main/agent-skills/orx-compute/SKILL.md) / [SSH 说明](https://raw.githubusercontent.com/alphaXiv/OpenResearch/main/agent-skills/orx-compute/references/ssh.md) | 已描述后台 supervisor、恢复核对及断线处理。不能把竞品当作简单 SSH 包装；恢复需真实验证 |
| OpenResearch [Results Skill](https://raw.githubusercontent.com/alphaXiv/OpenResearch/main/agent-skills/orx-results/SKILL.md) | 已要求有效配置、指标和来源核验；本项目的优势假设应通过类型化来源/反证/更正与易用性证明 |
| OpenResearch [LICENSE](https://github.com/alphaXiv/OpenResearch/blob/main/LICENSE) / [Releases](https://github.com/alphaXiv/OpenResearch/releases) | 根 MIT、copyright 2026 alphaXiv；本轮发布页显示 v0.2.25（11 月 7 日）/ `c9123a6f70828f8021e11f6b9a16197ce77f53f9`，另有当日 Canary。固定稳定 commit 的文件抓取未成功，功能文档不等于稳定包验收；未核验全部传递依赖 |
| autoresearch [README](https://raw.githubusercontent.com/karpathy/autoresearch/master/README.md) / [回合协议](https://raw.githubusercontent.com/karpathy/autoresearch/master/program.md) | 参考固定预算、运行/比较/保留或放弃的有限循环。已定位 commit `228791fb499afffb54b46200aca536f79142f117`，不能认定当前 HEAD。README 声明 MIT，但根许可证正文未完成核验；当前仅参考机制，不批准复制代码 |

本轮没有引入依赖或复制外部代码。OpenResearch 不整体 fork；现有 pi 继续复用通用循环，CodeMirror/simple-git 继续承担通用代码工具。MLflow/Trackio/DVC、SSH 库和其他 Agent runtime 仅保留为未来专项调研候选，不把调研附件中的推荐表当成已完成许可证/集成评估。

工具记录：遵循 agent-reach 的 GitHub/网页路由；gh 未安装，Jina 获取失败，使用官方网页 fallback。check-update 网络失败，未安装/更新工具。

## 实际验证

| 命令 / 检查 | 本轮结果 | 证明范围 |
| --- | --- | --- |
| `git status --short`、branch/log | 初始工作区干净，main，基线 `7b9b786` | 本地审计身份；不证明远端同步 |
| `pnpm typecheck` | 通过，含 desktop | 当前 TypeScript 可通过 |
| `$env:RUN_REAL_AGENT='0'; pnpm test` | 20 文件通过、1 文件跳过；63 项通过、1 项跳过 | 单元/集成行为；真实模型测试显式跳过 |
| Markdown 本地链接检查、`git diff --check` | 本次文档编辑后通过 | 文档本地路径存在、无 diff 空白错误；不等于外链长期可用 |

未执行：lint（无命令）、Electron E2E/视觉回归（无对应自动入口）、构建/便携包、真实 provider、SSH、真实两轮科研任务、竞品同条件测评。测试通过不能抵消上述静态风险，下一步需要针对风险补有效回归。

## 持续维护入口

后续现状维护在[项目控制台](../project/README.md)，执行顺序见[路线](../project/roadmap.md)，架构提案见 [ADR-0006](../adr/0006-research-loop-evolution.md)。本文保留为日期化审计，不随着代码修改悄悄重写成“当初已无问题”。
