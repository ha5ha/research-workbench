# ADR-0015：Core 持有科研工具，pi 仅适配通用会话

- 状态：Accepted（2026-11-11，所有者要求直接收拢现行硬边界）
- 关联：ADR-0001、ADR-0007、规范 02

## 问题与约束

pi-chat 曾包含 ResearchScope/ArtifactRef、科研工具 schema、工作流提示和演示实验逻辑；旧 pi-spike 又复制了一套带科研语义的 session 装配。虽然副作用已委托 Core，内核仍认识任务书、证据与运行，违反规范 02。保留单 runtime、现有 ToolGateway/人工审批/受管运行行为；不增加依赖或兼容旧接口。

## 候选与复用决策

1. 采用现有 pi 1.4.0 的 customTools、tool_call、before_agent_start、SessionManager，通过 contracts 的通用工具定义注入：可直接复用成熟工具循环、JSON schema 校验、会话与流式事件。
2. 让 Core 直接调用 pi 内部 ToolDefinition/消息类型：迁移更短，但科研层将依赖 SDK 内部类型，拒绝。
3. 引入第二套运行时或自建工具循环：重复会话、压缩与权限适配，违反单 runtime 规则，拒绝。

选用方案 1。沿用已评估并固定的 `@earendil-works/pi-ai` / `pi-coding-agent` 1.4.0（MIT）和 TypeBox 0.34.52（MIT）；无新增许可证或传递依赖。发布与维护评估沿用 ADR-0001 和现有锁文件，本次不升级 SDK。

## 主路径

- contracts：AgentToolDefinition、JSON object schema、文本工具结果、授权结果、纯数据 demo response，不含 pi/Electron/数据库类型。
- agent-runtime：provider、会话、上下文、流事件；仅将通用 schema 适配为 SDK schema，并在宿主授权后调用注入 callback。工具名白名单来自注入数组。无科研对象或科研工具名。
- Core agent-tools：持有全部产品工具 schema、Zod 校验、提示、演示行为和审批路由。既有文件/命令/实验/证据回调仍调用原服务。
- Core AgentSpikeService：通过同一 PiChatRuntime 运行确定性受控 fixture；删除旧 runPiSpike 与 PiChatTools 接口，不保留迁移分支。

## 错误、安全与退出

未注册工具、非对象参数、无效 schema、拒绝和授权 callback 异常均阻止执行；Core 再以 Zod 与服务校验不可信输入。read-only 和 workspace-write 的既有授权规则、冻结方案摘要、人工批准/启动、候选 claim 不自动确认等边界不变。pi 默认文件/命令工具仍不在 tools 数组。

禁止默认资源发现：固定 pi 1.4.0 的 `DefaultResourceLoader.reload()` 即使禁用全部 `no*` 选项仍会调用 `DefaultPackageManager.resolve()`；后者读取设置包并自动发现 user/project 资源，缺失 npm/git 包还可能自动安装。因此主路径完全移除默认加载器，按 SDK 公开 `ResourceLoader` / `Extension` 接口提供 `HostResourceLoader`：仅内存中的系统提示和工具授权两 hook；无 `PackageManager`、磁盘 `.pi` / `.agents` 扫描、包解析/安装、技能、模板、主题、AGENTS/SYSTEM/APPEND 自动注入。非空 `extendResources` 明确拒绝，`reload` 无 IO。会话使用 `SettingsManager.inMemory(..., { projectTrusted: false })`，不读取磁盘 settings。SDK 的公开 `createExtensionRuntime` 只创建宿主 hook 所需运行时，未实现或复制动态 ExtensionAPI。

`ModelRuntime.create` 同样使用公开 `modelsPath: null` 与 `allowModelNetwork: false`：模型配置与目录缓存仅在内存中，禁止读取 agentDir/models.json 或写 models-store.json。磁盘模型配置的 apiKey/header 支持 `!shell command`，不能作为宿主以外的隐式命令入口；provider endpoint、模型和凭据必须由 Core 显式传入。

退出 SDK 时只需实现该通用契约的另一适配器；Core 的科研 schema、审批和台账无需迁移。回滚应整体恢复同一版本的契约、Core 注入和 adapter；不得以保留旧双接口回避边界。

## 验证

通用 adapter 测试覆盖任意工具注入、上下文、流式和会话恢复，以及拒绝、无效参数、未注册工具与授权异常。Core managed-plan、experiment、RPC 和 spike 测试验证生产服务行为；静态边界测试禁止科研类型/工具名回流 runtime，禁止 Core 引用 pi/TypeBox。构建后必须重新跑真实模型完整科研闭环，最终证据见 `docs/project/2026-11-11-real-agent-loop.md`。

资源回归测试在 workspace `.pi/extensions`、agentDir `extensions` 和磁盘设置指向的本地包中放置会写标记文件的已知恶意 fixture；三者均不执行，models.json 中命令 header 同样不执行且无磁盘模型缓存。磁盘 prompt/skill/context 不进入会话，正常宿主工具仍经过授权执行。资源 getter 必须为空、唯一扩展来源为 `<host:tool-policy>`，外部资源路径注入被拒绝。
