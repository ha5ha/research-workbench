# packages/research-skills

内置科研 Skill 的实现、manifest、评测 fixture 和版本管理。

- 每个 skill 使用 `SKILL.md` + `scripts/` + `references/` + `assets/` + `tests/`，并带版本、`allowed-tools`、失败模式和 evaluation。
- 只能通过 ToolGateway 使用工具；不能直接审批、确认 claim 或删除证据。
- 首版只加载仓库内置 skills，不加载第三方任意脚本。
- 具体规范见 [`docs/standards/04-research-skills.md`](../../docs/standards/04-research-skills.md)。

当前状态：`data-profile` 已可执行（CSV/TSV 画像、缺失/类型/唯一值、JSON artifact）；`research-checkpoint` 为 planned 示例。

计划目录：

```text
research-skills/
  src/
    registry/
    contracts/
    builtins/                  # 宿主内置 skill 加载器
  skills/
    research-checkpoint/
      SKILL.md
    research-decision-log/
      SKILL.md
    research-evidence-ledger/
      SKILL.md
    research-next-step/
      SKILL.md
    literature-scout/
      SKILL.md
    literature-ingest/
      SKILL.md
    literature-review/
      SKILL.md
    citation-verify/
      SKILL.md
    experiment-design/
      SKILL.md
    data-profile/
      SKILL.md
    data-analyze/
      SKILL.md
    stats-review/
      SKILL.md
    evidence-synthesize/
      SKILL.md
    repro-audit/
      SKILL.md
  fixtures/
  README.md
```
