# 实现截图

这些截图来自真实 Electron + Core + data-profile 运行，不是设计稿。

- `phase0-desktop-1440.png`：桌面端，Core 已连接，data-profile 运行完成并生成 artifact。
- `phase0-pi-1440.png`：pi faux-model 工具循环；展示工具调用、被拦截工具、session 与 artifact。
- `phase0-real-chat-1440.png`：真实 DeepSeek 流式对话；自动滚到底部并渲染 Markdown 粗体。
- `phase0-approval-1440.png`：`record_note` 工具执行前的审批弹窗；批准后才写入 artifact。
- `phase1-ide-pure-1440.png`：独立 IDE 视图；42px 紧凑工具栏，返回/刷新在左侧，终端可开合，文件树与编辑器独立滚动。
- `phase1-settings-1440.png`：Agent 设置；自定义 Segmented/ComboBox/Switch，Provider/模型、API Key、项目目录、Git 路径与自动 commit。
- `phase1-lsp-1440.png`：TypeScript LSP 已连接，错误诊断下划线。
- `phase1-split-diff-1440.png`：实验详情的并排 diff；Before/After 双栏，CodeMirror MergeView。
- `phase1-experiment-records-1440.png`：对话下实验记录列表 + 详情；真实任务书、指标与状态。
- `phase1-experiment-plan-1440.png`：实验详情“任务书”Tab；目标、假设、设计、指标与种子。
- `phase0-mobile-390.png`：390px 响应式，侧栏折叠为抽屉入口，无横向溢出。

限制：LSP 当前覆盖 TypeScript/JavaScript；Git 面板仍是 unified diff；打包版使用默认 Electron 图标、未签名。
