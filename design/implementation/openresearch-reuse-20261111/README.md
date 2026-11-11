# OpenResearch 局部源码复用验收

2026-11-11。此次是已验收 1.0 之后的 renderer 源码增量，**没有重新生成或验收便携 EXE**。原 1.0 发布记录和包哈希继续作为历史证据。

## 直接复用的范围

按 [ADR-0019](../../../docs/adr/0019-openresearch-chat-interactions.md)，从 OpenResearch 固定 MIT 提交 `92d6423a14b02cc6de85d3e2383dce6cb4dcb7fd` 直接适配 ChatPanel 的底部跟随 refs、滚动处理、ResizeObserver 与 IME Enter guard。落点为现有 ChatView，替换无条件滚底逻辑；无新依赖、旧模式或第二套聊天状态。完整版权保留在根 THIRD_PARTY_NOTICES，许可收集器再次通过，142 个精确第三方包与 Electron 正文均保留。

## 实际验证

- `pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm build:licenses` 通过。
- distribution-licenses、agent-kernel-boundary、managed-plan-closure：3 个测试文件、9 个测试通过。
- `scripts/verify-chat-interactions.mjs`：真实 Electron/Main/preload/现有 Core bundle，经本地受控 SSE 端点完成 3 次请求、21 项检查，见 [report.json](report.json)。覆盖 `isComposing`/229 不发送、Shift+Enter 换行、Enter/按钮发送、流式跟随、鼠标/键盘上翻保位、End 恢复、60px 阈值、窗口改变、流式结束、会话切换/取消、重载不重复请求、三尺寸字体/溢出/焦点。
- 现有 `scripts/verify-research-loop.mjs` 再跑一轮，通过计划准备、冻结内容核对与篡改拒绝/恢复、撤回/替代、人工侧批准、本地计算、候选来源确认、决策、导出、重载和保存错误保留草稿，见 [research-loop/report.json](research-loop/report.json)。未覆盖旧 IDE 的完整视觉回归。
- 1440×900、1024×768、390×844 实际截图已查看；无页面横向溢出、无低于 12px 的可见文本，键盘焦点可见。布局和 token 保持不变。

专项驱动最初两次因测试定位使用“新建对话”（实际为“新对话”）、证据读取使用错误 Core 文件名而未完成；修正驱动后正式报告通过。这两次不计作通过，也没有据此调整产品代码。

## 截图

| 状态 | 1440×900 | 1024×768 | 390×844 |
| --- | --- | --- | --- |
| 空状态 | [empty-1440](empty-1440.png) | [empty-1024](empty-1024.png) | [empty-390](empty-390.png) |
| 长对话与键盘焦点 | [transcript-1440](transcript-1440.png) | [transcript-1024](transcript-1024.png) | [transcript-390](transcript-390.png) |

专项报告包含实际 Main/Core/renderer 和 ChatView 源文件的 SHA-256。Main 与 Core bundle 身份仍与原 1.0 验收一致，renderer 已更新。此处的确定性模型只验证交互与科研流程回归，不代替真实 provider、SSH、完整进程重启或分发包验收。

## 重跑

先构建 desktop，并准备现有 Core/Skills 资源。QA 主机设置 `RW_PLAYWRIGHT_MODULE` 指向已有 Playwright 包，然后运行：

```powershell
node scripts/verify-chat-interactions.mjs
$env:RW_QA_OUTPUT = 'design/implementation/openresearch-reuse-20261111/research-loop'
node scripts/verify-research-loop.mjs
```

两者仅使用独立临时工作区、假 Key 与本地模型端点。无需真实模型凭据或 SSH。回退仅涉及本次 renderer 改动，不迁移或删除科研记录。
