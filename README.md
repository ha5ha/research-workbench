# Research Workbench

面向 CS 学生和个人研究者的计算科研 Agent。**从对话提出目标，让 Agent 读代码、准备实验，再由研究者审阅执行范围；结果、证据与决策持续留在项目中。**

当前版本：**1.0.0 本地验收完成**。真实模型、原生 SSH、冻结快照与证据闭环已通过现场验证；最终验收状态和边界见[1.0 门槛](docs/project/1.0-release-gates.md)。本轮不自动发布远端。

[项目控制台](docs/project/README.md) · [功能台账](docs/project/capabilities.md) · [架构地图](docs/project/architecture.md) · [迭代路线](docs/project/roadmap.md) · [贡献指南](CONTRIBUTING.md)

## 使用方式

1. 打开项目目录，在设置里配置模型；本地实验项目需要 Git 仓库和一次提交。
2. 在对话里描述问题，Agent 读取项目、起草任务书与冻结方案。普通聊天和改代码无需先创建研究问题。
3. 输入区上方出现审阅入口；核对目标、命令、输入、预算及冻结文件内容，再“批准并运行”。需要修改时产生新方案，旧方案保留审计并停止接受批准。
4. 在研究罗盘或实验记录查看状态、日志、指标与产物；让 Agent 分析来源，提出候选结论，再由研究者确认和记录下一步。

默认界面为左侧项目导航与大对话。项目详情、方案、研究方向编辑和记录工具按需打开。视觉与交互参考并局部直接适配固定版本的 OpenResearch；源码归属、MIT 文本见[第三方声明](THIRD_PARTY_NOTICES.md)、[ADR-0009](docs/adr/0009-conversation-first-workspace.md)和[ADR-0019](docs/adr/0019-openresearch-chat-interactions.md)。

共享控件、聊天滚动/输入法、设置和中性主题已统一，源码增量尚未重打便携包。[验证范围与复验方式](docs/project/validation.md)集中记录结果；验收截图、运行报告和临时操作记录仅留本地。

2026-11-12 审计十四项整改已完成：文件保存冲突检测、会话隔离、普通终端进程树清理、工具默认拒绝、按归属自动提交、共享 RPC 校验、领域模块/CSS 拆分与工程规则。218 项本地测试通过，Windows/Linux/macOS 远端 CI 全部通过；故障验证 PR 已证实 main 的三项必需检查阻止合并。逐项证据见[审计复验](docs/project/validation.md#audit-2026-11-12)和[修复 PR #1](https://github.com/ha5ha/research-workbench/pull/1)，等待所有者审阅合并。

## 本地开发

建议使用与 CI 一致的 Node `24.18.1`、`pnpm@10.34.5` 和系统 Git。开发支持范围 `^22.22.2 || ^24.15.0 || >=26.0.0`，由质量工具的 engines 决定。

```powershell
pnpm install --frozen-lockfile
pnpm setup:electron
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build:app
pnpm test:ui
pnpm dev
```

`lint` 分别运行架构边界、TypeScript/React ESLint 和 Stylelint；`format:check` 检查本次变更，`format:changed` 格式化变更。`test:ui` 使用锁内 Playwright 启动生产 Core/Main/preload/renderer、独立工作区和本地模型夹具，不需要真实凭据；Linux 使用 `xvfb-run -a pnpm test:ui`。截图/报告在忽略的 `.tmp/ui/`。

左下角 Agent 设置配置模型、工作目录、Git 和 SSH。支持 DeepSeek 与 OpenAI Chat Completions 兼容端点；实际保留用户指定的模型 ID 和 endpoint。API key 由 Main 使用系统 safeStorage 加密，不向 Renderer 回传；本地兼容端点可不填 key，未配置可用 provider 时使用确定性离线演示。

原生 SSH 密码连接先保存连接，再读取指纹，与可信来源核对后明确确认。密码不进入聊天、运行方案、命令参数或任务环境。原有系统 OpenSSH 密钥别名仍可使用；MFA/ProxyJump 等不在本版验收范围。

```powershell
pnpm package
```

生成 `release/ResearchWorkbench-1.0.0-x64.exe`。打包先收集实际 bundle/LSP/Electron 的精确依赖闭包、完整 LICENSE/NOTICE，并校验文件哈希；无正文、未知外部模块或禁止许可会阻止构建。详细说明见[依赖台账](docs/project/dependencies.md)。

## 架构与扩展

```text
React Renderer → preload 白名单 → Electron Main → Core JSON-RPC
                                                   ├─ 通用 pi 会话适配器
                                                   ├─ Workspace / Git / 权限与审批
                                                   ├─ 科研工具、计划、证据与研究路线
                                                   └─ Run ledger → 独立 Local / SSH Job
```

- `packages/contracts`：跨进程 DTO、schema 与运行时无关工具契约。
- `packages/agent-runtime`：provider、session、流式与通用工具适配；科研 schema 和流程由 Core 注入。
- `apps/core`：唯一持有工作区副作用、数据库、运行管理与科研服务。
- `apps/desktop`：Main 管窗口、凭据和 Core 生命周期；Renderer 只调用白名单接口。
- `packages/research-skills`：数据画像、检查点、证据台账、决策与下一步等可执行科研能力。
- `packages/ui`：设计 token、共享 SVG 图标、按钮、菜单、表单与折叠控件。

新增能力先查开源、记录 ADR、固定版本和许可，再进入一个明确边界。保留单 runtime、单写者与权威台账。数据迁移保留原记录；不以兼容 UI 或第二套可变状态延续旧流程。完整规则从 [AGENTS.md](AGENTS.md) 开始。

## 验证与后续

- [验证说明](docs/project/validation.md)：工程检查、三尺寸 UI、真实模型、Local/SSH 恢复和分发的结果与复验入口。
- [1.0 验收门槛](docs/project/1.0-release-gates.md)：最终包、测试、恢复与已知限制的统一入口。

计算结果由脚本产生；候选结论与研究者确认分开。当前验证包括确定性数值场景和真实预测表的维护重算，不证明科学泛化、长期 GPU 作业或竞品优势。尚无同任务竞品对照数据，不宣称已经超越 OpenResearch。

后续优先建设专业统计/复现 Skills、证据更正链、完整复现包与磁盘保留策略。完整 IDE、PTY/Python LSP、论文生成、多 Agent、团队产品、云平台、签名与自动更新继续后置，见[路线](docs/project/roadmap.md)。

## 远端与许可

[GitHub 公开仓库](https://github.com/ha5ha/research-workbench) · [Gitee 私有镜像](https://gitee.com/wx20030819/research-workbench)。当前 `git push` 配置会同时推送两个远端，拉取走 Gitee；贡献前核对目标，不自动推送。

项目使用 [MIT](LICENSE)。第三方代码保留各自的版权与许可，根 MIT 不替代依赖许可证。
