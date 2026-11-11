# 受管科研闭环 · 真实 Electron 基线

日期：2026-11-10。参考 OpenResearch 的安静工作区、紧凑行与细边框；保留本产品品牌、三栏、字体和响应式，不复制素材。主动作是审阅并运行一份冻结计划。

## 当前证据

| 文件 | 内容 |
|---|---|
| [compass-1440](compass-1440.png) | 1440×900，问题/下一步/停止条件与运行列表 |
| [compass-1024](compass-1024.png) | 1024×768，窄桌面；检查器关闭状态 |
| [compass-390](compass-390.png) | 390×844，单列、移动主要按钮 ≥40px |
| [plan-review](plan-review-1440.png) | 冻结计划、命令、revision、预算、人工批准入口 |
| [evidence-decision](evidence-decision-1440.png) | 已确认来源、局限、选定结论与保存后的决策 |
| [save-error](save-error-390.png) | 存储失败可见，编辑草稿完整保留 |
| [focus](focus-390.png) | 实际键盘 Tab 导航的可见焦点 |
| [自动检查](report.json) / [连续通过记录](history.json) | 三尺寸 overflow=false、smallText=[]、wide=[]；保存读回/失败保留/运行/确认/决策/导出 |

脚本：[verify-research-loop.mjs](../../../scripts/verify-research-loop.mjs)。QA 使用独立临时 Git 仓库、用户配置与两 seed 的小型 Node 计算，真实 Main/preload/Core 链路；没有模拟生产成功数据。只在错误恢复用例中注入明确的存储失败。

运行方式：项目先 `pnpm build`，由 QA 主机提供 Playwright 安装，设置 `RW_PLAYWRIGHT_MODULE`（模块目录）、可选 `RW_GIT_BINARY` 与 `RW_QA_OUTPUT`，再 `node scripts/verify-research-loop.mjs`。本轮连续 4 次通过，最后一次包含实验记录入口跳转回归；临时目录在 `.tmp/ui-qa-*`，不会读取日常配置。没有将 Playwright 新增到生产依赖。

## 设计与评审

北极星：问题与下一步是入口，运行和证据可以逐层审阅，危险/失败状态保留文字含义。无关键图像素材，真实记录承担主信息。

动效：展开表单/运行详情淡入与 3px 位移，操作控件轻微状态过渡，运行点呼吸；`prefers-reduced-motion` 关闭这些变化。没有录屏/200% 布局验收，因此不宣称动效或所有缩放场景完整通过。

独立视觉评审 1 轮（`/root/visual_review`，按存量润色，不打分）：

- 移动主按钮约 30px → 全部研究罗盘按钮至少 40px。
- 首屏重复眉题/副标题、UUID 导出路径占空间 → 删除重复解释，路径改为按需展开，可关闭成功提示。
- 空的“引用结论”标签 → 无结论时隐藏该字段。
- 错误图没有错误可见 → 报错自动滚入可见区域并补拍。
- 证据/决策状态缺图 → 补拍完成态。

保留灰白表面、细线、单一主操作，以及 revision/命令/预算紧邻批准动作的审阅方式。未使用独立浏览器 shoot 工具的 lint（Electron 原生窗口采用项目脚本）；自动检查不等于对比度/所有旧页面已验收。

独立 UX 实际走查已结束，窗口已关闭，见 [UX 报告](ux-review/REPORT.md)。报告保留修复前观察，没有独立复测后续修改。主 Agent 已修正其发现的旧记录与 managed Run 状态割裂：列表投影最新 Run/指标并跳转真实详情；手工记录增加保存反馈。修改后实际入口回归通过。1024 检查器 overlay 打开态、200% 全页与录屏仍是剩余视觉覆盖，不能用当前关闭态截图代替。
