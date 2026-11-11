# 中性表面、配色与文案精简验收

日期：2026-11-11。范围：现有 UI 的源码与开发构建增量。**便携 EXE 尚未重打**；本轮未提交、推送或重新发布。

## 方向与改动

沿用所有者指定的 OpenResearch 方向：普通界面用中性表面、留白和轻量分隔，让研究目标、审阅动作和结果成为主要信息。保留 Workbench 品牌、系统字体、12px 下限、272/720/760/300 宽度与 1279/900 断点。

- 协议、权限、SSH 连接和设置导航的普通选中态统一为灰阶，用背景、勾号和文字表达。移除蓝色选择框、无实际成功含义的绿色“当前”和聊天卡类型彩色竖条。
- 设置概览、指标网格、空态、事实/记录编辑器、冻结文件预览和运行详情减少嵌套内框。输入、菜单、审阅对象和必要分区仍有边界；输入区删除内部两条分隔线。
- CodeEditor 和 SideBySideDiff 共用一个现有 CodeMirror theme 适配器。背景、选区、滚动条、遮罩、警告和 diff 色引用统一 token，删除旧 `--bg-blue-soft` 别名与两份硬编码 theme；没有新依赖或第二套视觉系统。
- 错误/危险、警告、运行状态、支持/反证和 diff 保留语义色及文字；键盘焦点保留可见蓝色轮廓。冻结文件内部操作改为中性文字，保留 hover 与焦点。
- 删除“真实模型会话”脚注、每条回答的协议旁注、输入区“工作区执行”、重复附件类型说明、设置重复眉题/导语与支持列表。配置所需字段和协议选项保留；仅离线响应显示“离线演示”，有附件时显示数量。
- 延用已有 120ms 控件反馈和 reduced-motion，没有新增装饰动效。Core/RPC、权限执行、科研数据与审批规则不在本轮变更范围。

规范：[UI 合同](../../../docs/standards/03-prototype-ui-contract.md)、[ADR-0021](../../../docs/adr/0021-neutral-surfaces-and-color-roles.md)。本轮从原组件和样式规则直接修改，没有追加兼容主题或覆盖层。

## 开源复用

继续使用已适配的 OpenResearch 中性主题及共享控件，固定提交 `92d6423a14b02cc6de85d3e2383dce6cb4dcb7fd`，MIT，©2026 alphaXiv。CodeMirror 使用现有锁定版本及 API，仅合并本地展示适配。

候选、许可、维护信息与退出方式沿用 [ADR-0009](../../../docs/adr/0009-conversation-first-workspace.md)、[ADR-0020](../../../docs/adr/0020-shared-openresearch-controls.md)和本轮 ADR。未引入新依赖、执行上游脚本或更换 Agent runtime；完整归属保留在根[第三方声明](../../../THIRD_PARTY_NOTICES.md)。固定 checkout 的核验不代表实时 issue 或最新发布已核验。

## 可运行验证

最终版本由主代理连续运行三轮“控件 → 聊天 → 科研闭环”。每轮使用独立 Electron 配置、一次性 Git 工作区和本地确定性 SSE provider；正常链路经过真实 Main/preload/Core。三轮报告记录的构建/源码哈希一致，且与当前文件逐件相符，见 [verification.json](verification.json)。

| 轮次 | 控件与表面 | 聊天交互 | 科研闭环 |
| --- | --- | --- | --- |
| 1 | [54 项通过](accepted-1/controls/report.json) | [21 项通过](accepted-1/chat/report.json) | [闭环与 6 项视图检查通过](accepted-1/research/report.json) |
| 2 | [54 项通过](accepted-2/controls/report.json) | [21 项通过](accepted-2/chat/report.json) | [闭环与 6 项视图检查通过](accepted-2/research/report.json) |
| 3 | [54 项通过](accepted-3/controls/report.json) | [21 项通过](accepted-3/chat/report.json) | [闭环与 6 项视图检查通过](accepted-3/research/report.json) |

控件驱动覆盖七类设置、模型/权限/项目/历史、项目详情、空实验记录、代码与 diff；检查 1440×900、1024×768、390×844 和 200% 缩放下的边界、文字下限、目标大小及可见焦点。另断言普通选中态为灰阶、实际编辑器背景/焦点正确、重复文案消失。保存后重载读回，失败保留字段；菜单键盘、IME 与异步过期结果均有检查。

历史加载/失败/重试/过期结果、分段键盘与 diff 颜色使用独立浏览器组件 fixture，不加载生产 preload/Core；真实编辑器、正常历史与设置另经过 Core。fixture 没有进入生产 bundle。41 个 Renderer/共享 UI 的自有 CSS/TS/TSX 文件扫描后，颜色字面量只在 `tokens.css` 定义；上游依赖内部的语法高亮不在此扫描范围。

科研回归保留冻结内容、缺件重试、撤回/替代、人工批准、本地样板计算、产物核验、候选结论与确认、决策、保存失败、重载和导出。所测三尺寸无页面级横向溢出或小于 12px 的界面文字。主代理实际查看最终默认页、三尺寸设置/权限、200% 菜单、代码焦点、diff、冻结文件、科研与错误截图。

其他检查：

- `pnpm typecheck`、`pnpm lint` 和开发构建通过；本轮未重跑全量 Vitest，不把历史结果作为当前新结果。
- `pnpm build:licenses` 通过：142 个精确包及 Electron 45.0.0；145 个构建输出哈希与当前文件相符，根声明分发副本逐字一致。生成目录不入库。
- 最终三轮前，`final-2/controls` 曾有一次截图等待超时，失败画面和文本保留；随后同一驱动连续三轮通过。最后又精简输入区后，重新跑了本文 `accepted-1` 至 `accepted-3`，没有复用旧构建报告。

复验入口：`scripts/verify-ui-controls.mjs`（`RW_QA_SURFACES=1`）、`scripts/verify-chat-interactions.mjs`、`scripts/verify-research-loop.mjs`。用 `RW_QA_OUTPUT` 指定证据目录；Windows Electron/DPAPI 需要正常桌面会话，不禁用系统安全。

## 独立评审与边界

完成一轮[存量视觉评审](visual-review.md)，不打分。其唯一修正项为冻结文件名残留的孤立蓝色；已在原规则修正，并由主代理检查 390px 实图与自动化灰阶断言。焦点、运行状态和 diff 的语义色按评审意见保留。

[轻量 UX 走查](ux-review/README.md)保留独立执行过程及其环境限制；主代理三轮功能回归不替代独立走查。第一次走查在审阅时遇到未由评审者操作产生的会话变化，已停止，不把它判定为产品缺陷。[隔离重试](ux-review/retry/README.md)每次核验临时项目，已完成准备实验、冻结内容审阅、本地运行、分析、候选与确认路径；另查看了 390px 罗盘与工作区设置。其观察到的产物来源仅展示运行摘要/哈希、缺少原文预览，对应已记录的 N09。本轮不扩展 Core 产物读取能力，继续保留此缺口，不能把哈希与汇总指标当作原文核验。

本轮没有复测真实 provider/SSH、科学有效性、长期运行或便携包；不能从样板通过推断上述验收。原始归档产物的受限内容预览仍在[路线 N09](../../../docs/project/roadmap.md)，本轮未交付。

## 截图索引

| 区域 | 修改前 | 最终版本 |
| --- | --- | --- |
| 默认对话与输入区 | [1440](before/controls/default-1440.png) | [1440](accepted-3/controls/default-1440.png)、[390](accepted-3/chat/empty-390.png) |
| 权限选择 | [390](before/controls/permission-390.png) | [390](accepted-3/controls/permission-390.png)、[1024 设置](accepted-3/controls/surface-settings-权限-1024.png) |
| 模型与关于 | [模型](before/controls/surface-settings-模型-1440.png)、[关于](before/controls/surface-settings-关于-1440.png) | [模型](accepted-3/controls/surface-settings-模型-1440.png)、[关于](accepted-3/controls/surface-settings-关于-1440.png) |
| 编辑与差异 | [代码](before/controls/surface-code-focused-1440.png) | [代码焦点](accepted-3/controls/surface-code-focused-1440.png)、[diff](accepted-3/controls/surface-diff-theme.png) |
| 放大与错误 | — | [200%](accepted-3/controls/controls-200pct.png)、[设置失败](accepted-3/controls/settings-error-1440.png)、[保存失败](accepted-3/research/save-error-390.png) |
| 科研与冻结内容 | [罗盘](before/research/compass-390.png)、[冻结内容](before/research/frozen-file-390.png) | [罗盘](accepted-3/research/compass-390.png)、[冻结内容](accepted-3/research/frozen-file-390.png) |

`before/` 为修改前；`preview/`、`final-*`、`verified-*` 和评审截图是过程证据，当前基线仅为 `accepted-1` 至 `accepted-3`。旧便携包保持原发布验收范围。
