# 测试与验证范围

普通贡献者不需要模型 key 或科研服务器。基础检查：

```powershell
pnpm typecheck
pnpm lint
$env:RUN_REAL_AGENT = '0'
pnpm test
pnpm build:app
```

`pnpm lint` 检查 AST 架构边界；格式对变更文件运行 `pnpm exec prettier --check <文件>`。Windows 超时/取消测试会终止测试自己创建的进程树，需要允许 taskkill 的隔离环境；宿主拒绝不能当通过。只读、缺件、越界、损坏和恢复回归必须验证真实副作用与磁盘内容，不能只断言状态字段。

| 层次            | 主要范围                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| unit            | 权限/路径/秘密、存储/事务、冻结文件、方案关闭、Claim/Decision、Skill、凭据 vault、CoreBridge、实际分发许可证 |
| integration     | RPC、通用 pi 宿主工具、模拟兼容模型、Agent 科研提议/归档、真实本地 supervisor、单写者、受管 Run、SSH fixture |
| 真实模型 opt-in | `RUN_REAL_AGENT=1` 的 provider 测试；独立 Electron 完整科研闭环另由现场驱动核验                              |
| 桌面与分发      | 三尺寸 UI、退出/强杀/重开、冻结内容、实际便携 EXE、许可文件与数据保留                                        |

## 现场验收驱动

这些脚本复用 QA 主机已有 Playwright，不把浏览器引入生产依赖。先构建最新 Core/Main/renderer；设置 `RW_PLAYWRIGHT_MODULE` 指向 QA 的 Playwright 包，必要时配置 `RW_GIT_BINARY`。全部异步状态等待都用 Node 侧显式 await/RPC 轮询与 deadline；不把 async 谓词返回的 Promise 真值当作通过。

| 驱动                                   | 证据与边界                                                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/verify-research-loop.mjs`     | [界面与交互验证](../docs/project/validation.md#ui)：1440×900、1024×768、390×844，正常/错误/空态、焦点、冻结预览、关闭方案与结构化记录重载                                   |
| `scripts/verify-ui-controls.mjs`       | [界面与交互验证](../docs/project/validation.md#ui)：真实Electron菜单键盘/焦点、模型/权限保存读回、组合框IME/错误恢复、三尺寸与200%截图；隔离本地fixture，不代表新便携包验收 |
| `scripts/verify-chat-interactions.mjs` | [界面与交互验证](../docs/project/validation.md#ui)：现有 Core bundle、本地受控 SSE，IME/发送/滚动保位/恢复跟随/会话/重载与三尺寸焦点；不代表新便携包验收                    |
| `scripts/verify-real-agent-loop.mjs`   | [模型闭环验证](../docs/project/validation.md#research-loop)：基线/改善/负结果三组数值计算、产物/解析复核、候选来源、QA 在人工侧点击批准/确认/决策、完整重开                 |
| `scripts/verify-native-ssh.mjs`        | [恢复验证](../docs/project/validation.md#local-ssh)：实际 bundle、原生 transport、恢复/核验；fixture 不运行远端 Python                                                      |
| `scripts/verify-real-ssh.mjs`          | [恢复验证](../docs/project/validation.md#local-ssh)：用户授权原项目已有凭据和 provenance、归档预测维护重算；不属于 CI                                                       |
| `scripts/verify-desktop-recovery.mjs`  | 本地真实桌面/Core 退出后同一 Job 继续、重开核对且不重复提交；最终状态见 1.0 门槛                                                                                            |
| `scripts/verify-portable.mjs`          | 构建后的实际便携 EXE 两次冷启动、Core/本地计算、产物与数据保留、完整许可文件逐件哈希                                                                                        |

现场报告记录版本、bundle 身份、调用结果和限制。真实模型费用、真实 SSH 与原项目输入只在明确授权的 QA 环境使用；秘密、原始私有数据、profile、Job token 和完整会话不进入仓库。使用假凭据和临时仓库进行普通回归。

最新表面/文案回归见[界面与交互验证](../docs/project/validation.md#ui)。`verify-ui-controls.mjs` 设置 `RW_QA_SURFACES=1` 额外遍历七类设置、项目详情与空记录三尺寸，检查普通选中态灰阶、真实编辑器焦点、独立组件 fixture 的 diff 色和冗余文案消失。控件驱动在一次性目录建立独立 Git 仓库，避免扫描父仓库；科研驱动使用自动分配的调试端口，评审只连接其隔离会话。

最新总结果与阻塞统一见[1.0 门槛](../docs/project/1.0-release-gates.md)。截图和逐轮报告保留在本机，仓库中的验证说明记录结论、限制和复验命令；历史结果不自动代表以后版本通过。真实模型、真实主机、服务级恢复、生产桌面和实际 EXE 的证据不能相互替代。
