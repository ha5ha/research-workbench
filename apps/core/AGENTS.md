# Core

MUST 遵守根入口与完整贡献规则。副作用、数据库连接、模型会话、受管运行仅由 Core 服务拥有。

- MUST 在 rpc/handlers 按领域路由；RpcMethodRegistry 校验共享 params/result，未知/遗漏注册拒绝。
- MUST 为 Agent 工具登记 effect/requiredPermission；未知工具默认拒绝。
- MUST 保持单 runtime 串行切换与 turn 身份；会话只接收 Core ID。
- MUST 保存文件版本冲突、终端进程树终止、Git 改动归属与审计证据。
- MUST 复用 RunArtifactsService / RunEvidenceService；单写者和人工审批语义不可绕过。
- MUST 跑相关 unit/integration；进程树测试需实际成功终止自己创建的后代。
