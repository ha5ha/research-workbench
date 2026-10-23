# packages/coding

代码工作面领域能力：文件索引、patch、diff、Git 状态、测试结果和代码上下文。

- 文件树/符号索引/忽略规则。
- 补丁生成、冲突检测、应用与回滚。
- Git status/diff、change review、workspace snapshot。
- 终端/测试输出摘要与 artifact 引用。
- 为 Agent 提供受控代码上下文，不直接执行 Shell。

Shell/PTY 执行仍由 `agent-runtime` 的 ToolGateway 与 `executors` 负责。
