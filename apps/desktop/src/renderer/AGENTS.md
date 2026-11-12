# Renderer

MUST 遵守根入口、UI 合同与完整贡献规则。

- NEVER 导入 Node/Electron/Core/SQLite 或直接执行副作用。
- MUST 使用 typed window.rw 与 contracts DTO；仅业务 view model 可另定义。
- MUST 由会话 store、领域 hooks 拥有状态；异步续接核对 conversation/turn/generation。
- MUST 使用 packages/ui；功能 CSS 在 styles/，保持级联与 ownership 门禁。
- MUST 运行 pnpm test:ui；三尺寸、可见焦点、错误/空/审批状态均需实际验证。
