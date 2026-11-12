# Contracts

MUST 遵守根入口与完整贡献规则。只放共享 schema、推导类型和纯协议校验。

- NEVER 依赖 Node/Electron/pi/SQLite/业务服务。
- MUST 以 Zod schema 推导跨进程 DTO；新增 RPC 同时登记 params/result、事件鉴别联合与暴露边界。
- MUST 测试 malformed params/result、未知事件及流事件身份。
