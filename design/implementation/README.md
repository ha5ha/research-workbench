# 实现截图

这些截图来自真实 Electron + Core 运行，不是设计稿。

机器绑定的临时操作驱动、失败诊断和意外会话截图仅在本机保留，不随 Git 分发。连续回归保留各轮报告，重复截图以最终轮为 Git 基线，过程截图在本机留存。正式截图、脱敏报告和验收结论按目录记录；真实凭据、原始私有科研数据与运行数据库不入库。

最新表面与文案基线见 [surface-colors-20261111](surface-colors-20261111/README.md)：普通选中态用灰阶，设置/科研减少内框，编辑器共用 token 主题；删除重复脚注和协议旁注，保留语义颜色与焦点。含修改前后、三尺寸与200%截图和独立评审记录。只更新源码与开发构建，未重打便携包。

最新基础控件基线见 [shared-controls-20261111](shared-controls-20261111/README.md)：统一共享控件、SVG箭头、键盘与窄屏设置，含修改前/后三尺寸与200%真实截图、独立评审。仅源码增量，未重打便携包。

此前聊天交互增量见 [openresearch-reuse-20261111](openresearch-reuse-20261111/README.md)：直接适配上游滚动与输入法保护，21 项真实桌面检查、三尺寸截图及科研闭环回归；无视觉 token 变更，未重打便携包。

当前对话主路径基线见 [conversation-first-20261111](conversation-first-20261111/README.md)，包含三尺寸连续三轮、计划批准/撤回/替代、冻结文本预览、证据/决策、错误恢复、键盘焦点和实际字体。真实模型与原生 SSH 分别见本目录对应现场记录。2026-11-10 的 [managed-loop](managed-loop-20261110/README.md) 和下方 Phase 截图保留为历史，不代表当前界面。

- `phase0-desktop-1440.png`：桌面端，Core 已连接，data-profile 运行完成并生成 artifact。
- `phase0-pi-1440.png`：pi faux-model 工具循环；展示工具调用、被拦截工具、session 与 artifact。
- `phase0-real-chat-1440.png`：真实 DeepSeek 流式对话；自动滚到底部并渲染 Markdown 粗体。
- `phase0-approval-1440.png`：`record_note` 工具执行前的审批弹窗；批准后才写入 artifact。
- `phase1-sidebar-1440.png`：真实研究侧栏；课题 → 研究路线 → 任务、聚合状态；输入框工具栏含附件/权限/模型。
- `phase1-topic-panel-1440.png`：课题下拉；一句话描述、文献库、编辑课题与新建课题。
- `phase1-ide-pure-1440.png`：独立 IDE 视图；42px 紧凑工具栏，返回/刷新在左侧，终端可开合，文件树与编辑器独立滚动。
- `phase1-settings-1440.png`：Agent 设置左侧分栏；OpenAI 协议、模型、Key、工作区、Git、关于；Anthropic 占位。
- `phase1-permissions-1440.png`：权限设置；写入/终端/Git/笔记可设询问、允许或拒绝，由 Core 强制执行。
- `phase1-lsp-1440.png`：TypeScript LSP 已连接，错误诊断下划线。
- `phase1-split-diff-1440.png`：实验详情的并排 diff；Before/After 双栏，CodeMirror MergeView。
- `phase1-experiment-records-1440.png`：对话下实验记录列表 + 详情；真实任务书、指标与状态。
- `phase1-experiment-plan-1440.png`：实验详情“任务书”Tab；目标、假设、设计、指标与种子。
- `phase0-mobile-390.png`：390px 响应式，侧栏折叠为抽屉入口，无横向溢出。

限制：LSP 当前覆盖 TypeScript/JavaScript；Git 面板仍是 unified diff；打包版使用默认 Electron 图标、未签名。
