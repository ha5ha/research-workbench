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

- **对话视图**：保留课题/研究路线/任务/对话/实验记录；顶部只有 `对话 / 状态 / 实验记录`。左侧栏使用“项目切换 → 课题（描述 + 文献库）→ 研究路线 → 任务”的层级，并显示课题聚合状态；项目切换和打开 IDE 都是显式动作，Agent 设置固定在左下角。输入框工具栏含附件、权限和模型。
- **IDE 视图**：从项目卡片的“打开项目 IDE”（或 Ctrl/⌘ E）进入，全窗口铺满，不再套研究侧栏、检查器或对话 Tab；自带“返回对话”。IDE 内有文件/Git、CodeMirror、命令面板。
- 对话下的 **实验记录**：保持原型列表，一行一条记录；点击进入详情。详情 Tab：概览、逐种子、文件、任务书、**相关代码**。记录带 scope，可“只看当前任务”并一键定位回对应任务的对话。

“文件”是产物和实验文件；“相关代码”只显示本次实验窗口内的代码新增/修改，不是项目全量 Git diff。

编辑器与 diff 的开源选型见 [ADR-0005](../adr/0005-ide-editor-diff-git.md)；diff 支持并排 `MergeView` 与 unified 两种视图。

“实验记录”是对话的一部分，不是 IDE 的第二个顶层模式；IDE 只负责项目全量代码。

实验记录不再按每次 Agent 对话/终端命令自动生成。Agent 只有在判断这是实验行为时调用 `create_experiment`，才创建任务书与 `RUN-xxx`；普通功能代码改动只进入 IDE/Git。

## Agent 设置

左下角设置使用左侧分栏宽面板，不是普通应用设置：

- **接口协议 / 模型**：当前接入 OpenAI Chat Completions 协议；Anthropic Messages 占位。Base URL、模型 ID、Key 在同一页，模型预设不含 DeepSeek 单独 Provider。
- **API Key**：输入 OpenAI 兼容 Key；主进程用 Electron `safeStorage` 加密后写入用户数据目录，不回显，不写入工作区/仓库。保存后 Core 重配运行时，下一条消息生效；也支持 `RW_API_KEY` / `DEEPSEEK_API_KEY` 环境变量。
- **项目工作目录**：原生目录选择器；保存后立即重启 Core 并重载窗口，不关闭应用；Agent、SQLite、Git、IDE 全部切到该目录。自定义目录不会被塞入演示 `data.csv`，已有 `AGENTS.md` 继续生效；无论默认还是自定义目录都会补齐 `.gitignore`，确保 `.research/`、`.agent/`、`uploads/` 不进入项目 Git。
- **权限**：三级访问级别，沿用成熟 Agent 的约定——级别本身就是授权，不再逐类“询问/允许/拒绝”：
  - **仅可查看**：Agent 只能读取工作区，写入与命令一律拒绝；
  - **工作区内修改**：Agent 可修改工作区内的文件，文件写入被限制在项目目录内；终端命令执行前仍需一次确认（shell 无法像文件写入那样被限制在目录内）；
  - **完全权限**：写入与命令都不再确认（文件写入仍限制在项目目录内）。

  级别由 Core 强制执行，输入框权限菜单提供同一级别的快捷入口。**人类操作不走审批**：在 IDE 里保存文件、在命令面板输入命令、提交 Git，执行动作的人本身就是授权。课题/路线/任务的编辑属于应用内部记录，不占用这个级别。
- **附件**：输入框工具栏调用原生文件选择器，复制到工作区 `uploads/`，发送时把相对路径交给 Agent；设置页“工作区”可查看并删除已上传附件。
- **Git**：Git 可执行文件路径（保存时用 `git --version` 验证）；自动 commit 开关。开启后 Agent/终端成功执行后会把工作区改动提交，默认关闭。`.research/`、`.agent/`、`uploads/` 永不进入暂存或自动提交。
- **代码规范**：AGENTS.md 状态；Git 自动 commit 和代码规范变更都需显式操作。

LSP 当前随应用分发 TypeScript language server，覆盖 TypeScript/JavaScript；Python 等语言留扩展点。

## Git

- Git 是 IDE 的项目级能力：working tree/index 两组状态、文件 diff、暂存/取消暂存、commit message、日志。
- 默认只生成 diff / 快照；commit 必须用户批准，不自动提交。
- 后续允许用户配置 Git 可执行文件、自动 commit 策略，行为对齐 VS Code/GitHub Desktop。
- `.research/`、`.agent/` 等应用内部记录不进入项目 Git。

## 交互原则

- 文件树、编辑器、命令面板是同一工作面的三个部分，不拆成互不关联的页面。
- 读文件、列目录自动执行；人类写文件、执行命令、Git commit 不再逐次审批——执行者本人就是授权方。
- Agent 的副作用由权限级别裁决：仅可查看直接拒绝，工作区内修改允许写工作区文件、命令执行前确认一次，完全权限不再确认。审批弹窗在对话视图与 IDE 视图都会出现，不因切换到 IDE 而失联。
- Agent 与人类使用同一套受控工具，Agent 不能自己批准自己，也不能抬高自己的权限级别。
- 路径只能在工作区内；越界直接拒绝。
- IDE 独立全窗口：代码树、编辑器、命令面板各自滚动；顶部 42px 工具栏，返回/刷新在左，命令面板在右可开合。离开 IDE 会保留打开的标签与未保存缓冲，关闭脏标签或返回对话都会先确认。

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

- 研究结构：`ResearchService` 持久化 `.research/research.json`；层级为课题 → 研究路线 → 任务；课题含一句话描述与文献库，新工作区为空。
- 项目名称来自真实工作目录 basename；不存在硬编码课题/任务。
- 输入框工具栏：附件（复制到 `uploads/`）、权限（三级级别快捷切换）、模型（预设即时切换）。
- 项目 IDE：全窗口、文件/Git 切换、CodeMirror、语法高亮、Ctrl/Cmd+S、保存审批、命令面板。
- Git：working tree/index、文件 diff、暂存/取消暂存、commit 审批、最近提交。
- Agent 实验工具：`create_experiment` 创建任务书 + `RUN-xxx` 记录；`finish_experiment` 回填指标、逐种子结果、artifact、结论与代码 diff。
- 实验记录带 scope（projectId / 课题 / 任务），可只显示当前任务并“定位对话”。
- 研究结构支持删除课题/路线/任务（`research.deleteTopic|deleteRoute|deleteTask`），删除前二次确认。
- 逐种子自动归档：优先使用工具参数；文件存在时自动读取 `results/seed-results.json` 或 `results/seed-metrics.csv`。
- artifact 自动归档：实验结束时收集 `results/`、`artifacts/`、`figures/`、`plots/` 等新增/修改文件。
- SQLite：`.research/workbench.db` 持久化实验、任务书、指标、逐种子结果、结论、代码文件与 artifact。
- 对话实验记录：列表一行一条；详情任务书、逐种子表、artifact、代码并排 diff 来自 SQLite。
- 命令面板：单次执行、30s 超时、输出截断、命令审批、↑/↓ 历史；不是交互式 shell。
- pi 工具：`list_files`、`read_file`、`create_experiment`、`finish_experiment` 自动；`write_file`、`run_command` 审批。
- 独立 IDE 视图：无研究侧栏/对话 Tab；42px 工具栏、文件树/编辑器独立滚动、命令面板可开合。
- 设置：左侧分栏宽面板；OpenAI Chat Completions 与 DeepSeek 原生 Provider、模型、API Key（safeStorage 加密）、项目目录热切换、Git、权限、附件清理。
- 对话：新建对话调用 `agent.reset` 重置运行时并创建新 pi session；对话按“任务 / 项目收件箱”保存在本机，重载后通过 `agent.restoreSession` 恢复上下文；模型标签显示当前模型并可点击进入设置。
- 权限：三级级别（仅可查看 / 工作区内修改 / 完全权限）由同一 Core 权限服务裁决；Agent 工具按级别放行或拒绝，工作区内修改级别下命令仍需一次确认；人类在 IDE 的保存、命令、提交不经过审批。
- LSP：TypeScript/JavaScript language server 随包分发，WebSocket 桥接；诊断、补全、hover、跳转。
- diff：CodeMirror MergeView 并排 + unified 切换。
- 默认 `AGENTS.md` 随默认工作区初始化；自定义工作目录不自动写入规范文件，已有 `AGENTS.md` 继续生效。

## 尚未完成

- Agent 意图分类目前依赖系统提示 + `create_experiment` 工具选择；需要真实模型回归测试与失败兜底，避免功能开发误建实验。
- 实验完成后的 `finish_experiment` 依赖 Agent 主动调用；逐种子结果需要 Agent 解析后回填，缺少标准结果文件自动解析。
- artifact 目前按结果目录/扩展名自动收集，缺少哈希、来源和内容索引。
- LSP 仅 TypeScript/JavaScript；Python、其它语言和 LSP 配置 UI 待接入。
- 模型列表通过 `/v1/models` 自动发现、响应头/代理/自定义 header 尚未做 UI。
- 终端流式输出、取消与历史；xterm.js/node-pty 评估。
- Git 分支/历史完整 UI、自动 commit 消息模板。
- 代码签名、图标、自动更新。

在这些完成前，代码区与实验记录是可用 MVP，但不是最终形态。
