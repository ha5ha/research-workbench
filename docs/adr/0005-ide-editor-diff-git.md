# ADR-0005：IDE 编辑器、diff 与 Git 的开源选型

- 状态：Accepted（Phase 1）
- 日期：2026-10-24
- 关联：[代码工作面定位](../product/code-workbench.md)、[开源 IDE 参考](../research/2026-10-24-ide-open-source.md)、[科研代码规范](../standards/05-research-code-standards.md)

## 背景

代码区需要具备正常 IDE 的核心能力：完整项目文件树、编辑器、多标签、搜索、diff、终端、Git 改动。对话下的实验记录需要按实验聚合相关代码改动。此前用 textarea 和手写 diff，无法满足舒适读代码/改代码和维护性要求。

约束：

- Electron + React + TypeScript。
- 尽量复用开源，不手写编辑器/diff/Git 协议。
- Git 可选；默认不自动 commit。
- Agent 改代码必须受项目规范与审批约束。
- Windows 优先，后续可配置 Git 路径。

## 决策

1. **编辑器使用 CodeMirror 6**（MIT），不手写 textarea。
   - 使用 `codemirror` basic setup、语言扩展、`@codemirror/search`。
   - 文件 tabs、目录折叠、未保存标记、Ctrl/Cmd+S 由应用层实现。
   - 后续若需要 LSP/语义补全，再评估 Monaco；Phase 1 不引入 Monaco 的 worker/资源打包复杂度。
2. **diff 使用 `@codemirror/merge`**（MIT），不在 UI 手写 diff 算法。
   - 实验记录存 before/after 文本与 unified diff。
   - 后续把统一 diff 视图升级为 MergeView/side-by-side。
3. **Git 使用 `simple-git`**（MIT），要求系统 Git；Git 不可用时 UI 明确降级。
   - 采用 VS Code SCM 的 working tree/index 两组模型。
   - 提供 status、diff、stage、unstage、commit、log。
   - commit 必须审批；默认不自动 commit。自动 commit 作为显式设置，后续提供。
   - Git 路径配置与 dugite 作为后续选项。
4. **实验改动按 run 快照**，与项目 Git 分离。
   - `ExperimentService` 在 Agent run / 终端 run 前后快照工作区，记录 files/diff/增删行。
   - 对话“实验记录”Tab 只展示这些 run；IDE Git 面板展示项目全量改动。
   - 后续引入任务书/受管运行时，run 归到 experiment/task；Agent 意图分类决定是否创建实验记录。
5. **Agent 代码规范**以项目 `AGENTS.md` 为硬约束，内置默认模板；写文件、命令、commit 均需审批。
6. **终端**当前为轻量命令执行；大项目/交互式终端后续使用 xterm.js + node-pty。
7. **文件树**当前自绘、支持目录折叠；大项目后评估 react-arborist。

## 后果

正面：

- 编辑器/diff/Git 底层由成熟开源承担。
- IDE 与对话实验记录职责清晰。
- Git 可选，不阻塞非 Git 项目。
- Agent 改动可审计、可审批、可归档。

代价：

- 渲染 bundle 增大（CodeMirror）。
- simple-git 依赖用户环境 Git；分发 Git 需 dugite。
- 暂无 LSP/语义补全、并排 diff、行级评论。
- 实验与任务书/受管运行尚未打通；当前 run 是时间线记录。

## 参考

- VS Code SCM API: https://code.visualstudio.com/api/extension-guides/scm-provider
- Positron Layout: https://positron.posit.co/layout.html
- CodeMirror Merge: https://codemirror.net/docs/ref/#merge
- simple-git: https://github.com/steveukx/git-js
- dugite: https://github.com/desktop/dugite
- Cline: https://github.com/cline/cline
- Aider repo map: https://aider.chat/docs/repomap.html
- xterm.js: https://github.com/xtermjs/xterm.js
