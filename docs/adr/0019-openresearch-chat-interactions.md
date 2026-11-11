# ADR-0019：直接适配 OpenResearch 聊天交互代码

- 状态：Accepted
- 日期：2026-11-11
- 决策者：仓库所有者明确允许直接复用开源代码；沿用 ADR-0009 的 OpenResearch 参考与直接重构授权
- 关联：ADR-0009、开源优先规范、原型 UI 合同

## 问题与约束

现有 ChatView 在消息、流式内容或运行状态变化时无条件滚到底部，研究者阅读上文时会失去位置；输入框只检查 `isComposing`，缺少上游针对 IME `keyCode=229` 的发送保护。这两处直接影响阅读科研分析和中文输入。

只修改 renderer 交互，不改变主题、布局、Core、审批、数据库或模型权限。用一条实现替换原逻辑，不保留旧模式，不为代码复用引入框架或第二套聊天状态。

## 候选与源码核验

| 候选                                              | 许可、版本与维护证据                                                                                                                                            | 边界与成本                                                                                        | 结论                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| OpenResearch ChatPanel / PlanStrip 的局部交互代码 | 根 MIT，Copyright (c) 2026 alphaXiv；固定 `92d6423a14b02cc6de85d3e2383dce6cb4dcb7fd`；本地源码 checkout 与 git HEAD、根 LICENSE 核对一致；该提交日期 2026-11-09 | refs、60px 底部判定、程序滚动标记、ResizeObserver 和 IME guard 可独立适配，不涉及服务端与业务对象 | Adapt：直接复制局部控制流并适配现有非虚拟 DOM |
| 现有 ChatView                                     | 本仓库 MIT；当前工作树                                                                                                                                          | 无新依赖，但强制滚动会打断阅读，缺少上述 IME 边界                                                 | 替换相关逻辑，不维护两套                      |
| 完整 OpenResearch ChatPanel / Transcript          | 同一固定 MIT 源码；使用 TanStack virtualizer、上游 API/ChatMessage、Base UI、Tailwind、国际化等                                                                 | 迁入完整组件会连带第二套模型、视觉/状态与 API 适配；本轮无需虚拟列表                              | 拒绝整组件迁入                                |

用户已指定 OpenResearch，因此在该固定源码与现有实现之间选择；不另选视觉或聊天框架。这里的维护证据来自已核对的固定提交，不宣称实时 release/issue 活跃度已重新查询。没有新增或升级 npm 依赖，也没有引入其传递依赖。

## 决策与来源

上游源码：

- [`ChatPanel.tsx`](https://github.com/alphaXiv/OpenResearch/blob/92d6423a14b02cc6de85d3e2383dce6cb4dcb7fd/ui/src/components/ChatPanel.tsx)：`stickToBottom` / `programmaticScroll` refs、`updateTranscriptBottom`、`pinTranscriptToBottom`、ResizeObserver（5473–5475、6545–6574 行）；输入框 Enter guard（3124–3128 行）。
- [`PlanStrip.tsx`](https://github.com/alphaXiv/OpenResearch/blob/92d6423a14b02cc6de85d3e2383dce6cb4dcb7fd/ui/src/components/PlanStrip.tsx)：相同的 `isComposing || keyCode === 229` 保护（107–118 行）。
- [`LICENSE`](https://github.com/alphaXiv/OpenResearch/blob/92d6423a14b02cc6de85d3e2383dce6cb4dcb7fd/LICENSE)：完整 MIT 文本保留在根 THIRD_PARTY_NOTICES，分发收集器继续包含它。

本地落点是 `apps/desktop/src/renderer/src/views/ChatView.tsx`，具体改动：

1. 直接保留上游 60px 判定、程序滚动标记和“仅跟随底部”的控制流；移除 virtualizer 与上游 UI state，滚动目标改为现有 DOM 的 `scrollTop`。观察 viewport 和内容容器，覆盖流式高度、字体和输入区引起的尺寸变化。
2. 上翻后暂停跟随，回到底部后恢复；手动发送、新建对话、成功载入历史会话和切换项目/任务重新定位。失败或取消载入历史不会改变阅读位置。
3. 直接采用 IME guard；Enter 发送，Shift+Enter 保留换行；输入法候选确认不触发发送。
4. 沿用上游的可聚焦对话 region 与 `overflow-anchor: none`，避免浏览器锚定与跟随逻辑争夺滚动位置；保持现有视觉 token。

源码注释和 THIRD_PARTY_NOTICES 标注精确来源，依赖台账区分“npm 直接依赖”与“源码适配”。不把少量交互代码适配描述为迁入完整 ChatPanel。

## 验证与退出策略

新增独立真实 Electron 驱动 `scripts/verify-chat-interactions.mjs`，通过 Main/preload/Core 和本地受控流式模型端点验证输入、流式跟随、上翻保位、恢复跟随、发送/重开/历史切换与三尺寸界面；不访问真实 provider 或 SSH。运行类型检查、架构 lint 和相关许可回归。验收证据放在独立目录，不覆盖已验收 1.0 便携包的历史身份。

后续升级对比上述固定文件与交互测试，不静默跟踪上游。可独立替换 renderer 交互，不涉及数据迁移或运行恢复；回退只恢复本次变更，不删除会话或科研证据。
