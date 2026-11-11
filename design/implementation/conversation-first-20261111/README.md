# 对话驱动科研工作区：审阅修复验收

2026-11-11。原始独立走查见 [ux-review.md](ux-review.md)；`ux-*` 截图保留修复前的观察。当前基线是下列最终三轮，`round-*` 为调试过程，不作为最终验收结论。

## 已完成的两处修复

- 任务书卡和输入区待审条共享 Core overview。已有待审方案时，任务书直接“审阅当前方案”；撤回后显示原因和重新准备入口，替代后指向新方案，有运行时查看运行。聊天卡不再持有审批状态副本。
- 方案审阅中的冻结文件可以打开完整只读内容。Renderer → preload → Main 白名单 → Core `plans.readFrozenFile`，只读对应 plan 的已有快照，核对 manifest 路径、字节数与 SHA-256。没有当前工作树回退；撤回/替代的历史文件仍可只读回查。

审阅限额是 128 KiB 完整 UTF-8 文本；超限、非法编码、二进制控制字符、路径/链接拒绝、缺失、篡改均失败。页面在文件区域展示加载、具体中文原因、重试和关闭；键盘焦点保留在现有原生 dialog 中。未新增依赖、编辑器或执行权限。

## 可运行证据

Core 与 desktop 使用共享的最终构建；PlanReview 错误文案调整后再次完成 desktop build，之后连续运行三轮真实 Electron/Main/preload/Core harness：

| 轮次 | 报告 | 结果 |
| --- | --- | --- |
| 1 | [verification-1/report.json](verification-1/report.json) | 通过，pageerror 空 |
| 2 | [verification-2/report.json](verification-2/report.json) | 通过，pageerror 空 |
| 3 | [verification-3/report.json](verification-3/report.json) | 通过，pageerror 空 |

每轮覆盖：Agent 创建任务书/方案；未批准前无 Run；工作树内容变化后仍读取确切冻结内容；冻结文件篡改后拒绝、还原并重试；撤回及替代后卡片动作与台账一致；被替代旧方案不能批准；窄屏 dialog 的焦点约束、Esc 返回触发器、文件预览关闭返回触发器、错误重试按钮的可见键盘焦点与 40px 高度；后续批准、本地计算、均值 4 的核验、来源结论、决策、重载、检查点与记录工具。

异步 Core 查询在 Node 端显式 await+轮询，未使用 Promise predicate 的 `waitForFunction`。截图使用 `reducedMotion: reduce` 与禁用动画，首屏等待模型设置加载完成。1440×900、1024×768、390×844 的对话/罗盘均无横向溢出和低于 12px 的可见文本。

最终类型检查、边界 lint 通过。冻结内容与卡状态 5 个测试、closure 4 个测试通过；提升执行的 managed-runs 集成与这两组测试共 19 个通过。首次沙箱内的 timeout/cancel 测试因进程树终止权限失败，提升重跑通过；仅清理了经命令行核对的该次测试 fixture 进程树。

## 截图与字体

- [桌面冻结内容](verification-3/chat-plan-1440.png)
- [390px 冻结内容](verification-3/frozen-file-390.png)
- [390px 读取失败与键盘焦点](verification-3/frozen-file-error-390.png)
- [390px 撤回后的任务书](verification-3/dismissed-card-390.png)
- [390px 替代方案](verification-3/replacement-plan-390.png)
- [空首屏](verification-3/chat-empty-1440.png)

通过 CDP `CSS.getPlatformFontsForNode` 读取真实使用的系统字族，而非只查看 CSS 声明：中文首屏标题为 **Microsoft YaHei UI**，英文 Research 品牌为 **Segoe UI Semibold**；两者均 `isCustomFont: false`、8 glyph。三轮结果一致，详见各轮 [platform-fonts.json](verification-3/platform-fonts.json)。

## 边界与未验证

本验收使用隔离项目及确定性的本地模型 endpoint，不证明真实模型的科研方案质量或 SSH 发布能力。128 KiB 以上及非 UTF-8/二进制文件会明确拒绝内联预览；没有分块、下载或工作树替代入口。实现没有更改执行器、生产模型提示、包版本或许可流水线。
