# Research Workbench Project Rules

This file is read by the agent before code changes. Keep it short, explicit, and project-specific.

## 1. Project layout

```text
src/                       reusable library code
experiments/<experiment>/  one directory per experiment
  README.md                goal, hypothesis, design
  config.yaml              parameters and seeds
  run.py                   entry point
scripts/                   developer and analysis tooling
tests/                      automated checks
data/                      raw / immutable input data (usually not committed)
results/                   generated outputs, grouped by run id
```

Do not create loose scripts in the repository root. Reuse existing modules before adding new ones.

## 2. Code quality

- Read existing modules and follow their naming, imports, and error style.
- Keep changes minimal; do not perform unrelated refactors.
- No hardcoded absolute paths; resolve paths from the project root.
- Add or update tests for behavior changes.
- Run the project formatter, linter, typecheck, and tests before declaring completion.

## 3. Experiments

- Every experiment has a stable experiment directory and a run id.
- Record config, random seed, command, environment, and output location.
- Write generated outputs under `results/<experiment>/<run-id>/` or `.research/`; never mix outputs into source directories.
- Preserve failed runs and their logs.
- Do not commit large datasets, caches, credentials, or generated artifacts.

## 4. Agent workflow

1. Read this file and inspect nearby code.
2. State the intended file changes before editing.
3. Make the smallest coherent diff.
4. Request approval for writes and commands.
5. Run checks.
6. Summarize changed files, commands, and results.

Never claim a result is validated when only code was written. Never approve your own write, command, or experiment.
