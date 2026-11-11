---
name: research-checkpoint
description: Freeze a provenance-linked checkpoint of goals, runs, evidence, failures and decisions.
version: "0.2.0"
last-reviewed: "2026-11-10"
allowed-tools:
  - research.read
  - artifact.write
status: runnable
---

# Research Checkpoint

## Input and deterministic workflow

Input: project scope and optional descriptive params. The Core MUST supply structured research state through `research.read`; callers MUST NOT substitute model-written state.

1. Read the current compass, frozen plans, runs, claims and decisions.
2. Project the requested record using `src/builtins/research-records.ts` version 0.2.0. Preserve failed, canceled and unknown runs, limitations and counterevidence.
3. Write one JSON artifact through `artifact.write`; include skill version, scope, params, plan digests, revisions and record identities.
4. Return artifact identity and warnings. Next-step output MUST remain a proposal; a human chooses subsequent work.

## Approval and provenance

This Skill MAY produce an artifact/proposal only. It MUST NOT approve/start runs, confirm claims, delete evidence, change budgets, or mutate decisions. `confirmed` denotes a stored human confirmation, not a fresh scientific validation. Raw source integrity is rechecked by Core when confirming/exporting the formal checkpoint.

## Failures and evaluation

Missing state reader, denied tool, malformed state or artifact write failure MUST fail without a partial accepted research record. No model arithmetic or significance inference is permitted.

Fixtures: `tests/unit/research-record-skills.test.ts` covers all four projections, provenance, unknown-job priority, negative results, missing reader and write failure. Dependencies: existing contracts/SkillRegistry only; no external SDK or runtime.
