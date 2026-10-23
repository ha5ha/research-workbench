---
name: research-checkpoint
description: Propose a structured research checkpoint from the current project state, decisions, open questions and next action. Planned for Phase 2; it must not mutate project records without confirmation.
version: "0.1.0"
last-reviewed: "2026-10-23"
allowed-tools:
  - domain.observe
  - artifact.write
status: planned
---

# Research Checkpoint

## Purpose

Turn a working session into a durable checkpoint: goal, completed work, decisions, evidence, unknowns and the single next action.

## Intended workflow

1. Observe the current research scope through the domain environment.
2. Summarize only facts and decisions that have provenance.
3. Separate observations, interpretations, open questions and rejected paths.
4. Produce a checkpoint proposal for researcher review; do not write it as accepted project state.
5. Link every item to a session/message/artifact/run identity where available.

## Boundaries

- A checkpoint is working material, not a confirmed scientific fact.
- It cannot promote a claim, approve a run or delete evidence.
- It must not silently drop unresolved items or negative results.

Status is `planned` until the domain checkpoint model lands.
