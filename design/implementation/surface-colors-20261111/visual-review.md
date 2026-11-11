# 独立存量视觉评审

范围：仅检查下列实际截图和交接约束。未读取产品源码、实现说明或其他评审，未修改实现；本轮不打分。

速查清单：

- [问题 1] `preview/research/frozen-file-390.png` 的冻结文件名：`experiment.cjs` 仍为显眼纯蓝色，与同列“查看内容”和全页中性操作色不一致 → 使用既有中性链接色，同时保留可点击识别与键盘焦点。
- [已成立] 模型/权限设置、科研罗盘与文件预览：重复标题、解释和多层框线已明显减少 → 不需再增加面板或重做布局。
- [已成立] 焦点、运行状态和 diff：必要语义颜色仍可辨 → 不应随中性化继续消除。

## 需要修复的问题

### 1. 冻结文件名仍保留孤立的纯蓝链接色

证据：`preview/research/frozen-file-390.png`，约画面中部的 `experiment.cjs` 文件入口。它与右侧“查看内容”属于同一行文件操作，但前者是显眼纯蓝色，后者为中性灰黑；周边审批按钮、折叠入口和文件预览操作也都采用中性颜色。这一蓝色同时存在于 `before/research/frozen-file-390.png`，属于尚未收敛的原有表现。

影响：在已清理框线的开放画布上，该文件名成为这一段唯一高饱和文字，视觉权重高于文件核验信息和相邻操作，与本次中性整体的目标不一致。

修正目标：文件链接沿用现有中性操作文字颜色，保留其对象名称、可点击识别和可见焦点；无需新增边框、色块或说明文字。

验收：复看 390px 同一文件展开状态，文件名与“查看内容”的颜色语法一致，焦点仍明确，SHA-256、只读核验信息、文件正文和审批动作均保留。

## 已成立的部分

### 表面层级与减法

- `preview/controls/default-1440.png` 与相应 before 图保持同一品牌、侧栏、顶部导航、对话主体和输入区结构。默认页本身已较克制，本轮没有为表现“改过”而增加装饰。
- `preview/controls/permission-390.png` 和 `surface-settings-权限-1440.png`：仅选中权限用浅灰背景和勾号表达，未选项靠行距分组；相比对应 before 图，蓝色选中描边和逐项外框已移除。权限名称、写入/命令限制与应用动作仍可读。
- `preview/controls/surface-settings-模型-1440.png`：协议候选由多个并排框改为纵向开放行，选中项使用灰底。移除了重复的小标题、顶端协议导语和长技术说明，仍保留接口地址、模型、Key 与保存操作所需的信息。
- `preview/controls/surface-settings-关于-1440.png`：四项运行信息已从四块灰底卡片释放到同一开放区域；原有“本地优先的科研工作台”导语和底部协议支持复述已删除。对象标签与实际路径保留，信息没有被泛化文案替换。
- `preview/controls/surface-settings-SSH-390.png`：移除重复的 SSH 小标题和顶端导语后，连接表单更早出现；“先保存连接信息，再核对指纹并测试”的操作顺序说明仍有实际用途，应保留。当前截图里表单在弹窗内部纵向滚动，不能把视口下方内容未展示判作被删除。
- `preview/research/compass-1440.png`、`compass-390.png`：当前方向、实验条目和运行详情共用开放画布。相比对应 before 图，次级操作的矩形按钮框、运行详情大外框及“研究工作区”重复眉题已移除；研究问题、运行对象、已验证状态、命令和指标仍在。未发现需要补回外围卡片的问题。
- `preview/research/frozen-file-390.png`：文件预览大外框已移除，仍通过标题、只读核验信息、代码段和动作区建立层级；关闭预览与审批操作保持可辨。390px 下长 hash 和代码有换行，当前画面未见横向裁切。

### 文案

- `preview/controls/surface-project-1440.png` 与 `permission-390.png` 中，回答者“Research”旁的“OpenAI 兼容”旁注已移除；before 同状态可见这一旁注。对话内容因而更直接。
- 以上指定 preview 图未见“真实模型会话”文案；这只代表已查看画面的结果，不能据此断言所有页面均已清除。
- 模型设置页中仍出现“模型与接口协议”、OpenAI 兼容和字段标签，它们位于实际配置上下文，承担选择与填写含义，不应仅因出现“模型/协议”字样一并删除。
- 对话上方和输入区各有模型入口；这与所看 before 图一致。静态图不能确认两处入口的交互责任是否相同，本轮不据此要求改变既定交互。

### 语义颜色与焦点

- `preview/controls/model-open-1440.png`：选中模型为中性灰底和黑色勾号；另一个模型行上的蓝色轮廓明确表达焦点，与选择状态可区分。无需为统一颜色移除焦点轮廓。
- `preview/controls/surface-code-file-1440.png`：编辑区底色和文件页签指示线已采用中性表现，代码语法颜色仍承担阅读功能。
- `preview/controls/surface-code-focused-1440.png`：编辑区蓝色焦点边界可见；文件页签仍为中性指示线，普通选中和键盘焦点没有混成一种状态。
- `preview/controls/surface-diff-theme.png`：删除区淡红、增加区淡绿，行侧红绿标记与修改字符仍可辨。这里的颜色表达差异，应保留。
- `preview/research/compass-1440.png`、`compass-390.png`：已验证实验的绿点保留，文字状态也保留；代码工作面中的 TS LSP 状态绿与 Git 数量提示色同样具有状态含义，不属于装饰色。

### 排版与放大

- `preview/controls/controls-200pct.png`：模型菜单、选中勾号、输入区图标与标签仍可读，长模型名使用省略，未见文字相互叠压。菜单与页面滚动条可见，但本轮没有操作滚动，不能据此声称全部菜单项和设置入口已可达。
- 所看 1440px 和 390px 画面未见明显的新对齐错误、文字重叠或页面级横向溢出。研究问题在 390px 自然断行，主内容没有靠缩小字号塞入。

## 实际查看的截图

本报告相对路径均相对于 `design/implementation/surface-colors-20261111/`。

当前画面，全部用 `view_image` 实际查看：

- `preview/controls/default-1440.png`
- `preview/controls/model-open-1440.png`
- `preview/controls/permission-390.png`
- `preview/controls/surface-settings-模型-1440.png`
- `preview/controls/surface-settings-权限-1440.png`
- `preview/controls/surface-settings-关于-1440.png`
- `preview/controls/surface-settings-SSH-390.png`
- `preview/controls/surface-project-1440.png`
- `preview/controls/surface-code-file-1440.png`
- `preview/controls/surface-code-focused-1440.png`
- `preview/controls/surface-diff-theme.png`
- `preview/controls/controls-200pct.png`
- `preview/research/compass-1440.png`
- `preview/research/compass-390.png`
- `preview/research/frozen-file-390.png`

用于前后比较的实际查看画面：

- `before/controls/default-1440.png`
- `before/controls/model-open-1440.png`
- `before/controls/permission-390.png`
- `before/controls/surface-settings-模型-1440.png`
- `before/controls/surface-settings-权限-1440.png`
- `before/controls/surface-settings-关于-1440.png`
- `before/controls/surface-settings-SSH-390.png`
- `before/controls/surface-project-1440.png`
- `before/controls/surface-code-focused-1440.png`
- `before/research/compass-1440.png`
- `before/research/compass-390.png`
- `before/research/frozen-file-390.png`

## 验证边界

本轮只有静态截图，未验证动效、键盘顺序、点击、滚动可达性、保存和权限执行。未查看 1024px 或断点相邻视口，未读 CSS，因此不能确认 1279/900 断点、272/720/760/300 精确宽度或所有文本的 12px 下限；这里只确认指定画面的可见表现。未看到错误、警告状态图，不对其配色作通过结论。

保留：品牌与既定导航/尺寸约束；开放画布上的研究对象层级；必要的状态色、diff 色和可见焦点。

## 主代理处置（评审后追加）

已在原有 `.frozen-file-button` 规则改用 `--text-2`，hover 为 `--text`，保留原可见焦点；未增加内框。主代理实际查看最终 390px 冻结文件截图，并在科研驱动加入灰阶断言，连续三轮通过。最终证据见 `accepted-3/research/frozen-file-390.png` 与 `accepted-1` 至 `accepted-3/research/report.json`。这是实现者复验，不表示进行了第二轮独立视觉评审。
