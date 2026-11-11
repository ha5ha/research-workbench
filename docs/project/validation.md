# 验证说明

更新：2026-11-11。这里汇总已执行的验证范围、结果和复验入口。截图、逐轮 JSON、操作过程和机器专用记录保存在本机，不进入源码仓库；本次文档清理没有重新执行模型、SSH 或桌面验收。当前完成度见[发布门槛](1.0-release-gates.md)，后续缺口见[路线](roadmap.md)。

<a id="engineering"></a>

## 工程检查

2026-11-11 源码推送前，类型检查、架构边界 lint、生产构建和全量 Vitest 已通过：40 个测试文件、171 项测试通过，1 项真实 provider 测试显式跳过。真实模型端到端另行验证，不能用跳过项证明其通过。

```powershell
pnpm typecheck
pnpm lint
$env:RUN_REAL_AGENT = '0'
pnpm test
pnpm build:app
```

格式检查针对变更文件运行 `pnpm exec prettier --check <文件>`，提交前运行 `git diff --check`。分层范围和测试环境见[测试说明](../../tests/README.md)。

<a id="ui"></a>

## 界面与交互

最新源码完成三轮连续 Electron 回归，每轮 54 项控件/表面检查、21 项聊天交互检查，以及科研闭环和 6 项视图检查。覆盖 1440×900、1024×768、390×844、200% 缩放、菜单键盘/可见焦点、中文 IME、历史滚动、设置保存读回和失败恢复；所测界面无页面级横向溢出或小于 12px 的文字。正常路径经过 Main/preload/Core，部分错误与 diff 状态使用独立组件 fixture。

先执行 `pnpm build:app`，使用 QA 环境已有 Playwright；`RW_PLAYWRIGHT_MODULE` 指向该模块。以下脚本创建隔离工作区和配置，`RW_QA_OUTPUT` 可指定本地输出目录：

```powershell
$env:RW_QA_SURFACES = '1'
node scripts/verify-ui-controls.mjs
node scripts/verify-chat-interactions.mjs
node scripts/verify-research-loop.mjs
```

截图和报告默认输出到已忽略的 `design/implementation/`。原型参考仍保留在 `design/reference/screens/`，设计约束见 [UI 合同](../standards/03-prototype-ui-contract.md)。这次源码增量尚未重打便携 EXE；原始归档产物内容预览仍待实现（N09），哈希标签不代替原文核验。自动操作和独立走查不等于真人可用性研究。

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

便携验证同样需要 QA Playwright，可用 `RW_PORTABLE_EXE` 指定新包。依赖与分发许可证流程见[依赖台账](dependencies.md)。包未签名；干净机器、跨平台、自动更新与远端 CI 待验收。CI 配置尚未推送，当前 GitHub OAuth 授权缺少 workflow scope。
