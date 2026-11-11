# packages/ui

设计系统与展示组件，实现 [UI 合同](../../docs/standards/03-prototype-ui-contract.md)。

## 已落地

- `src/tokens.css`：原型的颜色、字体、圆角、布局尺寸、阴影与动效 token。
- `src/base.css`：系统字体、14/24 正文、系统字重、焦点、reduced motion。
- `src/primitives.tsx` / `components.css`：Button、IconButton、DropdownTrigger、MenuItem、TextInput、TextArea、DisclosureSummary；公共外观只在这里维护。
- `src/Popover.tsx` / `overlay-position.tsx`：模型/历史/项目动作菜单与权限面板共用外围点击、Esc、焦点返回和视口定位；菜单支持方向键/Home/End，Tab 退出。
- `src/form-controls.tsx`：Segmented、可编辑 ComboBox 与 Switch；方向键、输入法保护和足够的点击区域。
- `src/Icon.tsx` / `icon-nodes.ts`：一套 SVG registry。来源固定为 Lucide React 1.23.0 的所需图标数据；完整 ISC/Feather MIT 和逐文件来源在 `vendor/lucide/`。

控件尺寸为桌面 ≥32px、≤900px 时 ≥40px；常规图标 16px，下拉/树箭头 14px，2px 描边。按钮文字 13px，元数据 ≥12px，短过渡 120ms。原生 dialog 用于需要焦点隔离的设置和方案审阅；Popover 的 `kind="dialog"` 是非模态权限面板。

使用 `@research-workbench/ui` 单一出口；旧 Renderer `Controls.tsx` 和旧按钮/菜单皮肤已移除。只接受展示 props/callbacks，不持有 RPC、模型配置、权限或科研状态。开源选择与退出策略见 [ADR-0020](../../docs/adr/0020-shared-openresearch-controls.md)，交互验收范围与复验入口见 [界面与交互验证](../../docs/project/validation.md#ui)。

## 规则

- token 唯一来源；不写散落颜色/字号。
- 不引入第二套有样式的组件库；将来采用 Radix 也只使用无样式行为。
- 不包含业务请求或数据库逻辑。
- 所有组件提供空/加载/错误/禁用状态。
- 代码工作面、研究路线、Skills 面板必须沿用本目录 token，不另起视觉系统。
