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
   - LSP 使用 `@codemirror/lsp-client`，不引入 Monaco 的 worker/资源打包复杂度。
2. **diff 使用 `@codemirror/merge`**（MIT），不手写 diff 算法。
   - 实验记录存 before/after 文本与 unified diff。
   - “相关代码”默认 MergeView 并排，保留 unified 切换；Git 面板当前 unified。
3. **Git 使用 `simple-git`**（MIT），要求系统 Git；Git 不可用时 UI 明确降级。
   - 采用 VS Code SCM 的 working tree/index 两组模型。
   - 提供 status、diff、stage、unstage、commit、log。
   - commit 必须审批；默认不自动 commit；自动 commit 是显式设置，开启后 Agent/终端成功后提交。
   - Git 可执行文件路径可在设置中配置，并做 `git --version` 验证；dugite 仍作为后续分发选项。
4. **实验改动按实验窗口快照**，与项目 Git 分离。
   - `ExperimentService` 在实验开始/结束时快照工作区，记录 files/diff/增删行和结果目录 artifact。
   - 任务书/逐种子/指标/artifact 存 SQLite；IDE Git 面板展示项目全量改动。
   - Agent 通过 `create_experiment`/`finish_experiment` 决定是否创建/归档实验记录。
5. **Agent 代码规范**以项目 `AGENTS.md` 为硬约束，内置默认模板；写文件、命令、commit 均需审批。
6. **LSP 使用 `@codemirror/lsp-client` + 内置 `typescript-language-server`**。
   - Core 拉起 TS language server，通过 loopback WebSocket 桥接；诊断/补全/hover/跳转。
   - 包内 `resources/lsp` 携带 server 与 TypeScript；Python 等语言后续扩展。
7. **终端**当前为轻量命令执行；大项目/交互式终端后续使用 xterm.js + node-pty。
8. **文件树**当前自绘、支持目录折叠；大项目后评估 react-arborist。

## 后果

正面：

- 编辑器/diff/Git 底层由成熟开源承担。
- IDE 与对话实验记录职责清晰。
- Git 可选，不阻塞非 Git 项目。
- Agent 改动可审计、可审批、可归档。

代价：

- 渲染 bundle 增大（CodeMirror + LSP client）；打包体积增加约 23 MB（TypeScript language server）。
- simple-git 依赖用户环境 Git；分发 Git 需 dugite。
- LSP 当前仅 TypeScript/JavaScript；Python 等语言后续接入。
- Git 面板仍是 unified diff；行级评论/审阅待补。

## 参考

- VS Code SCM API: https://code.visualstudio.com/api/extension-guides/scm-provider
- Positron Layout: https://positron.posit.co/layout.html
- CodeMirror Merge: https://codemirror.net/docs/ref/#merge
- simple-git: https://github.com/steveukx/git-js
- dugite: https://github.com/desktop/dugite
- Cline: https://github.com/cline/cline
- Aider repo map: https://aider.chat/docs/repomap.html
- xterm.js: https://github.com/xtermjs/xterm.js
- CodeMirror LSP client: https://codemirror.net/docs/ref/#lsp-client
- TypeScript language server: https://github.com/typescript-language-server/typescript-language-server
- pi-ai custom providers: https://github.com/earendil-works/pi/tree/main/packages/ai
- OpenAI Chat Completions: https://platform.openai.com/docs/api-reference/chat
