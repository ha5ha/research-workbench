# packages/ui

设计系统与展示组件，实现 [UI 合同](../../docs/standards/03-prototype-ui-contract.md)。

## 已落地

- `src/tokens.css`：原型的颜色、字体、圆角、布局尺寸、阴影与动效 token。
- `src/base.css`：系统字体、14/24 正文、系统字重、焦点、reduced motion。

## 规则

- token 唯一来源；不写散落颜色/字号。
- Radix 仅提供行为；所有样式自定义。
- 不包含业务请求或数据库逻辑。
- 所有组件提供空/加载/错误/禁用状态。
- 代码工作面、研究路线、Skills 面板必须沿用本目录 token，不另起视觉系统。
