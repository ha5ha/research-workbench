# Phase 0 实现截图

这些截图来自真实 Electron + Core + data-profile 运行，不是设计稿。

- `phase0-desktop-1440.png`：桌面端，Core 已连接，data-profile 运行完成并生成 artifact。
- `phase0-pi-1440.png`：pi faux-model 工具循环；展示工具调用、被拦截工具、session 与 artifact。
- `phase0-real-chat-1440.png`：真实 DeepSeek 流式对话；自动滚到底部并渲染 Markdown 粗体。
- `phase0-approval-1440.png`：`record_note` 工具执行前的审批弹窗；批准后才写入 artifact。
- `phase1-ide-git-1440.png`：项目 IDE；文件树、CodeMirror、终端、Git 更改/diff/暂存/提交审批。
- `phase1-experiment-records-1440.png`：对话下“实验记录”列表 + 详情；一行一条记录，详情含概览/逐种子/文件/任务书/相关代码。
- `phase1-experiment-code-1440.png`：实验详情的“相关代码”Tab；只显示本次实验窗口内的代码 diff。
- `phase0-mobile-390.png`：390px 响应式，侧栏折叠为抽屉入口，无横向溢出。

限制：任务书/run 对象、意图分类、SQLite 归档、并排 diff 与代码搜索仍在后续；打包版使用默认 Electron 图标、未签名。
