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
- `record_note` 工具通过 `tool_call` 钩子等待 Core 审批；拒绝/超时则阻止执行。
- 每轮把 `ResearchEnvironment.observe(scope)` 的 facts/actions/artifact count 投影进系统提示。

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

- 使用 `context` 事件做完整 transcript 变换（当前是每轮 `before_agent_start` 系统提示）。
- 打包版生产硬化：图标、签名、自动更新。
- 代码编辑/终端工具。

代码入口：`src/pi-spike.ts`、`src/pi-chat.ts`。它们不依赖 Core 包，工具能力由调用方注入。
