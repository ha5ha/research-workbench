# apps/core

本地 Core 服务，唯一持有工作区访问、Skill 执行与后续的科研对象/运行管理器。

## 已实现（Phase 0）

- `WorkspaceToolGateway`：工作区相对路径、realpath 越界检查、10 MiB 读取上限、artifact 哈希与写入。
- `SkillService`：加载 SKILL.md、按 `allowed-tools` 限制工具、执行 skill、校验返回 id/version。
- `RpcServer`：JSON-RPC 2.0；`system.hello`、`skills.list`、`skills.run`、`domain.observe`、`domain.actions`、`domain.apply`、`agent.spike`、`agent.chat`；事件带 `seq`。
- `AgentSpikeService`：用 pi faux provider 跑通自定义工具、系统提示、工具拦截与 session 持久化。
- `AgentChatService`：长生命周期 pi 会话；有 `DEEPSEEK_API_KEY` 时走真实 DeepSeek，否则 faux；通过 RPC 事件流式输出。
- `WorkspaceService`：工作区文件树、UTF-8 读写、终端命令；路径越界拒绝，写文件/命令经审批。
- `ExperimentService`：实验窗口前后快照工作区，生成代码文件 diff。
- `ExperimentStore`：SQLite（`.research/workbench.db`）持久化任务书、状态、指标、种子、结论与代码 diff。
- `GitService`：Git working tree/index、文件 diff、暂存、commit、log；commit 需审批，默认不自动提交。
- `cli.ts`：JSONL stdin/stdout，可直接接入 Electron/测试；支持并发请求以等待审批响应。
- `demo.ts`：临时工作区 + `data-profile` 实跑。

## 运行

```bash
pnpm --filter @research-workbench/core demo
pnpm --filter @research-workbench/core dev -- --workspace <dir>
```

## 边界

- 不实现 Electron 窗口/UI。
- 不实现真实模型/provider；Skill 当前为确定性执行。
- 不实现真实实验执行器；后续 RunManager 接入。
- 任何副作用必须经 ToolGateway；Renderer 不得直连。
