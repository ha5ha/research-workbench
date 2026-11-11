# packages/agent-runtime

唯一通用 pi SDK 适配器。当前使用固定 pi 1.4.0（MIT）；决策见 [ADR-0015](../../docs/adr/0015-host-owned-agent-tools.md)。

- 负责 provider/model、流式事件、JSON schema 工具适配、会话持久化和上下文注入。
- 工具定义、系统提示、授权回调、离线演示响应由宿主通过 contracts 注入；不认识实验、任务书、Run、证据或 Core 数据库。
- HostResourceLoader 只提供内存宿主 hook；没有默认扩展、技能、模板、目录规则或包的自动发现/安装。模型配置与 credential store 在内存，不解析磁盘模型配置中的命令。
- PiChatRuntime 同时服务普通对话和 Core spike；旧 PiChatTools/runPiSpike 双接口已删除。
- 文件、命令、网络和科研副作用在 Core 执行；模型只能使用明确注册并授权的工具。

入口：`src/pi-chat.ts`、`src/host-resource-loader.ts`。会话 JSONL 由 Core 指定的 agentDir 保存，不含 API key；不能当作科研系统记录。

测试包括 `pi-chat.test.ts`、`pi-chat-openai.test.ts`、`pi-chat-resources.test.ts` 和 `agent-kernel-boundary.test.ts`。真实 provider 为显式 opt-in；生产 Electron 完整闭环与限制见[模型闭环验证](../../docs/project/validation.md#research-loop)。
