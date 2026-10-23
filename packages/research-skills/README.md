# packages/research-skills

内置科研 Skill 的实现、manifest、评测 fixture 和版本管理。

- 每个 skill 必须有 `skill.json`（或等价 schema）、执行步骤、所需工具、产物、审批点和 evaluation。
- 只能通过 ToolGateway 使用工具；不能直接审批、确认 claim 或删除证据。
- 首版只加载仓库内置 skills，不加载第三方任意脚本。
- 具体规范见 [`docs/standards/04-research-skills.md`](../../docs/standards/04-research-skills.md)。

计划目录：

```text
research-skills/
  src/
    registry/
    contracts/
    builtins/
      research-checkpoint/
      research-decision-log/
      research-evidence-ledger/
      research-next-step/
      literature-scout/
      data-profile/
      data-analyze/
      stats-review/
      evidence-synthesize/
      repro-audit/
  fixtures/
  README.md
```
