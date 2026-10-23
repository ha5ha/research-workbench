---
name: data-profile
description: Boundedly profile a CSV/TSV file in the workspace. Reports shape, missingness, inferred types, uniqueness and warnings without exposing raw rows. Use when inspecting a dataset before modeling or confirmatory analysis.
version: "0.1.0"
last-reviewed: "2026-10-23"
allowed-tools:
  - fs.read
  - artifact.write
status: runnable
---

# Data Profile

## Purpose

Produce a deterministic, bounded profile of a local tabular dataset so a research agent can decide what to inspect next without putting raw rows into the model context.

## Inputs

- `path` (required): workspace-relative path to a `.csv` or `.tsv` file.
- `delimiter` (optional): `,` or tab.

## Workflow

1. Resolve the path through the host ToolGateway. Never read outside the workspace.
2. Parse the header and rows with a real CSV parser, not string splitting.
3. Count rows, columns, missing values and uniqueness.
4. Infer only coarse types: integer, number, boolean, date, string, empty.
5. Emit warnings for blank/duplicate headers, ragged rows, small samples and high missingness.
6. Write a JSON artifact and return its ID. Do not write raw rows into the report or summary.

## Boundaries

- This skill does not validate scientific meaning, units, representativeness or data provenance.
- It does not clean, impute, filter, normalize or overwrite the source file.
- A successful profile is not evidence that the dataset is complete or suitable for a claim.
- Unsupported or ambiguous formats fail closed; add a reviewed adapter instead of guessing.

## Output

- `data-profile-<name>.json` artifact.
- Summary with row/column counts and warning count.
