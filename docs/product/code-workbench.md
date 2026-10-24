# 代码工作面

## 定位

代码区不是独立的通用 IDE，也不是聊天里的一个代码预览 tab。

它是**当前研究节点的执行台**：

- 文件是研究的输入与实现；
- 编辑、终端命令、Agent 改动是执行；
- diff、命令输出、artifact、运行记录是证据；
- 一次代码改动应能回答：属于哪个 project / question / task，谁发起，谁批准，产出了什么。

因此，代码区必须和任务书、受管运行、artifact 归档连在一起；只把 VS Code 的界面复制进来不算完成。

## 两个独立视图

- **对话视图**：原课题/研究路径/对话/实验记录，完全保留；顶部只有 `对话 / 状态 / 实验记录`。
- **IDE 视图**：从项目行右侧 `</>` 进入，全窗口铺满，不再套研究侧栏、检查器或对话 Tab；自带“返回对话”。IDE 内有文件/Git、CodeMirror、终端。
- 对话下的 **实验记录**：保持原型列表，一行一条记录；点击进入详情。详情 Tab：概览、逐种子、文件、任务书、**相关代码**。

“文件”是产物和实验文件；“相关代码”只显示本次实验窗口内的代码新增/修改，不是项目全量 Git diff。

编辑器与 diff 的开源选型见 [ADR-0005](../adr/0005-ide-editor-diff-git.md)；当前 diff 仍是 unified 视图，并排 `MergeView` 在后续切片。

“实验记录”是对话的一部分，不是 IDE 的第二个顶层模式；IDE 只负责项目全量代码。

这里的“实验”目前以一次 Agent 对话或一次终端命令为 run 粒度；后续接入任务书/受管运行后，run 会归到具体实验与任务，并由 Agent 意图分类决定是否创建实验记录。

## Git

- Git 是 IDE 的项目级能力：working tree/index 两组状态、文件 diff、暂存/取消暂存、commit message、日志。
- 默认只生成 diff / 快照；commit 必须用户批准，不自动提交。
- 后续允许用户配置 Git 可执行文件、自动 commit 策略，行为对齐 VS Code/GitHub Desktop。
- `.research/`、`.agent/` 等应用内部记录不进入项目 Git。

## 交互原则

- 文件树、编辑器、终端是同一工作面的三个部分，不拆成互不关联的页面。
- 读文件、列目录可以自动执行；写文件、执行命令、Git commit 必须审批。
- Agent 与人类使用同一套受控工具和审批，不允许 Agent 自己批准自己。
- 路径只能在工作区内；越界直接拒绝。
- 代码区应可扩展：进入代码 Tab 收起右侧检查器，专注模式收起双栏，编辑区占满主区域。

## Agent 代码规范

Agent 改代码前必须读取项目 `AGENTS.md`；默认模板在 `packages/research-skills/templates/AGENTS.md`，规范见 `docs/standards/05-research-code-standards.md`。

硬约束：

- 固定目录布局：`src/`、`experiments/<experiment>/`、`scripts/`、`tests/`、`data/`、`results/`。
- 实验入口、配置、输出分离；不在根目录丢脚本。
- 最小 diff，复用现有模块，不随手重构。
- 改完运行 formatter / lint / typecheck / tests。
- 实验记录包含 config、seed、命令、环境、输出、artifact、失败日志。
- Agent 不能把功能代码改动伪装成实验证据。

## 当前实现（Phase 1 切片）

- 项目 IDE：全窗口、文件/Git 切换、CodeMirror、语法高亮、Ctrl/Cmd+S、保存审批、终端。
- Git：working tree/index、文件 diff、暂存/取消暂存、commit 审批、最近提交。
- Agent 实验工具：`create_experiment` 创建任务书 + `RUN-xxx` 记录；`finish_experiment` 回填指标、种子、结论与代码 diff。
- SQLite：`.research/workbench.db` 持久化实验、任务书、指标、结论、代码文件与 artifact。
- 对话实验记录：列表一行一条；详情任务书、指标、代码 diff 来自 SQLite。
- 终端命令、30s 超时、输出截断、命令审批。
- pi 工具：`list_files`、`read_file`、`create_experiment`、`finish_experiment` 自动；`write_file`、`run_command` 审批。
- 独立 IDE 视图：无研究侧栏/对话 Tab；返回对话保留原状态。
- 默认 `AGENTS.md` 随工作区初始化；系统提示要求 Agent 先读规范。

## 尚未完成

- Agent 意图分类目前依赖系统提示 + `create_experiment` 工具选择；需要真实模型回归测试与失败兜底，避免功能开发误建实验。
- 实验完成后的 `finish_experiment` 依赖 Agent 主动调用；缺少强制的“运行结束 → 归档”流程。
- 逐种子结果、artifact 自动归档、任务书编辑/审批。
- 并排 diff、行级评论、Agent 修改审阅。
- 代码搜索、符号跳转、多文件批量编辑。
- 终端流式输出、取消与历史；xterm.js/node-pty 评估。
- Git 路径配置、自动 commit、分支/历史完整 UI。
- 代码签名、图标、自动更新。

在这些完成前，代码区与实验记录是可用的 MVP，但不是最终形态。
