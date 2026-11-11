# OpenResearch 风格共享控件验收

日期：2026-11-11。范围：现有应用基础控件的源码与开发构建增量。**原 1.0 便携 EXE 尚未重打**，未提交或推送远端。

## 方向与结果

沿用所有者指定的 OpenResearch：中性表面、细边框、紧凑工具栏、清楚的选择与焦点反馈。研究者的主要任务仍是描述目标、审阅方案、查看运行与证据；公共控件减少跨页面的辨认成本。保留品牌、系统字体、272/720/760/300 布局宽度及 1279/900 断点。

`packages/ui` 现提供单一组件出口：Button、IconButton、DropdownTrigger、MenuItem、Popover、TextInput、TextArea、DisclosureSummary、Segmented、ComboBox、Switch、Icon。Renderer 旧 `Controls.tsx`、公共按钮类及模型/历史/权限菜单的重复皮肤已移除；业务组件只组装数据和 callbacks。Core/RPC、权限、数据库、运行与审批规则不进入展示包。

- 动作、下拉与折叠统一为 SVG：16px 图标、14px 指示、24px viewBox、2px 描边。删除字体字符箭头；展开方向与真实面板状态同步。
- 桌面控件至少 32px，≤900px 至少 40px；按钮文字 13px，界面文字至少 12px。欢迎起始操作保留较宽松的 padding，仍使用相同 Button。
- 历史、模型、项目使用共享菜单；权限使用非模态 dialog/radiogroup。当前模型有选择语义，长模型名省略并提供完整 title，两处模型选择器保存到同一设置。
- 菜单支持方向键、Home/End、Tab 退出、Escape 返回焦点与外围关闭；异步加载/重试移除当前项时恢复焦点。设置使用原生 modal dialog，窄屏保留分类导航与关闭入口。
- ComboBox 保留自定义输入、中文输入法与活动项语义；保存失败保留字段。权限取消恢复原草稿。历史拒绝过期请求覆盖，避免旧列表冒充成功。
- 动效为 120ms 的 hover/active、菜单淡入和箭头旋转，支持 reduced-motion。没有增加装饰动画。
- 删除输入区重复的模型/协议/“真实模型会话”脚注。模型信息继续在可操作入口展示。

规范：[UI 合同](../../../docs/standards/03-prototype-ui-contract.md)、[组件 API 与边界](../../../packages/ui/README.md)、[ADR-0020](../../../docs/adr/0020-shared-openresearch-controls.md)。

## 开源来源

| 来源 | 采用范围 | 固定版本与许可 |
| --- | --- | --- |
| alphaXiv/OpenResearch | Button/IconButton/MenuItem 的结构、变体和状态；ModelPicker 紧凑控件与外围点击生命周期；转为本项目 token CSS | `92d6423a14b02cc6de85d3e2383dce6cb4dcb7fd`，MIT，©2026 alphaXiv |
| Lucide React | 实际使用的 30 份图标节点数据，集中到一个 SVG registry | `1.23.0`，ISC + Feather 衍生 MIT；官方 tarball SHA-512、逐文件 SHA-256 固定 |

没有执行上游脚本或增加 icon runtime。完整文本见[第三方声明](../../../THIRD_PARTY_NOTICES.md)与[Lucide 许可和来源](../../../packages/ui/vendor/lucide/)。[来源审计](source-audit.json)记录 tarball、30 份文件和完整许可核验。候选取舍、传递依赖与退出策略见 ADR；固定 checkout/发布包不代表实时 issue 或最新发布已核验。

## 可运行验证

最终连续三轮按“控件 → 聊天 → 科研闭环”顺序执行。每轮使用独立 Electron 配置、一次性工作区和本地确定性模型；实际 Main/preload/Core 负责正常设置与科研链路。**三轮构建及记录的源码哈希完全一致，且与当前文件一致**，汇总见 [verification.json](verification.json)。

| 轮次 | 控件 | 聊天交互 | 科研闭环 |
| --- | --- | --- | --- |
| 1 | [25 项通过](final-1/controls/report.json) | [21 项通过](final-1/chat/report.json) | [闭环及 6 项视图检查通过](final-1/research/report.json) |
| 2 | [25 项通过](final-2/controls/report.json) | [21 项通过](final-2/chat/report.json) | [闭环及 6 项视图检查通过](final-2/research/report.json) |
| 3 | [25 项通过](final-3/controls/report.json) | [21 项通过](final-3/chat/report.json) | [闭环及 6 项视图检查通过](final-3/research/report.json) |

控件检查包括默认、hover、选中、禁用、空态、错误、保存后重读、失败保留输入、IME、长名称、菜单键盘、焦点恢复及 200% 缩放。在 1440×900、1024×768、390×844 下检查页面无横向溢出、文字不低于 12px、目标高度与菜单视口边界。主代理实际查看了最终桌面/窄屏模型、权限、设置、代码与科研截图，并查看 200% 全窗口截图。

历史加载/错误/重试/过期请求和分段键盘状态使用独立的浏览器组件 fixture，**不加载生产 preload 或 Core**；正常历史空态与保存会话另经真实 Core 验证。fixture 位于 `scripts/fixtures/control-state-harness.tsx`，没有进入生产 bundle。

科研回归覆盖方案审阅、冻结文件、缺件恢复、撤回/替代、人工批准、真实本地 fixture 脚本、产物、候选结论/确认、决策、重开与导出。新增[三尺寸直接查看运行检查](direct-run/direct-run-report.json)证明任务书“查看运行”直接展开对应详情，并核对 SHA-256 标签。此轮没有复测真实 provider/SSH。

最终三轮前曾出现 hover 检查不稳定：顺序启动窗口后指针/前台状态未建立。驱动现明确激活窗口、把指针移出目标再取得默认态，并同时断言真实 `:hover` 和颜色变化；随后三轮通过。此前失败截图保留在 `diagnostics/`，不属于最终基线。

其他检查：

- `pnpm typecheck`、`pnpm lint`、`git diff --check` 通过。
- 本轮全量 Vitest 在沙箱内为 168 通过、3 失败、1 跳过（共 172）；3 项涉及 Windows taskkill/EBUSY。以普通用户针对 local-launcher、local-supervisor-termination、managed-runs 三文件重跑，14 项全部通过，覆盖上述 3 项失败；没有把这次重跑描述成全量一次通过。真实 provider 测试跳过。
- `pnpm build:licenses` 成功：142 个精确第三方包及 Electron 45.0.0；145 个构建输出哈希与当前文件一致，分发副本的根声明逐字一致。生成目录不入库。
- frozen/offline lock-only 安装检查通过；没有在当前宿主管理的依赖树上做全新安装验收。

复验入口：`scripts/verify-ui-controls.mjs`、`scripts/verify-chat-interactions.mjs`、`scripts/verify-research-loop.mjs`。设置 `RW_QA_OUTPUT` 指定证据目录；直接查看运行分支使用 `RW_QA_DIRECT_RUN=1`。Windows Electron 需要正常桌面/DPAPI，沙箱失败不通过禁用安全设置绕过。

## 独立评审与处置

一轮[存量视觉评审](visual-review.md)，不打分；另有一次全新上下文的[真实 UX 走查](ux-review/README.md)。后续由主代理修正和回归，没有声称做过第二轮独立评审。

- 视觉评审发现重复脚注，已删除；欢迎操作高度在规范中明确为最小高度；DeepSeek 原生 provider 的旧 UI 合同与已验收 1.0 冲突，已纠正文档。
- UX 发现“查看运行”落到总览，现改为打开对应运行；确认按钮改为“确认此结论”，明确会立即变更状态；产物校验串增加 SHA-256 标签。
- **原始归档产物内容预览尚未实现**，已列[路线 N09](../../../docs/project/roadmap.md)。需要 Core 受限读取、身份/哈希/大小检查与错误验证。不能将汇总指标、哈希或本轮控件验收当作原文核验已完成。

## 截图索引

| 区域 | 修改前 | 最终基线 |
| --- | --- | --- |
| 桌面对话 | [1440](before/empty-1440.png) | [默认](final-3/controls/default-1440.png)、[模型键盘状态](final-3/controls/model-open-1440.png) |
| 窄屏对话 | [390](before/empty-390.png) | [模型](final-3/controls/model-390.png)、[权限](final-3/controls/permission-390.png) |
| 设置 | — | [1440](final-3/controls/settings-1440.png)、[390](final-3/controls/settings-390.png) |
| 缩放 | — | [200% 原生整窗](final-3/controls/controls-200pct.png) |
| 代码/科研 | — | [代码](final-3/controls/code-1440.png)、[罗盘390](final-3/research/compass-390.png)、[直接查看运行](direct-run/direct-run-1440.png) |

`before/` 保留修改前证据；`controls/`、`chat/`、`research/` 及独立评审截图保留制作过程状态，**当前实现以 final-1 至 final-3 和 direct-run 为准**。旧版便携包沿用原发布验收，不因本文更新而获得新组件。
