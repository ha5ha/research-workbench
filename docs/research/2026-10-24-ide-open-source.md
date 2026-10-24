# 2026-10-24 · IDE / Git 开源参考

目标：代码区不做“聊天里的文本框”，而是项目级 IDE；对话下的实验记录只聚合本次实验相关改动。

## 参考对象

### 1. VS Code Source Control

VS Code 的 SCM 模型把变更分成 **working tree** 和 **index** 两组 resource group，每个文件是 resource state；SCM 提供输入框（commit message）、quick diff、菜单和命令。

我们采用同样的信息模型：

- `staged` / `working` 两组
- 文件级 diff
- commit message 输入
- commit 前审批

参考：
- <https://code.visualstudio.com/api/extension-guides/scm-provider>
- <https://github.com/microsoft/vscode/tree/main/extensions/git>

### 2. Positron / VS Code 布局

Positron 的布局是 Activity Bar + Primary Side Bar + Editor + Panel + Secondary Side Bar，并支持布局预设和折叠。科研 IDE 需要 Editor、Terminal、Session/Plots 等不同面板共存。

我们采用：

- 左侧：文件 / Git 切换
- 中间：编辑器 / diff
- 下方：终端
- 两侧可折叠
- 对话仍保留，不改成独立 Coding Chat

参考：
- <https://positron.posit.co/layout.html>
- <https://code.visualstudio.com/api/ux-guidelines/sidebars>

### 3. CodeMirror 6 + Merge

CodeMirror 6 是模块化编辑器（MIT）；`@codemirror/merge` 提供 `MergeView`、chunk、revert control 和 unified merge view。我们已用 CodeMirror 作为 Phase 1 编辑器核心，后续 diff 从手写 `<pre>` 迁移到 `MergeView`。

参考：
- <https://codemirror.net/docs/ref/#merge>
- <https://github.com/codemirror/dev>

### 4. Git 库

- `simple-git`：Node 侧封装 Git CLI，MIT，轻量；要求系统安装 Git，适合“像 VS Code 一样配置 Git 路径”的后期方案。
- `dugite`：GitHub Desktop 使用的 Git 封装/发行版，MIT；可随应用分发 Git，但体积更大。

Phase 1 选择 `simple-git`，Git 不可用时明确降级；后续提供 Git 路径配置，必要时切换 dugite。

参考：
- <https://github.com/steveukx/git-js>
- <https://github.com/desktop/dugite>

### 5. AI 改代码交互

Cline / Aider / Continue 的共同模式：

- 先读项目/上下文
- 给计划
- 生成 diff
- 用户确认
- 应用修改
- 运行检查/测试
- 汇总改动

Research Workbench 采用同样的“提案 → diff → 审批 → 应用”流程，并额外记录实验归属。

参考：
- <https://github.com/cline/cline>
- <https://aider.chat/docs/repomap.html>
- <https://github.com/continuedev/continue>

### 6. 终端与文件树

- `xterm.js`：浏览器/Electron 终端渲染（MIT），配合 `node-pty`。
- `react-arborist`：React 虚拟化树（MIT），适合大项目文件树。

Phase 1 暂用轻量终端和自绘树；大项目规模上来后替换。

参考：
- <https://github.com/xtermjs/xterm.js>
- <https://github.com/microsoft/node-pty>
- <https://github.com/brimdata/react-arborist>

## 落到本项目

| 能力 | Phase 1 选择 | 后续 |
|---|---|---|
| 编辑器 | CodeMirror 6 | 评估 Monaco/LSP |
| diff | `@codemirror/merge`（计划） | 并排 diff、行评论 |
| Git | simple-git + 系统 Git | Git 路径配置、dugite |
| 终端 | 轻量命令面板 | xterm.js + node-pty |
| 文件树 | 自绘 + 目录折叠 | react-arborist |
| AI 改代码 | diff → 审批 → 写入 | 行级采纳/拒绝 |
| 代码规范 | AGENTS.md + 内置模板 | lint/test 门禁 |

## 关键结论

1. 编辑器、diff、Git、终端都使用成熟开源实现，不在 UI 层手搓底层算法。
2. IDE 是项目级能力；实验记录是对话内的科研聚合视图，两者不混。
3. Git 默认只生成 diff/快照，commit 由用户批准；自动 commit 是显式配置。
4. Agent 行为必须受项目 `AGENTS.md` 和代码规范约束，不能“能跑就算完成”。
