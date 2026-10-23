# UI 参考

本目录保存原型的视觉基线，不是生产代码。

## 来源

- 设计源文件：`D:\wangxing_private\科研\autoreascher\ttt_comparison_structure\docs\product\prototype\index.html`
- 当前基线：原型 v8
- 截图时间：2026-10-23

## 截图

| 文件 | 内容 |
| --- | --- |
| `screens/record-archive-1440.png` | 实验记录 master-detail：列表 + 概览 |
| `screens/record-taskbook-1440.png` | 记录内嵌任务书 |
| `screens/record-compare-1440.png` | 记录内部对比 |
| `screens/record-mobile-390.png` | 390px 记录详情、单列长字段 |

## 使用规则

1. 截图用于视觉比对，不用于像素级 OCR 还原。
2. 生产实现使用 React 重写，不复制原型的内联脚本、演示数据或 localStorage。
3. 所有颜色/字号/尺寸以 [`docs/standards/03-prototype-ui-contract.md`](../../docs/standards/03-prototype-ui-contract.md) 为准。
4. 原型源文件不在本仓库；本仓库不依赖它在构建时存在。
5. 若视觉基线更新，必须同步替换截图并更新规范日期。
