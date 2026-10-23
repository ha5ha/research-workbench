# 计算科研 Skills 体系（v0.1）

日期：2026-10-23
定位：为“计算科研 Agent”设计内置技能，不是通用 Agent 技能市场。
目标：减少研究者在**数据分析、结论整理、研究路线沉淀**上的手工管理，而不是替代科研判断。

## 0. 设计原则

1. **技能不是 prompt**：每个 skill 必须有输入、工具、确定性步骤、产物、审批点、失败模式和评测。
2. **确定性优先**：统计、数据剖析、哈希、复算、完整性检查尽量由脚本/工具完成；模型负责解释与提议。
3. **证据不升级**：skill 可以生成候选观察/结论，不能确认 claim、不能批准运行、不能删除证据。
4. **路线可沉淀**：每个阶段结束都产生结构化检查点/决策/未决项，而不是只留下聊天。
5. **计算科研优先**：Python/R、CSV/Parquet、notebook、Git、GPU/SSH、LaTeX、arXiv/OpenAlex/DBLP 优先；非计算学科工作流后置。
6. **可评测**：每个 skill 有固定样例和失败标准；不以“回答看起来合理”验收。

## 1. 分层

### Tier 0：研究路线与记忆（必须首版）

| Skill | 解决什么 | 主要工具 | 产物 / 审批 |
| --- | --- | --- | --- |
| `research.checkpoint` | 长对话/阶段结束后，提炼目标、已完成、决策、未决项、下一步 | 当前项目状态、会话、运行/artifact 索引 | checkpoint 草稿；用户可编辑/确认 |
| `research.decision-log` | 记录为什么选/不选某路线，避免以后重复讨论 | 对话、任务书、运行、证据 | decision 提案；用户确认后入档 |
| `research.evidence-ledger` | 把观察、解释、结论、反证、适用范围分开 | claim/evidence 服务、artifact 索引 | 候选 claim / evidence link；不能自确认 |
| `research.next-step` | 从当前证据和未决项生成有边界的下一步 | 项目状态、证据、预算 | 单轮任务/任务书提案；需审批 |

Tier 0 是“越来越乱”的直接解药：**研究路线不是聊天记录的副产物，而是结构化、可恢复的对象。**

### Tier 1：计算科研核心（Phase 3）

| Skill | 输入 | 确定性工具 | 输出 |
| --- | --- | --- | --- |
| `literature.scout` | 问题、关键词、已有材料 | arXiv/OpenAlex/DBLP/Semantic Scholar、PDF 解析 | 相关工作报告、来源、待读清单、引用 |
| `literature.ingest` | PDF/URL/DOI | pdf.js/文本抽取、元数据、哈希 | 材料记录、章节/页码索引、候选 claim |
| `literature.review` | 问题、纳入/排除标准 | 多源检索、去重、筛选计数、全文/质量评估 | 系统性/范围综述草案、PRISMA 计数、证据局限 |
| `citation.verify` | BibTeX/DOI/arXiv/DBLP | Crossref/OpenAlex/Semantic Scholar/arXiv 元数据 | 校验后的引用、缺失字段、不可核验标记 |
| `experiment.design` | 问题、已有证据、预算 | 任务书模板、对照/种子/预算/统计功效检查器 | 任务书草案；需人审 |
| `data.profile` | CSV/Parquet/JSON/日志 | 解析器、schema/缺失/分布/覆盖/泄漏检查 | 数据画像、异常清单、artifact 链接 |
| `data.analyze` | 数据 artifact、分析问题 | Python/R 脚本、统计检验、效应量、置信区间 | 可复算分析、表/图、参数与输入引用 |
| `stats.review` | 分析脚本/结果/设计 | 配对检查、多重比较、样本量/覆盖、异常检查 | 统计审查意见；不能替用户接受结论 |
| `evidence.synthesize` | 多个 run/analysis | claim 模板、来源链、反证检索 | 候选结论 + 支持/反证/边界；需人审 |
| `repro.audit` | run/任务书/artifact | 哈希、环境/版本、缺件、重跑检查 | 复现审计；标出 unknown/缺件 |

### Tier 2：写作、审阅与领域包（后置）

- `literature.related-work-matrix`：论文×方法×数据集×指标×结论矩阵。
- `research.review`：按 claim-evidence 矩阵做内部审阅；只出意见，不替用户决定。
- `paper.outline` / `paper.draft`：只从已接受 claim 组织草稿，不虚构引用。
- 领域包：生物、化学、医学、社科等；首版不写死，用 Domain Pack 扩展。

## 2. Skill 合同

```ts
interface ResearchSkill {
  id: string;                    // research.data.profile
  version: string;
  purpose: string;
  triggers: string[];
  inputs: SkillInputSpec[];
  requiredTools: string[];
  workflow: SkillStep[];         // 可确定性执行
  outputs: SkillOutputSpec[];    // artifact / proposal / report
  approvalPoints: ApprovalPoint[];
  provenance: ProvenanceSpec;
  failureModes: string[];
  evaluation: EvaluationFixture[];
}
```

约束：

- skill 只能通过 ToolGateway 使用工具；
- 产出的 proposal 不自动生效；
- 每次执行记录输入 artifact IDs、参数、代码/脚本版本、输出 IDs；
- 失败/缺件/未覆盖范围必须出现在结果里；
- skill 版本固定，升级要跑评测。

## 3. 计算科研的工具面

| 类别 | 首版 | 后置 |
| --- | --- | --- |
| 语言/环境 | Python、uv、Git、Shell、SSH | R/Julia、conda、容器 |
| 数据 | CSV、JSON、Parquet、日志、图片 | 专业格式、数据库连接器 |
| 计算 | 本地进程、GPU 状态、SSH | SLURM/K8s、云调度 |
| 文献 | PDF、arXiv/OpenAlex/DBLP、BibTeX | 引文网络、系统综述 |
| 分析 | pandas/numpy/scipy、统计脚本、图表 | notebook 内核、交互式探索 |
| 输出 | Markdown、CSV、PNG/SVG、LaTeX | 论文模板、投稿包 |

**不算首版重点**：通用浏览器自动化、销售/客服连接器、PR review、IDE 插件、多人协作、应用部署。

## 4. UI 承接

- 输入框 `/` 唤起 Research Skills；卡片展示输入、将产生的 artifact、是否需要审批。
- 状态 Tab 扩展“研究路线”：问题树、决策记录、证据矩阵、未决项。
- 实验记录继续作为 run 归档；skill 产物链接到 artifact/claim。
- skill 执行过程是工具事件，不伪装成普通聊天消息。
- 技能产生候选结论时，必须显示“候选/待审”，不能显示“已证明”。

## 5. 首版验收

1. 一个真实计算研究任务：文献 → 任务书 → 运行 → 数据分析 → 候选结论 → 下一步。
2. 每个 Tier 0 skill 至少有一个固定 fixture；Tier 1 至少 data.profile、data.analyze、evidence.synthesize。
3. 同一会话结束后，新会话能从 checkpoint 恢复“做了什么、依据、未决、下一步”。
4. 统计/证据 skill 不能自动确认 claim 或启动 run。
5. 失败/缺件/负结果被保留并出现在路线中。

## 5.1 外部可借鉴实现（2026-10-23 核对）

| 来源 | 值得借鉴 | 不照搬 |
| --- | --- | --- |
| [Agent Skills 标准](https://agentskills.io/) | `SKILL.md` + `scripts/` + `references/` + `assets/`；启动只加载 name/description，按需渐进披露 | 标准本身不提供信任、权限和运行隔离，必须由宿主执行 |
| [Scientific Agent Skills](https://github.com/K-Dense-AI/scientific-agent-skills)（MIT） | skill frontmatter、`allowed-tools`、版本/复核日期、脚本与测试；EDA、统计、文献综述、引用管理、同行评审的严谨流程 | 177 个生物医学为主 skill 的广度；不受控的网络/脚本；把领域数据库当核心 |
| [PaperQA2](https://github.com/Future-House/paper-qa)（Apache-2.0） | agentic search：关键词检索 → 证据收集/重排/RCS → 带引用回答；元数据、撤稿检查、索引复用 | 整套 RAG 引擎直接嵌入；它不是科研路线/运行/证据系统 |
| [AI Scientist](https://github.com/SakanaAI/AI-Scientist) / [Agent Laboratory](https://github.com/SamuelSchmidgall/AgentLaboratory) | 把研究拆成 idea → experiment → analysis → report → review；模板化实验；Agent Lab 的 copilot 模式 | 全自动论文/审稿结论；AI Scientist 明确警告会执行 LLM 代码，不能无沙箱运行 |
| [Aviary](https://github.com/Future-House/aviary) | Agent policy 与科学 environment 分离；工具改变状态；环境化评测 | 训练 gym 本身不是桌面产品运行时 |
| [ScienceAgentBench](https://github.com/OSU-NLP-Group/ScienceAgentBench) | 专家验证的真实科研任务；输出自包含程序；执行结果 + 成本 + rubric 评测 | 任务数据不可直接 redistribution；不把 benchmark 分数当科学有效性 |
| [MLAgentBench](https://github.com/snap-stanford/MLAgentBench) | 交互式 ML 实验环境；workspace 快照、日志、成本、端到端任务 | 不覆盖数据分析和科研路线沉淀；安全需另加沙箱 |

### 可直接吸收的具体规则

1. **Skill 打包**
   - 每个 skill 是独立目录：`SKILL.md`（元数据+流程）、`scripts/`、`references/`、`assets/`、`tests/`。
   - frontmatter 至少：`name`、`description`、`version`、`last-reviewed`、`allowed-tools`、依赖说明。
   - 启动只加载 name/description；匹配任务后再读完整流程；脚本/参考按需加载。这是控制上下文的关键。
   - `allowed-tools` 只是声明，**必须由 ToolGateway 强制执行**；skill 不能自己扩大工具集合。

2. **EDA / 数据画像**
   - 先要 data dictionary、观测单位、分组/配对/批次/时间结构、缺失编码、train/val/test 边界、预注册问题。
   - 保留原始数据只读；派生结果单独写；不自动删异常、不自动插补、不自动改划分。
   - 输出有界、脱敏、带扫描范围；不支持格式 fail closed，而不是猜。
   - 这些规则直接进入 `data.profile` / `data.audit`。

3. **统计分析**
   - 先定 estimand、比较、采样单位、依赖结构、多重比较家族，再看数据。
   - 检查假设但不要按“正态性检验 p 值”自动换检验；报告效应量、置信区间、样本量/覆盖。
   - 不把观测功效当事后结论；不把“不显著”当等价；不把 p 值当科学重要性。
   - `stats.review` 应能指出这些错误，而不是替代研究者接受结论。

4. **文献与引用**
   - 先定纳入/排除标准；记录每个数据库、检索式、日期、结果数。
   - 区分 records / reports / studies；去重不等于同一研究；全文评估与质量评估分开。
   - 引用必须回源核验；元数据是不可信输入，不能编造 DOI/页码/作者。
   - CS 方向优先 arXiv、DBLP、Semantic Scholar、OpenAlex、Crossref；PubMed 只在相关领域使用。
   - 这些进入 `literature.scout` / `literature.review` / `citation.verify`。

5. **评测**
   - 任务输出应是可执行程序/artifact，不只是一段回答。
   - 评测维度至少：执行成功、数值/结果正确、产物完整、成本/时间、专家 rubric。
   - 参考 ScienceAgentBench 的“单任务自包含程序 + 执行评估 + 专家验证”，以及 MLAgentBench 的 workspace 快照/日志/成本。
   - 我们不直接使用其数据；自建计算科研 fixture，避免污染和许可问题。

6. **可借鉴但需改造的具体 skill**
   - `exploratory-data-analysis` → 我们的 `data.profile` / `data.audit`（更偏 CSV/Parquet/日志/Python）。
   - `statistical-analysis` / `statistical-power` → `stats.review` / `experiment.design`。
   - `literature-review` / `citation-management` → `literature.review` / `citation.verify`。
   - `peer-review` → 后置的 `research.review`，只做 claim-evidence 矩阵和证据边界，不替代审稿决定。
   - `statsmodels`、`polars`、`datalad`、`nextflow`、`modal`、`optimize-for-gpu`、`open-notebook` 可作为工具适配器候选，逐项按开源优先规范评估。

### 明确不采用

- 不做 177 个领域 skill 的全量移植；只保留服务计算科研的通用 skill。
- 不把生物医学数据库/临床工作流当默认能力。
- 不允许 skill 自带不受控网络/Shell；所有副作用经 ToolGateway 和审批。
- 不把“自动写论文/自动审稿结论”作为产品承诺；paper draft 只能在已接受 claim 之后。

## 6. 参考（只借机制，不直接依赖）

- Agent Skills 标准：<https://agentskills.io/>
- Scientific Agent Skills：<https://github.com/K-Dense-AI/scientific-agent-skills>
- PaperQA2：<https://github.com/Future-House/paper-qa>
- Aviary：<https://github.com/Future-House/aviary>
- AI Scientist：<https://github.com/SakanaAI/AI-Scientist>
- Agent Laboratory：<https://github.com/SamuelSchmidgall/AgentLaboratory>
- ScienceAgentBench：<https://github.com/OSU-NLP-Group/ScienceAgentBench>
- MLAgentBench：<https://github.com/snap-stanford/MLAgentBench>
- Codex / pi：工具、会话、权限、上下文与 coding 工作面的工程经验。

这些项目的具体能力、许可证和适用边界在引入前单独核对。
