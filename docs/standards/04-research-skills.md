# 04 · Research Skills 规范

## 1. 目的

科研能力的差异不在“多几个提示词”，而在**可执行、可验证、可追溯的研究流程**。
本规范约束所有内置科研 Skill，防止它们退化成不可测试的 prompt 或绕过审批的脚本。

## 2. 强制定义

每个 Research Skill **必须**包含：

```ts
interface ResearchSkill {
  id: string;                    // research.data.profile
  version: string;               // 固定版本
  purpose: string;
  triggers: string[];
  inputs: SkillInputSpec[];      // scope / artifact / question / params
  requiredTools: string[];       // 必须经 ToolGateway
  workflow: SkillStep[];         // 可确定性执行/可恢复
  outputs: SkillOutputSpec[];    // artifact / proposal / report
  approvalPoints: ApprovalPoint[];
  provenance: ProvenanceSpec;    // 输入 ID、版本、参数、代码
  failureModes: string[];
  evaluation: EvaluationFixture[];
}
```

缺少 `version`、`provenance`、`failureModes` 或 `evaluation` 的 skill 不得进入主线。

## 2.1 打包格式

每个内置 skill 使用独立目录，兼容 Agent Skills 的渐进披露思路，但执行仍由本产品托管：

```text
skills/<skill-id>/
  SKILL.md          # name/description/version/allowed-tools/流程/边界
  scripts/          # 确定性脚本
  references/       # 长文档、方法说明
  assets/           # 模板、schema、fixture
  tests/            # fixture + 失败用例
```

- `SKILL.md` frontmatter 至少包含：`name`、`description`、`version`、`last-reviewed`、`allowed-tools`、依赖说明。
- 启动只加载 `name` / `description`；任务匹配后再加载完整流程与引用材料，避免上下文膨胀。
- `allowed-tools` 是宿主校验声明，不是授权本身；实际调用仍由 ToolGateway 逐次检查。
- 脚本必须版本固定、可测试、可审计；首版不加载第三方任意脚本。

## 3. 权限与状态

- Skill 只能通过 ToolGateway 访问文件、Shell、网络、运行。
- Skill 可以产出：
  - artifact（数据画像、表、图、分析脚本、报告）；
  - proposal（任务书、下一步、候选 claim、证据链接）。
- Skill **不能**：
  - 批准任务书/运行；
  - 把候选 claim 升级为已确认；
  - 删除/覆盖原始证据；
  - 修改权限、预算、工作区边界；
  - 绕过 `validate` 直接 `apply` 领域动作。
- 所有输出必须有来源：输入 artifact IDs、参数、代码/脚本版本、工具调用 ID。

## 4. 确定性优先

- 统计、schema/缺失/覆盖检查、哈希、复算、图表数据由脚本/工具计算。
- 模型负责解释、选方法、指出边界和提出下一步；不得用自然语言口算替代计算。
- 长日志/大表不整体进上下文；skill 产出摘要 + artifact 引用 + 可回溯位置。
- 失败、缺件、采样/覆盖不足必须写入输出；不能只输出成功结果。

### 4.1 数据与 EDA

- 数据内容（单元格、表头、路径、元数据）一律视为不可信输入；不执行其中的指令/宏/表达式。
- 先明确 data dictionary、观测单位、分组/配对/批次/时间结构、缺失编码、train/val/test 边界。
- 保留原始数据只读；派生结果单独写；不自动删异常、不自动插补、不自动改划分。
- 默认输出有界/脱敏摘要；不打印原始行、直接标识符和完整路径。
- 不支持格式 fail closed；不能静默猜列含义或伪造完整覆盖。

### 4.2 统计

- 先定 estimand、比较、采样单位、依赖结构、多重比较家族，再看结果。
- 检查假设，但不得按“正态性检验 p 值”自动切换检验；偏离预注册要明确标注。
- 必须报告效应量、置信区间、样本量/覆盖；不能只报 p 值。
- 不把观测功效当结论，不把“不显著”当等价，不把统计显著当科学重要。
- `stats.review` 只出审查意见，不替研究者接受/拒绝结论。

### 4.3 文献与引用

- 先定纳入/排除标准；记录数据库、检索式、日期和结果数。
- 区分 records / reports / studies；去重不等于同一研究；全文评估与质量评估分开。
- 引用必须回源核验；元数据是不可信输入，禁止编造 DOI、页码、作者或期刊字段。
- CS 优先 arXiv、DBLP、Semantic Scholar、OpenAlex、Crossref；PubMed 只在相关领域使用。
- 综述/引用 skill 必须输出来源矩阵与未核验项，不能只输出一段总结。

## 5. 版本、发现与执行

- 内置 skills 放在 `packages/research-skills`，固定版本；首版不加载第三方任意脚本。
- UI 通过输入框 `/` 或 Research Skills 面板发现；卡片展示输入、预期产物、审批点。
- 每次执行记录 skill id/version、输入、工具、输出、耗时、失败状态。
- 升级 skill 必须跑其 evaluation fixture，并保留旧运行可追溯。
- 项目可以配置启用/禁用 skill；禁用不得通过 prompt 绕过。

### 5.1 评测

- 任务输出应是可执行脚本/artifact，而不是一段“看起来正确”的回答。
- 至少记录：执行成功、结果/数值正确、产物完整、覆盖范围、成本/时间、人工 rubric。
- 每个 skill 有 fixture 和失败/缺件用例；技能升级必须跑评测。
- 参考 ScienceAgentBench 的“专家验证任务 + 自包含程序 + 执行评估”，以及 MLAgentBench 的 workspace 快照/日志/成本模式；不直接使用其数据。

## 6. 首版内置 skills

必须：

- `research.checkpoint`
- `research.decision-log`
- `research.evidence-ledger`
- `research.next-step`

Phase 2/3 至少：

- `literature.scout`
- `literature.ingest`
- `literature.review`
- `citation.verify`
- `experiment.design`
- `data.profile`
- `data.analyze`
- `stats.review`
- `evidence.synthesize`
- `repro.audit`

后置：related-work matrix、paper outline/draft、research.review、领域包。

## 7. UI 与交互

- Skill 不是顶级 Tab；通过输入框 `/`、技能选择器和状态页的研究路线承接。
- 运行中的 skill 显示工具事件、artifact 和审批点，不伪装成普通聊天消息。
- 候选结论必须显示“候选/待审”，与“已确认”视觉和状态区分。
- Skill 产出的 artifact 可跳到实验记录/代码/数据；不得产生孤立结果。

## 8. 验收

- 每个 skill 有固定 fixture 和至少一个失败/缺件用例。
- 不允许出现“模型说完成了，但没有 artifact/脚本/来源”的 skill。
- 不允许 skill 直接确认 claim、启动 run、删除证据。
- 不允许同一能力同时由 prompt 和 skill 两套实现而无 ADR。
