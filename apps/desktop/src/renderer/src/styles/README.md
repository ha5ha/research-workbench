# CSS 所有权与顺序

`styles.css` 仅按顺序导入共享 tokens/base/components、科研闭环样式与本目录功能样式。当前顺序保留原视觉合同的级联；调整顺序也属于视觉变更。

- navigation/shell/inspector：工作区布局、研究导航、详情。
- chat/composer/trace/chat-cards：对话、输入、工具状态、结构化卡片。
- code/terminal/diff：编辑器、Git、交互式终端、代码比较。
- records/record-editor：实验列表、详情、人工记录编辑。
- settings-fields/settings/permissions/approval：设置、权限、审批。
- pages/facts/feedback：公共页面布局、科研事实、错误反馈。
- responsive/responsive-small/overlays：保留原顺序的布局与浮层覆盖；功能外观应放在其所有者文件。
- foundation：根节点与滚动条；色值唯一来源是 `packages/ui/src/tokens.css`。

`scripts/stylelint-feature-ownership.mjs` 检查每个选择器的主类名前缀。新增功能文件或跨功能所有权须显式更新该表；共享 UI 的行为与外观在 `packages/ui`，业务文件只设置布局。运行 `pnpm lint:styles` 与 `pnpm test:ui`；三种尺寸、共享控件状态和截图仅在本地或 CI artifact 中保存。
