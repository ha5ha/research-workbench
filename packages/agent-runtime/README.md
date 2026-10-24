# packages/agent-runtime

pi SDK 适配与 Agent 运行时验证。

## Phase 0 已验证

- `fauxProvider` 驱动确定性模型响应，不调用网络。
- `before_agent_start` 注入 Research Workbench 系统提示。
- 自定义 `data_profile` 工具调用 `SkillService`，返回 artifact。
- `tool_call` 钩子拦截 `dangerous_echo`，证明未授权工具不会执行。
- `SessionManager.create` 生成真实 JSONL 会话文件。
- `agent.spike` RPC 在桌面端可运行，结果包含工具、被拦截工具、artifact 与 session。

测试：

```bash
pnpm test -- tests/integration/pi-spike.test.ts
```

## 尚未完成

- 真实 provider/API key 与流式 UI。
- 每轮 `context` 投影（当前验证的是 `before_agent_start` 系统提示）。
- ToolGateway 的审批等待与 UI 交互。
- 打包版 pi/Core runtime。

代码入口：`src/pi-spike.ts`。它不依赖 Core 包，工具能力由调用方注入。
