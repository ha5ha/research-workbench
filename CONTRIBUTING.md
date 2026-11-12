# 参与 Research Workbench

感谢愿意一起维护计算科研工具的贡献者。项目使用 [MIT](LICENSE)；方向、实现状态与候选任务见[项目控制台](docs/project/README.md)。欢迎文档、测试、科研样板、错误修复和有明确用户价值的功能贡献。

## 开始之前

先按 [AGENTS.md](AGENTS.md) 阅读工程规范、产品方案及相关 ADR，再查[功能台账](docs/project/capabilities.md)和[路线](docs/project/roadmap.md)。当前为 1.0.0 有限范围交付，验收状态见[门槛表](docs/project/1.0-release-gates.md)；对话优先与单 runtime 边界见 ADR-0009/0015。未确认的提案不自动生效。

选一个小而具体的任务，在已有讨论/issue 中说明认领范围、预期行为和验证方法；没有对应 issue 时可先提交问题说明。新依赖、数据迁移、runtime 替换和视觉变化先讨论，按规范记录决策。当前不存在的自动化或安全渠道不要假设已经可用。

研究领域知识也很重要：可贡献公平对照、统计与复现的 fixture；样板应尽量小、来源清楚、许可允许、运行成本明确，不带真实个人数据或凭据。

## 本地开发

需要符合 package.json 的 Node（当前 `^22.22.2 || ^24.15.0 || >=26.0.0`）、`pnpm@10.34.5`；CI 固定 Node 24.18.1，Git 功能还需要系统 Git。

```powershell
pnpm install --frozen-lockfile
pnpm setup:electron
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm dev
```

`setup:electron` 首次需要下载二进制；未配置可用 provider 时可用确定性离线演示，本地兼容端点可无需 key。真实模型测试需显式 opt-in，不是贡献者必须支付的检查。

```powershell
$env:RUN_REAL_AGENT = '0'
pnpm test
```

`pnpm lint` 串联架构边界、TypeScript/React Hooks ESLint 和 CSS/tokens/ownership Stylelint。`pnpm format:check` 检查本次变更，CI 使用 `BASE_REV`；需要修正格式时运行 `pnpm format:changed`，不批量重写无关历史代码。

UI 变更执行 `pnpm build:app`、`pnpm build:licenses`、`pnpm test:ui`；可设 `RW_QA_SURFACES=1` 扩展控件表面覆盖。标准驱动使用锁内 Playwright，不需要预装 QA 模块或另下载浏览器，Linux 使用 `xvfb-run -a pnpm test:ui`。真实模型、真实 SSH、便携包分别验收，见[测试说明](tests/README.md)。CI 已配置 Windows/Linux/macOS 类型、三项 lint、格式、测试、构建、许可证和 UI；远端首次运行、故意错误验证 PR 与 required checks 尚待所有者授权，见[审计复验](docs/project/validation.md#audit-2026-11-12)。

## 提交可审阅的变更

1. 分支建议 `codex/<topic>`（Agent 创建时）或清楚表达任务的名字；一个变更解决一个问题。
2. 说明用户遇到什么、改后行为是什么、影响模块和兼容性；有对应能力/任务 ID 时附上。
3. 增补能证明行为的测试，包含失败、权限拒绝、缺件/恢复等相关路径；更新台账中的状态和证据。
4. 运行 typecheck、lint、format:check 与相关测试；提交前检查 diff/status。UI 按合同提供三尺寸截图/回归；截图、逐轮报告和机器记录仅留本地，结论与复验命令归入 validation。新依赖提供 ADR、固定版本和许可证记录。
5. commit 使用 `type(scope): summary`。PR 写实际验证结果、未验证项、迁移/回滚与已知限制。

不提交 node_modules、release、日志、数据库、模型权重、个人数据、密钥或 `.env`。不要把“添加了测试”写成“测试已通过”，也不要把模拟 provider 测试写成真实模型验收。

## 审阅与维护

维护者优先检查科研价值、权限/证据完整性、依赖方向和可恢复性，再看代码组织。纯目录整理与行为变化尽量分开。跨模块或迁移变更由相关维护者审阅；目前未建立专职模块负责人名单，任务标记“待认领”时可主动参与。

发现可能泄露凭据、越界写入或破坏科研记录的问题时，公开 issue/PR 只给脱敏描述与受控测试，不附真实密钥、个人研究数据或可识别日志。专用安全报告渠道尚待所有者建立；项目不宣称已具备完整安全响应流程。

开源社区协作是当前工程目标；应用内多人协作、插件市场、多 Agent 和自动论文仍属后置产品范围。
