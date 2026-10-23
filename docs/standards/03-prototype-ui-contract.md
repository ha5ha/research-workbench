# 03 · 原型 UI 合同

## 1. 合同地位

现有 HTML 原型是**视觉与交互合同**，不是灵感参考。

- 设计源文件（本机）：`D:\wangxing_private\科研\autoreascher\ttt_comparison_structure\docs\product\prototype\index.html`
- 当前基线：原型 v8 设计
- 本仓库截图：[design/reference/screens](../design/reference/screens)
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
- 左侧：课题、材料、研究路径（问题/子任务）、待审核、会话。
- 中央：默认对话；可切换状态/实验记录/代码。
- 实验记录：master-detail。
  - 列表：状态、运行 ID/名称、任务书标识、指标、最近检查。
  - 详情：概览 / 逐种子 / 文件 / 任务书。
  - 定位对话、任务书预览独立。
  - 对比是记录内部的局部视图，不是顶级 Tab。
- 所有运行记录可追到任务书、数据、文件和对应对话。

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

## 7. 变更流程

1. 先说明要改哪个 token/组件/页面，以及为什么。
2. 视觉变更必须取得仓库所有者明确同意。
3. 更新 `packages/ui` token 与组件，不在页面局部打补丁。
4. 更新截图基线。
5. 在 ADR 或 PR 描述中记录偏差。

**默认行为：不改原型。**
