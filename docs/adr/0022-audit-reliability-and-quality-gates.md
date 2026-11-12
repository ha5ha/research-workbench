# ADR-0022：审计修复、协议单源与质量门禁

- 状态：Accepted（所有者要求修复 2026-11-12 审计的全部问题）
- 日期：2026-11-12
- 范围：P1-01–05、P2-01–07、P3-01–02；保留 Electron、pi、SQLite、React 和现有视觉合同。

## 问题与复用决策

修复文件陈旧保存、单 runtime 并发、终端进程树、未知工具权限、自动提交归属、会话目录与项目打开副作用。contracts 统一传输 schema；Core 按领域拆 handler；renderer 提取已有状态与视图，CSS 按 feature 原序拆分，不建立第二套状态。

| 能力          | 候选与许可证                                                             | 选择与适配成本                                                                                                                    |
| ------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 保存并发/协议 | 已有 Zod 3.25.76（MIT）与 Node crypto/fs；另建版本数据库                 | 采用现有字节 SHA-256、共享 schema 与 Core 路径写队列。无数据库迁移；明确冲突后可比较、重新载入或按新读版本覆盖                    |
| 会话隔离      | 已有 pi 1.4.0（MIT）单 runtime；多 runtime/状态库                        | 采用单 runtime 串行切换、忙时拒绝第二 turn，事件带 conversationId/turnId/toolCallId。旧 UI 异步结果按代号隔离                     |
| 进程终止      | Node 进程组 + Windows taskkill（已有 supervisor 机制）；tree-kill（MIT） | 复用系统进程树能力；拒绝只杀根的 fallback，终止失败保留身份并重试、可取消，不引入执行器或原生模块                                 |
| Git 归属      | 已有 simple-git 4.0.2（MIT）的临时 index/限定路径提交；全量 add          | 仅对成功操作前后可证明属于本次的改动自动提交；已有脏文件和暂存内容不自动纳入，无法归属时留给现有 Git diff/stage/commit 审阅       |
| 本地排除      | Git info/exclude；修改项目 .gitignore                                    | 使用 Git 提供的工作树本地 exclude 路径；非仓库不改 .gitignore，错误明确报告，拒绝链接和越界目标                                   |
| TS/React lint | ESLint + typescript-eslint + React Hooks（MIT）；Biome（MIT/Apache-2.0） | 采用 ESLint 官方 flat config，类型检查独立；Biome 会重复现有 Prettier 且 Hooks 生态不匹配                                         |
| CSS lint      | Stylelint（MIT）；手写 regex 检查                                        | 采用 Stylelint 的 CSS 解析与现成颜色/important/选择器规则，token 文件拥有色值，避免正则误判                                       |
| 桌面回归      | Playwright（Apache-2.0）；Spectron（MIT，已弃用）/Storybook（MIT）       | 采用 Playwright Electron 入口与组件状态页；Storybook 非必要，避免另一套开发服务器。截图仅留本地/CI artifact，源码保留稳定验收入口 |

官方核验入口：[ESLint flat config](https://eslint.org/docs/latest/use/configure/configuration-files)、[Stylelint rules](https://stylelint.io/user-guide/rules/)、[Electron 自动测试](https://www.electronjs.org/docs/latest/tutorial/automated-testing)。新增工具只在开发期使用，精确版本、许可与锁文件在依赖台账登记；不引入客户端生产依赖。维护情况以官方 release/registry 实际返回为准，不将未知状态写为“已验证”。

## 维护、适配与固定版本核对

2026-11-12 核对官方 release/changelog 和 issue 列表：

| 选择                                | 最近发布与维护依据                                                                                                                                                                 | issue 活跃度快照                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| ESLint 10.14.0 / MIT                | [2026-10-30 release](https://github.com/eslint/eslint/releases/tag/v10.14.0)，使用官方 flat config                                                                                 | [issue 列表](https://github.com/eslint/eslint/issues) 有 11-11 新问题、11-10 已接受缺陷及回复                                    |
| typescript-eslint 8.72.2 / MIT      | [2026-11-09 release](https://github.com/typescript-eslint/typescript-eslint/releases/tag/v8.72.2)，peer 明确支持 ESLint 10、TS 5.9                                                 | [issue 列表](https://github.com/typescript-eslint/typescript-eslint/issues) 有 11-10 问题与 team assigned、11-09 accepting prs   |
| React Hooks 7.1.1 / MIT             | [官方 changelog](https://github.com/react/react/blob/main/packages/eslint-plugin-react-hooks/CHANGELOG.md) 记录 7.1.0 支持 ESLint 10、7.1.1 兼容修复；该页未列发布日期，不编造日期 | 上述修复关联上游 PR #36307；React 总 issue 数不作为此插件响应速度                                                                |
| Stylelint 18.0.0 / MIT              | [2026-11-03 release](https://github.com/stylelint/stylelint/releases/tag/18.0.0)，CSS parser 与官方规则可复用                                                                      | [issue 列表](https://github.com/stylelint/stylelint/issues) 的可读缓存较旧（10-20 发布讨论、10-14 性能问题）；不将缓存当实时 SLA |
| Playwright Test 1.65.0 / Apache-2.0 | [2026-11-05 release](https://github.com/microsoft/playwright/releases/tag/v1.65.0)，复用现有 Electron 驱动，删除依赖 QA 主机预装包的前提                                           | [issue 列表](https://github.com/microsoft/playwright/issues) 有 11-11 API review、已分类缺陷与回复                               |

维护活跃是依据近期发布/处理的判断，不承诺上游修复时限。开发依赖使用精确版本并锁定传递解析；新增闭包许可见[依赖台账](../project/dependencies.md)。Stylelint 18 要求 Node `^22.22.2 || ^24.15.0 || >=26.0.0`，根 engines 与文档同步，当前 Node 24.18.1 已运行。所有新包只供构建/测试，不增加 Electron 原生模块、客户端 SDK 或需要打包 spike 的二进制运行时。

单 runtime 使用现有 Promise 队列，规模不足以引入 p-queue（MIT）等第二调度层；文件版本复用 Node 原始字节哈希与已有原子写，不另引 SQLite 版本库；CSS ownership 仅补一个 Stylelint 插件，不用手写解析器。系统进程组/taskkill 复用现有 supervisor 路线；tree-kill 不能改善 Windows 的同一 taskkill 权限失败，新增包收益不足。Git 使用已有 simple-git 与 Git native 限定路径提交；没有另建 Git 实现。

进程树验收覆盖 Windows/Linux/macOS，因此 CI 使用固定 `windows-2022`、`ubuntu-24.04`、`macos-15-intel` 标签运行同一套回归，Linux UI 经 xvfb，其余直接运行 Electron。macOS 标签按 [GitHub 官方 runner 列表](https://github.com/actions/runner-images#available-images)核对；不使用 latest 漂移标签。所有者授权后已完成三平台实际运行，`1cba27d` 的 [PR CI](https://github.com/ha5ha/research-workbench/actions/runs/43187737368)全部通过；首次失败与修复保留在 validation，不由本地结果推导远端通过。

根 AGENTS 只保留入口与硬边界，原安全/审批/依赖/DoD 逐条迁到强制贡献规范；Core/renderer/contracts/ui 的局部入口补充各自规则。当前 architecture 与 UI 合同明确唯一当期权威，历史方案降为背景；这是审计 P3-02 授权范围内的入口整理，没有取消原规范。

## 验证、恢复与退出

先建立陈旧保存、未知工具、会话晚到/并发、路径 sibling/link/traversal、进程孙辈、无关 Git 改动/失败命令和非 Git/只读排除回归。运行 typecheck、architecture/code/styles lint、差异格式、单元/集成测试、build:app 与三尺寸真实 Electron。CI 精确固定 Node/pnpm/actions，frozen install；无模型/SSH 凭据。用故意错误 fixture 验证门禁失败。

安全拒绝与失败保留原文件/缓冲区、会话、用户 index、日志和审计依据。没有科研 schema 迁移；回退需整体同步 contracts/Core/preload/renderer，关闭当前交互式命令并核对受管 Job，不删除证据。开发工具可独立移除；Core handler/renderer hooks 仍可直接使用现有服务。远端推送、PR 与保护规则须遵守仓库的明确授权要求；本地门禁通过不冒充远端已生效。

11-12 最新实际回归：218 项本地测试通过、1 项真实 provider opt-in 跳过；三项 lint/typecheck/build/许可和标准 Electron 驱动通过，完整证据统一到 [validation](../project/validation.md#audit-2026-11-12)。截图发现 IDE 高 specificity 覆盖既有 ≤900px 单列规则，已按 UI 合同恢复；保存冲突复用既有控件和 tokens，以可读错误、版本对比、重载/明确覆盖和可见焦点验收。Core EOF/桌面退出等待普通命令树清理，而受管 Job 独立继续并可恢复。最新系统 ShellExecute 的两个真实 45 秒 Job 生产桌面恢复通过；三平台 CI 均实际通过，故障验证 PR 因 TS2322 三项失败且合并被阻断。main 的 strict/admin 必需检查绑定 GitHub Actions app 15368，修复 PR 待所有者审阅，未自动合并或发布。
