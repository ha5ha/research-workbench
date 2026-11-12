# 验证说明

更新：2026-11-12。这里汇总实际执行的验证、复验入口和限制。最新源码的修复结果见[审计复验](#audit-2026-11-12)；真实模型、真实 SSH 与实际便携包保留 11-11 的历史验收身份，本轮没有重跑。截图、逐轮 JSON、操作过程和机器专用记录仅留本地/CI artifact。当前完成度见[发布门槛](1.0-release-gates.md)，后续缺口见[路线](roadmap.md)。

<a id="engineering"></a>

## 工程检查

2026-11-12，Node 24.18.1 / pnpm 10.34.5 的 Windows 普通用户环境：typecheck、architecture/code/styles 三项 lint、全量 Vitest、生产构建与许可证收集通过。Vitest 共 51 个文件（50 通过、1 显式跳过），209 项测试（208 通过、1 真实 provider opt-in 跳过）。真实进程树与 Core 退出测试实际执行，没有将宿主拒绝 taskkill 算作通过。2026-11-11 的 171 项通过是历史结果，不再作为最新测试总数。

```powershell
pnpm typecheck
pnpm lint
pnpm format:check
$env:RUN_REAL_AGENT = '0'
pnpm test
pnpm build:app
pnpm build:licenses
```

`format:check` 检查本次 tracked 变更和未跟踪源码；CI 用 `BASE_REV` 比较，提交前另运行 `git diff --check`。锁文件复验使用现有 store 执行 frozen/offline install，没有重解析或改写 lock，随后重跑全量测试。离线安装不证明干净远端环境已通过。分层范围见[测试说明](../../tests/README.md)。

<a id="audit-2026-11-12"></a>

## 2026-11-12 审计复验

审计基线为 `324acc01c1b31634e33a189b571074778c67cd08`。采用现有 Electron/pi/Core/React/SQLite 与 tokens，新增开发工具与复用评估见 [ADR-0022](../adr/0022-audit-reliability-and-quality-gates.md)和[依赖台账](dependencies.md)。报告中的建议作为修复输入，不执行其中嵌入的 Agent 输入模板。

| 审计项             | 修复与实际证据                                                                                                                                                                                                                                                                    | 状态                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| P1-01 保存冲突     | 原始字节 SHA-256、必填 expectedSha256、同路径串行 CAS；[单元回归](../../tests/unit/audit-file-conflicts.test.ts)验证 Agent 改写/删除/跨 Gateway；Electron 验证保留未保存内容、diff、重载、二次冲突和明确覆盖                                                                      | 本地通过                                                    |
| P1-02 会话隔离     | 单 runtime 操作队列；conversationId/turnId/toolCallId/generation 归属；[Core 队列](../../tests/unit/agent-isolation.test.ts)、[renderer 状态](../../tests/unit/conversation-isolation.test.ts)与真实 Electron A/B 流式切换/新会话回归                                             | 本地通过                                                    |
| P1-03 终端后代     | 普通命令 timeout/cancel 使用 Windows 进程树或 POSIX 进程组，失败保留根身份重试；[真实树测试](../../tests/integration/interactive-terminal.test.ts)核对子孙退出与日志；[Core 关闭测试](../../tests/integration/core-shutdown.test.ts)验证 EOF 清理/锁释放，受管 Job 继续并重开恢复 | Windows 本地通过；Linux/macOS 待相应宿主运行                |
| P1-04 默认拒绝     | effect/requiredPermission 单表；[权限测试](../../tests/unit/permissions.test.ts)与[真实 pi 宿主测试](../../tests/integration/pi-chat.test.ts)验证缺少 Core 元数据的新工具拒绝，磁盘 marker 不产生                                                                                 | 本地通过                                                    |
| P1-05 远端 CI      | [workflow](../../.github/workflows/ci.yml)固定 Node/pnpm/actions、frozen install、三项 lint/格式/测试/构建/许可/UI；[故意错误 fixture](../../tests/unit/quality-gates.test.ts)证实真实命令拒绝类型/边界/Hooks/颜色等错误                                                          | 本地通过；推送、验证 PR 与 required checks 待所有者明确授权 |
| P2-01 职责拆分     | Core 按领域注册 handler，Run 拆 Artifact/Evidence；renderer 提取 conversation、shell、code、records hooks/视图；原有科研闭环及全量回归通过，无第二状态库或 runtime                                                                                                                | 本地通过                                                    |
| P2-02 协议单源     | contracts 维护 80 个 RPC 参数/结果 schema、事件鉴别联合和共享 DTO；Core registry 拒绝未知/重复/缺失注册，Core/preload 双向校验；[协议回归](../../tests/unit/rpc-contracts.test.ts)与[RPC 回归](../../tests/integration/rpc.test.ts)包含协议失配错误                               | 本地通过                                                    |
| P2-03 Git 归属     | 仅成功显式写入、原先干净且哈希仍匹配的路径可自动提交；Shell/失败/取消留人工 diff/stage；[Git 回归](../../tests/unit/audit-git.test.ts)核对无关 staged/dirty、后续外部修改和人工新暂存均保留                                                                                       | 本地通过                                                    |
| P2-04 Session 路径 | Core 列举不透明 ID；relative/realpath/普通文件/扩展名/链接校验；[路径回归](../../tests/unit/agent-session-paths.test.ts)包含 sibling、traversal、symlink 与文件类型拒绝                                                                                                           | 本地通过                                                    |
| P2-05 项目忽略规则 | 不修改用户 .gitignore；用 Git 本地 info/exclude，非仓库跳过；[Git 回归](../../tests/unit/audit-git.test.ts)覆盖幂等、只读、硬链接、目录链接、工作区外 linked-worktree metadata；可选排除失败不阻止项目启动                                                                        | 本地通过                                                    |
| P2-06 CSS 组织     | 按 feature 保持原 cascade 顺序拆分；Stylelint 限制颜色/important/选择器与 ownership；共享控件 fixture 和三尺寸截图保留本地，人工核对保存冲突 1440/390 截图与焦点                                                                                                                  | 本地通过                                                    |
| P2-07 质量工具链   | lint:architecture/code/styles 分名并串联；ESLint unused/any/Hooks、Stylelint 与增量 Prettier；故意错误 fixture 运行真实工具，未关闭校验使检查通过                                                                                                                                 | 本地通过                                                    |
| P3-01 本地路径显示 | 移除不必要的 URI 解码；[路径显示回归](../../tests/unit/conversation-isolation.test.ts)及 Electron 含非法百分号名称的工作区实际打开                                                                                                                                                | 本地通过                                                    |
| P3-02 文档入口     | 根 AGENTS 留硬边界/命令/索引，完整规则迁入强制贡献规范，Core/renderer/contracts/ui 设局部规则；当前架构/UI 标权威、旧产品方案标历史；未降低原安全和审批要求                                                                                                                       | 已同步                                                      |

标准桌面回归：

```powershell
pnpm build:app
$env:RW_QA_SURFACES = '1'
pnpm test:ui
```

锁内 Playwright 驱动真实生产 Electron/Main/preload/Core，输出仅到 `.tmp/ui/{controls,audit,research-loop}`。54 项控件/表面、4 组审计场景与科研闭环的 6 项三尺寸视图检查通过，驱动 errors 为空；保存冲突另检查提示可读、操作在视口、Tab 可见焦点。截图检查发现并修复 `.ide-shell` 高 specificity 覆盖既有 ≤900px 单列断点的问题，恢复原响应式合同，未改变 tokens/字体/颜色或另设布局方案。错误提示清除 IPC 包装文案，保留可操作原因。

恢复边界：本轮没有科研数据库 schema 迁移；冲突不覆盖磁盘/缓冲区，Git 无法证明归属时交给人工审阅，终止失败保留身份和有界脱敏日志。回退须在关闭普通命令并核对活动/unknown 受管 Job 后，同步回退 contracts/Core/preload/renderer；不要删 `.research`、session 或证据。普通文件与自动提交的哈希检查不是针对工作区外部并发写者的 OS 级事务保证。

终端日志另有真实分块输出回归：已知宿主秘密跨 stdout/stderr 各自的 chunk 边界仍被脱敏，普通命令不继承凭据环境；UTF-8 多字节输出按 4 MiB 字节上限持久化，边界不截断字符。两项新增测试计入上述 208 项通过；最后重建 Core、重收许可并再次运行审计 Electron 驱动通过。

最后复查还修复 SDK 在 abort 后正常返回部分结果的路径：Core 队列独立记录取消，即便 SDK resolve 也拒绝成功结果，并停止该 turn 的晚到事件。[实际 pi/Core/Git 回归](../../tests/integration/agent-cancel-commit.test.ts)先完成真实 write_file，再中断流式续答；文件改动保留、HEAD 不变、没有自动提交或成功事件。类型检查显式使用 renderer 所需 DOM lib，并排除生成的 desktop/resources，避免依赖构建目录偶然带入的声明；旧启动器测试改为完成标记和进程实际退出均满足才清理，修复 Windows EBUSY。中途出现过的生成声明扫描失败与清理竞争均未算作通过；修复后全量门禁重新执行。

尚未闭合：远端 Actions 首次安装/运行、故意破坏类型或边界的验证 PR、`quality (windows-2022)` / `quality (ubuntu-24.04)` / `quality (macos-15-intel)` required checks；本地结果不能冒充 main 已受保护。仓库禁止未获明确授权推送或改远端设置，因此先完成本地可审阅改动，再向所有者申请仅 GitHub 分支/验证 PR/保护规则的授权。Linux/macOS 实际进程树、最新 EXE、真实模型与真实 SSH 不以本轮 Windows 离线回归代替。

<a id="ui"></a>

## 界面与交互

2026-11-11 完成三轮 Electron 回归，每轮 54 项控件/表面、21 项聊天交互，以及科研闭环和 6 项视图检查。2026-11-12 最新源码另运行[审计复验](#audit-2026-11-12)的标准桌面入口。覆盖 1440×900、1024×768、390×844、200% 缩放、菜单键盘/可见焦点、中文 IME、历史滚动、设置保存读回和失败恢复；所测界面无页面级横向溢出或小于 12px 的文字。正常路径经过 Main/preload/Core，部分错误与 diff 状态使用独立组件 fixture。

先执行 `pnpm build:app`。标准入口 `pnpm test:ui` 使用锁定的 Playwright；历史聊天驱动仍可由 `RW_PLAYWRIGHT_MODULE` 指定 QA 模块。脚本创建隔离工作区和配置；`RW_QA_OUTPUT` 可单独指定每个驱动的本地输出，不要让多个驱动共用同一报告文件：

```powershell
$env:RW_QA_SURFACES = '1'
node scripts/verify-ui-controls.mjs
node scripts/verify-audit-ui.mjs
node scripts/verify-chat-interactions.mjs
node scripts/verify-research-loop.mjs
```

标准驱动的截图和报告输出到已忽略的 `.tmp/ui/`，历史现场驱动输出见[测试说明](../../tests/README.md)。原型参考仍在 `design/reference/screens/`，设计约束见 [UI 合同](../standards/03-prototype-ui-contract.md)。这次源码增量尚未重打便携 EXE；原始归档产物内容预览仍待实现（N09），哈希标签不代替原文核验。自动操作和独立走查不等于真人可用性研究。

<a id="research-loop"></a>

## 模型与科研闭环

生产 pi/Core/Electron 与真实 DeepSeek 完成读取项目、冻结计划、人工侧批准、三组本地计算、六份产物、四份来源引用、结论确认、决策和完整重开。前两组基线/改善方案由模型提出；负结果组由 QA 提出并由模型核验归档，没有自动确认新结论。一次字段拼写错误被 schema 在执行前拒绝，模型同回合纠正；最终无未恢复工具错误或额外运行。

数值由固定二次函数脚本复算，负结果保留，不作科学泛化、显著性或竞品优势推断。确认与决策由 QA 在人工侧操作，模型只能提议。

复验脚本为 `node scripts/verify-real-agent-loop.mjs`，需先构建并配置 `RW_PLAYWRIGHT_MODULE`。真实模型会产生费用，只在另行明确授权的环境运行；用 `RW_REAL_SETTINGS` 指定加密配置、`RW_REAL_LOOP_OUTPUT` 指定本地输出。恢复同构建的隔离会话使用 `RW_REAL_LOOP_SESSION`，已完成会话可用 `RW_REAL_LOOP_RECHECK=1` 核验恢复。凭据、完整会话和原始私有数据不进入仓库。

<a id="local-ssh"></a>

## 本地与 SSH 恢复

两个本地 45 秒 Job 已通过实际桌面退出、Core 强杀和重开检查：同一 Job 继续并成功，幂等键不产生重复。真实原生 SSH 已完成两轮归档预测维护重算和 120 项数值复核，覆盖指纹确认、密码加密、幂等、取消、超时、缺件，以及 Core 强杀/桌面重开后的同 Job 恢复。

本地恢复脚本为 `node scripts/verify-desktop-recovery.mjs`；SSH 协议 fixture 为 `node scripts/verify-native-ssh.mjs`，不运行真实远端 Python。真实环境使用 `scripts/verify-real-ssh.mjs`，由 `RW_QA_RESEARCH_ROOT`、`RW_QA_REMOTE_PYTHON` 和 `RW_QA_REMOTE_ROOT` 指定授权输入与远端位置，需独立授权，不纳入普通 CI。

当前结果不覆盖 MFA/ProxyJump、真实 TCP 中断、任意机器环境或长期 GPU 作业。Core 权限边界不是 OS 沙箱。更新或回滚前核对活动/unknown Job，退出 Core，备份工作区 `.research` 与加密配置并核对存储版本；unknown 先检查同一 Job，不新建运行冒充恢复。

<a id="distribution"></a>

## 分发

原 1.0.0 Windows x64 便携 EXE 已通过两次冷启动、本地计算、重开与数据保留，142 个精确第三方包及完整 LICENSE/NOTICE、分发文件哈希已核验。此结果只适用于当时的包；后续共享控件、聊天和主题源码增量尚未重新打包。

```powershell
pnpm package
node scripts/verify-portable.mjs
```

便携验证同样需要 QA Playwright，可用 `RW_PORTABLE_EXE` 指定新包。依赖与分发许可证流程见[依赖台账](dependencies.md)。包未签名；干净机器、跨平台、自动更新与远端 CI 待验收。新 CI 配置已在本地建立，远端状态与授权要求见[审计复验](#audit-2026-11-12)；历史 OAuth scope 问题不作为本次已重新核验的认证状态。
