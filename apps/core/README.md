# apps/core

本地 Core 服务，唯一持有数据库、Agent 会话、运行管理器和执行器的进程。

- JSON-RPC server（stdio / MessagePort）
- pi SDK 适配与上下文装配
- ToolGateway、审批、工作区边界
- 科研服务、运行台账、产物索引
- SQLite / migrations

禁止：把科研对象定义进 pi 类型；让 Renderer 直连数据库；未经 ToolGateway 执行副作用。
