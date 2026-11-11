# apps/desktop

Electron Main + sandboxed preload + React renderer。当前版本与验证状态见[根说明](../../README.md)和[1.0 门槛](../../docs/project/1.0-release-gates.md)。

- Main 负责窗口、CSP、导航拦截、单实例、IPC 白名单、CoreBridge、safeStorage 和 SSH 凭据 vault。
- preload 暴露限定的 `window.rw` 接口，不暴露 Node 或任意 IPC。跨进程 DTO 来自 contracts。
- Renderer 默认项目导航与大对话，研究罗盘和实验记录为辅助入口，项目详情按需打开；代码工作面独立。
- Agent 生成任务书/冻结方案，输入区上方提供统一审阅入口；右侧 dialog 展示范围与冻结文本内容，只保留一次“批准并运行”。已删除旧手工运行创建和重复确认流程。
- Claim 确认与 Decision 来自人工动作，UI 无秘密/直接数据库访问；错误、空态、拒绝与 unknown 保留。
- 原生 SSH 在设置页保存密码、无密码读取指纹、人工核对确认；Renderer 不接收已保存密码。

视觉参考固定 OpenResearch，中性 token、原有字体/品牌与响应式边界，见 [ADR-0009](../../docs/adr/0009-conversation-first-workspace.md)和[截图基线](../../design/implementation/conversation-first-20261111/README.md)。第三方归属见根 THIRD_PARTY_NOTICES。

```powershell
pnpm dev
pnpm build:app
pnpm package
```

便携包生成到根 `release`。构建先收集实际分发闭包与完整许可证/NOTICE，并校验哈希。Windows 优先；macOS/Linux、签名和自动更新未在本版交付。现场 UI、真实 provider、SSH、退出恢复和实际 EXE 分别验证，不能以源码 build 代替。
