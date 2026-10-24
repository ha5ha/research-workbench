# OpenAI 兼容 Provider 配置调研

日期：2026-10-24

## 目标

让 Agent 不只绑定 DeepSeek 内置 provider，而是接受任意标准 OpenAI `/v1/chat/completions` 端点，同时保持工具调用、流式输出和会话不分裂。

## 采用的方案

复用 `@earendil-works/pi-ai` 的 `createProvider()` + `openAICompletionsApi()`：

```ts
const provider = createProvider({
  id: "openai-compatible",
  name: "OpenAI Compatible",
  baseUrl,
  auth: {
    apiKey: {
      name: "OpenAI-compatible API key",
      resolve: async () => ({ auth: apiKey ? { apiKey } : {} })
    }
  },
  models: [model],
  api: openAICompletionsApi()
});
modelRuntime.registerNativeProvider(provider);
```

模型使用 `api: "openai-completions"`，由 pi-ai 负责：

- Chat Completions 流式解析
- tool call 编码/解码
- usage 统计
- 自定义 base URL
- 认证注入

这样可以兼容 DeepSeek、OpenAI、OpenRouter、Ollama、vLLM、SGLang 等；本地无 Key 端点允许空 Key。

## 配置字段

| 字段 | 说明 |
| --- | --- |
| `provider` | `deepseek` 或 `openai-compatible` |
| `baseUrl` | 例如 `https://api.openai.com/v1`、`http://localhost:11434/v1` |
| `model` | 端点实际模型 ID |
| `apiKey` | 可选；本机 `safeStorage` 加密保存 |

## 兼容性注意

- 不是所有兼容端点都支持 `developer` role、`reasoning_effort`、`store`。本项目对自定义 Provider 默认关闭这些能力。
- 本地模型可能不支持 tool calling；此时 Agent 仍可对话，但工具能力由端点决定。
- Base URL 只接受 `http(s)`；不做任意协议。
- Key 不进入 renderer 回显，也不写入工作区。

## 测试

`tests/integration/pi-chat-openai.test.ts` 起一个本地 OpenAI SSE mock server，验证：

- `createProvider` 注册成功；
- 请求实际发往自定义 `/v1/chat/completions`；
- 流式文本正确返回；
- `result.mode === "openai"`。

## 参考

- pi-ai custom providers: https://github.com/earendil-works/pi/tree/main/packages/ai
- OpenAI Chat Completions: https://platform.openai.com/docs/api-reference/chat
- OpenRouter provider routing: https://openrouter.ai/docs/features/provider-routing
- Ollama OpenAI compatibility: https://docs.ollama.com/api/openai-compatibility
