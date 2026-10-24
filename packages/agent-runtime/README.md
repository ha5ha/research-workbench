# packages/agent-runtime

pi SDK 适配与 Agent 运行时验证。

## Phase 0 已验证

- `fauxProvider` 驱动确定性模型响应，不调用网络。
- 真实 DeepSeek：`DEEPSEEK_API_KEY` + `deepseek-flash`，流式返回。
- `before_agent_start` 注入 Research Workbench 系统提示。
- 自定义 `data_profile` 工具调用 `SkillService`，返回 artifact。
- `tool_call` 钩子拦截 `dangerous_echo`，证明未授权工具不会执行。
- `SessionManager.create` 生成真实 JSONL 会话文件。
- `agent.spike` / `agent.chat` RPC 在桌面端可运行。
- 真实密钥只进入内存 credential store，不写 `auth.json`。

测试：

```bash
pnpm test -- tests/integration/pi-chat.test.ts
pnpm test -- tests/integration/pi-spike.test.ts
```

真实 provider 测试需显式开启：

```powershell
$env:DEEPSEEK_API_KEY="sk-..."
$env:RUN_REAL_AGENT="1"
pnpm test -- tests/integration/pi-chat-real.test.ts
```

## 尚未完成

- 每轮 `context` 投影（当前验证的是 `before_agent_start` 系统提示）。
- ToolGateway 的审批等待与 UI 交互。
- 打包版 pi/Core runtime。

代码入口：`src/pi-spike.ts`、`src/pi-chat.ts`。它们不依赖 Core 包，工具能力由调用方注入。
