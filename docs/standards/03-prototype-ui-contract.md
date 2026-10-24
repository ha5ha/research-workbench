# 03 · 原型 UI 合同

## 1. 合同地位

现有 HTML 原型是**视觉与交互合同**，不是灵感参考。

- 设计源文件（本机）：`D:\wangxing_private\科研\autoreascher\ttt_comparison_structure\docs\product\prototype\index.html`
- 当前基线：原型 v8 设计
- 本仓库截图：[design/reference/screens](../../design/reference/screens)
- 生产实现：React + TypeScript 重新实现；**不得**复制原型内联脚本或演示数据。

任何视觉偏差都属于需求变更，必须显式批准并更新规范与截图。

## 2. 设计 token（必须一致）

### 字体

```css
--dsh-font-family-text-default:
  Inter, -apple-system, BlinkMacSystemFont, "Segoe UI",
  "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
  "Helvetica Neue", Helvetica, Arial, sans-serif;

--dsh-font-family-code-default:
  "Cascadia Code", "SF Mono", "JetBrains Mono", Consolas,
  "Microsoft YaHei", monospace;
```

- **禁止 WebFont**、禁止 `@font-face`、禁止加载 16MB 字体包。
- **禁止**覆盖 `-webkit-font-smoothing`，使用系统 ClearType。
- 字重只使用 **400 / 500 / 600**；禁止合成 700+。
- 正文字号 **14px / 24px**；元数据主要 **13px**；任何界面文本**不得低于 12px**。
- 数字使用 tabular numerals；代码/路径/命令使用等宽字体。

### 颜色

```css
--bg: #ffffff;
--bg-sidebar: #f9fafb;
--bg-subtle: #f7f8f9;
--bg-hover: #f2f3f5;
--bg-active: #eceef0;
--bg-blue-soft: #edf3fe;

--text: #0f1115;
--text-2: #61666b;
--text-3: #6b7076;
--text-4: #8a8f95;

--border: #e0e0e0;
--border-subtle: #ededef;
--border-faint: #f2f3f4;

--blue: #4176e6;
--link: #2f63d8;
--blue-hover: #2f63d8;
--green: #237a41;
--amber: #965910;
--red: #b42318;
```

禁止在组件中散落色值；一律使用 token。

### 圆角、阴影、动效

```css
--radius-xs: 5px;
--radius-sm: 8px;
--radius-md: 10px;
--radius-lg: 14px;
--radius-panel: 24px;

--shadow-menu: 0 8px 24px rgba(15,17,21,.08), 0 2px 6px rgba(15,17,21,.04);
--shadow-dialog: 0 24px 64px rgba(15,17,21,.18), 0 4px 12px rgba(15,17,21,.06);
--ease: cubic-bezier(.2,0,0,1);
```

边框默认 1px 实线，不使用 0.5px 模糊线。

### 布局

```css
--sidebar-width: 272px;
--inspector-width: 300px;
--chat-width: 720px;
--composer-width: 760px;
```

- 桌面三栏：`272px | minmax(0,1fr) | 300px`。
- 对话内容最大宽度 720px；输入区最大宽度 760px。
- `max-width: 1279px`：右侧检查器改为 overlay。
- `max-width: 900px`：左侧栏改为 rail/抽屉；对话内边距收窄。
- `max-width: 600px`：长字段/记录详情改单列。

## 3. 必须存在的页面结构

顶部 Tab 固定为：

```text
对话 | 状态 | 实验记录 | 代码
```

- 右侧：研究状态检查器（进展 / 文件 / 事实）。
- 左侧：项目切换、课题下拉（描述/文献库）、研究路线与任务、聚合状态、设置。
- 中央：默认对话；可切换状态/实验记录/代码。
- 输入框：附件、权限、模型三个工具入口，以及发送。
- 实验记录：master-detail。
  - 列表：状态、运行 ID/名称、任务书标识、指标、最近检查。
  - 详情：概览 / 逐种子 / 文件 / 任务书。
  - 定位对话、任务书预览独立。
  - 对比是记录内部的局部视图，不是顶级 Tab。
- 所有运行记录可追到任务书、数据、文件和对应对话。

### 3.1 代码工作面

原型里的“代码”目前是只读预览，生产实现必须在同一视觉语言内扩展为真实代码工作面，不能另起一套 IDE 皮肤。

最小组成：

- 文件树（含搜索、忽略规则、变更标记）。
- 代码查看与编辑；默认仍强调 review，不强制全屏 IDE。
- Agent 变更 diff：逐文件、逐 hunk 审阅，支持接受/拒绝/回滚。
- 终端抽屉：PTY、运行/停止、完整日志入口。
- 测试状态与输出摘要。
- Git status/diff；首版不做完整 Git 客户端。
- 从对话中的文件变更卡跳转到对应文件/diff。

布局：

- 顶层仍是 `代码` Tab，不新增顶级“IDE”概念。
- 文件树可在代码面板内左侧；终端用底部抽屉，默认不挤占代码阅读。
- 移动端允许降级为只读查看/diff；不承诺手机端编辑体验。
- 所有新增控件沿用现有按钮、标签、边框、字号和间距 token。

### 3.2 研究路线与 Research Skills

科研层的差异化必须落在原型已有结构里，不新增与原型冲突的顶级视觉概念。

- **状态 Tab** 扩展为研究路线阅读入口：问题树、决策记录、证据/反证矩阵、未决项、唯一下一步。
- **输入框 `/`** 唤起 Research Skills；卡片说明输入、预期 artifact、是否产生候选结论、需要哪些审批。
- Skill 运行显示为工具事件/artifact，不伪装成普通聊天消息。
- 候选观察/结论、待审、已确认、争议、已更正必须有不同文本标签和状态，不只靠颜色。
- 从结论可以下钻：claim → analysis → artifact → run → 代码 revision → 原始数据。
- 实验记录仍是 run 归档；研究路线是“为什么/做到哪/还缺什么”，两者不混。
- 不新增独立“Skills 市场”或复杂图谱 Tab；首版用列表/矩阵/时间线。

## 4. 交互与可访问性

- 原生 button/输入/菜单语义；Radix 只用于行为。
- 所有交互有可见焦点；Esc 关闭弹窗；Tab 顺序合理。
- 状态变化必须有文本/标签，不只靠颜色。
- 空白、错误、失败、未知状态必须设计，不允许只做成功态。
- 触控目标不小于 32×32；移动端主要操作不小于 40px。
- 支持 `prefers-reduced-motion`。
- 关键表格在 390px 下不得横向溢出；必要时隐藏次要列，而不是缩小字号。

## 5. 组件与依赖限制

- **禁止** Ant Design、MUI、Chakra、Tailwind 默认主题等覆盖性样式。
- 允许 Radix Primitives、无样式 headless 行为库。
- 允许 CodeMirror/Shiki 负责代码，不允许其默认主题覆盖产品 token。
- 图标从原型提取为统一 registry；禁止混用多套图标库。
- 组件放 `packages/ui`；业务页面不得复制一套私有按钮/表格样式。
- 组件必须同时支持空、加载、错误、禁用状态。

## 6. 视觉验收

每个合并到 `main` 的 UI 改动必须提供：

- 1440×900：对话、状态、实验记录（列表 + 四个详情 tab）、代码、设置、审批弹窗。
- 1024×768：右侧检查器 overlay、窄桌面。
- 390×844：侧栏抽屉、记录列表/详情、输入区。

自动检查：

- `document.documentElement.scrollWidth === innerWidth`；
- 无 <12px 的界面文本（图表/纯装饰除外）；
- 无 700+ 字重；
- 正文对比度 ≥ 4.5:1；
- 长标题、长路径、长日志、空数据、错误状态；
- 截图与基线对比，不允许“整体看起来差不多”。

## 6.1 可折叠侧栏与代码专注

仓库所有者已明确要求代码区不能被左右两栏长期挤压，因此增加以下受控偏差：

- ≥1280px：左侧研究导航与右侧研究状态都必须可独立折叠。
- 折叠后保留贴边展开把手，不丢失导航入口。
- IDE 是独立全窗口视图，不套用研究侧栏、检查器或对话 Tab；顶部只保留紧凑工具栏，返回/刷新在左。
- 文件树与编辑器是两个独立滚动容器；终端是底部可开合面板，关闭后编辑器占用释放的空间。
- 设置入口固定在左下角；打开 Agent 设置后是左侧分栏宽面板，模型/权限/工作区/Git/关于分开，不堆在一个长页面。
- 模型只列 OpenAI 协议与 Anthropic 占位，不再单独列 DeepSeek Provider；当前版本只启用 OpenAI Chat Completions。
- 输入框工具栏必须包含附件、权限、模型；附件选中后显示 chip，权限和模型用弹出面板，不能跳回设置页才能操作。
- 研究侧栏顺序固定：项目切换 → 课题下拉 → 新对话 → 研究路径 → 左下角 Agent 设置。
- 项目切换必须是显式下拉入口，显示项目名与“研究项目”，菜单提供“打开项目目录…”；不要只靠图标。
- 研究路径使用 Core 的真实课题/路线/任务数据；课题含一句话描述和文献库；新工作区必须显示空状态和“新建课题”，不得注入演示数据。
- 课题、研究路线、任务的创建表单必须有取消/关闭按钮和 Esc 关闭；不能只有输入框和提交。
- 研究路径顶部显示课题聚合状态（路线数、任务数、进行中、已完成）；路线状态由任务状态派生。
- 所有看起来可点击的元素必须有真实动作；无动作的导航项不渲染，不保留“死按钮”。
- “打开项目 IDE”必须是带文字的显式按钮（可附 Ctrl/⌘ E），不能只放一个 `</>` 图标。
- 左下角固定 Agent 设置入口，说明“模型、Key、Git 与工作目录”；不出现“本地示例/Phase 1”之类演示字样。
- 表单控件不使用浏览器默认外观：协议用卡片选择，模型用可搜索 ComboBox，权限用 Segmented，开关用 Switch；原生 select/checkbox/datalist 不进入生产界面。
- 对话标题必须显示当前模型，并可点击进入模型设置；“新建对话”必须重置 Agent 运行时并创建新会话，不能只清空 UI。
- 对话消息与 sessionFile 必须按任务持久化；重载或切回任务时必须恢复显示和 Agent 上下文。
- 权限设置必须配置四类工具：写入文件、终端命令、Git 提交、研究笔记；询问/允许/拒绝由 Core 强制执行，不能只是前端状态。
- IDE 显示 LSP 状态；当前 TypeScript/JavaScript 由内置 language server 提供诊断、补全、hover 和跳转。
- 实验“相关代码”默认并排 diff，可切换 unified；不要手写 diff 算法。
- 折叠状态持久化到本地；移动端仍使用抽屉，不因桌面折叠状态丢失入口。
- 折叠只改变布局，不改变信息层级、字号、颜色与组件形态。

## 7. 变更流程

1. 先说明要改哪个 token/组件/页面，以及为什么。
2. 视觉变更必须取得仓库所有者明确同意。
3. 更新 `packages/ui` token 与组件，不在页面局部打补丁。
4. 更新截图基线。
5. 在 ADR 或 PR 描述中记录偏差。

**默认行为：不改原型。**
