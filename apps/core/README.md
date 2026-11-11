# apps/core

Core 是科研数据、工作区副作用、模型会话与运行管理的唯一服务边界。Renderer 通过 Main/preload 白名单和 JSON-RPC 调用，不能直连文件、Shell、SQLite 或密钥。当前实现与发布状态见[项目控制台](../../docs/project/README.md)。

| 模块                                             | 职责                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| cli / rpc / loop-rpc                             | JSONL 请求、并发审批响应、seq 事件、Core 服务装配                       |
| agent-chat / agent-tools                         | 产品工具 schema、提示、授权、上下文和通用 runtime 注入；模型不审批/确认 |
| workspace / workspace-service / permissions      | 路径真实边界、内部文件保护、原子写、Shell 权限、审计；不是 OS 沙箱      |
| research-service / experiment-store 等           | 研究树、任务书、实验记录、事实与研究路线；损坏阻止覆盖、备份与版本约束  |
| run-service / run-store / run-snapshot           | 不可变计划、人工批准、幂等、Job 核对、产物/指标、Claim/Decision/Compass |
| local-supervisor / ssh-executor / ssh2-transport | 独立本地或远端 Job、日志、预算、取消、状态与产物采集；同一协议          |
| skill-service / research-state                   | 允许工具、确定性 Skills、无内部 token 的研究状态投影                    |
| git-service / lsp-service                        | 通用代码工具，Git 与 TS/JS language server；普通 coding 无需建科研对象  |

运行意图先持久化，再提交 Job；Core/桌面退出后 Job 独立运行，重开先核对同一身份。归档从精确 succeeded Run 的核验产物派生，模型不能提交自报指标代替真实结果。方案关闭、运行状态与事件原子写；工作区持有独立 SQLite 单写者锁。

存储位于工作区 `.research`：SQLite、研究树 JSON、会话、冻结计划、Job 和 artifacts。没有第二套可独立修改的审批/运行权威状态。历史手工补录是单独记录，不冒充受管 Run。

```powershell
pnpm --filter @research-workbench/core demo
pnpm --filter @research-workbench/core dev -- --workspace <dir>
```

测试、真实模型/SSH、恢复与分发各自的范围见[测试说明](../../tests/README.md)；模块关系、迁移和恢复规则见[架构地图](../../docs/project/architecture.md)。此处不重复维护完成度清单。
