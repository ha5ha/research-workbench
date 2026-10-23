# packages/agent-runtime

pi 适配层、上下文装配、工具定义和 ToolGateway 策略。

- 对 Core 暴露 `AgentRuntime` 接口，不泄漏 pi 内部类型。
- 关闭/替换可绕过权限的默认工具。
- 上下文装配与科研对象通过接口交互，不直接写库。
