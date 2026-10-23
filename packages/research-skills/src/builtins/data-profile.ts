import { basename } from "node:path";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import type {
  SkillContext,
  SkillManifest,
  SkillRunInput,
  SkillRunResult
} from "@research-workbench/contracts";

const DataProfileParamsSchema = z.object({
  path: z.string().min(1),
  delimiter: z.enum([",", "\t"]).optional()
});

type CsvRow = string[];

interface ColumnProfile {
  name: string;
  inferredType:
    | "integer"
    | "number"
    | "boolean"
    | "date"
    | "string"
    | "empty";
  nonEmpty: number;
  missing: number;
  missingRate: number;
  uniqueCount: number;
}

export async function runDataProfile(
  manifest: SkillManifest,
  input: SkillRunInput,
  context: SkillContext
): Promise<SkillRunResult> {
  const startedAt = new Date().toISOString();
  const params = DataProfileParamsSchema.parse(input.params);
  const text = await context.tools.readText(params.path);
  const delimiter =
    params.delimiter ??
    (params.path.toLowerCase().endsWith(".tsv") ? "\t" : ",");

  let rows: CsvRow[];
  try {
    rows = parse(text, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      delimiter,
      trim: false
    }) as CsvRow[];
  } catch (error) {
    throw new Error(
      `CSV 解析失败：${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (rows.length === 0) {
    throw new Error("输入文件没有可分析的表头");
  }

  const header = rows[0] ?? [];
  if (header.length === 0) {
    throw new Error("输入文件没有列");
  }

  const warnings: string[] = [];
  const normalizedHeader = header.map((value, index) => {
    const name = value.trim();
    if (name.length === 0) {
      warnings.push(`第 ${index + 1} 列没有列名，使用 column_${index + 1}`);
      return `column_${index + 1}`;
    }
    return name;
  });

  const seen = new Set<string>();
  for (const name of normalizedHeader) {
    if (seen.has(name)) warnings.push(`重复列名：${name}`);
    seen.add(name);
  }

  const dataRows = rows.slice(1);
  let raggedRows = 0;
  for (const row of dataRows) {
    if (row.length !== normalizedHeader.length) raggedRows += 1;
  }
  if (raggedRows > 0) {
    warnings.push(`${raggedRows} 行的列数与表头不一致（已按空值处理）`);
  }

  const columns: ColumnProfile[] = normalizedHeader.map((name, index) => {
    const rawValues = dataRows.map((row) => row[index] ?? "");
    const values = rawValues.map((value) => value.trim());
    const nonEmptyValues = values.filter((value) => value.length > 0);
    const missing = values.length - nonEmptyValues.length;
    return {
      name,
      inferredType: inferType(nonEmptyValues),
      nonEmpty: nonEmptyValues.length,
      missing,
      missingRate:
        values.length === 0 ? 0 : round(missing / values.length, 3),
      uniqueCount: new Set(nonEmptyValues).size
    };
  });

  if (dataRows.length < 3) {
    warnings.push(`数据行仅 ${dataRows.length} 行，不足以据此做稳定判断`);
  }
  for (const column of columns) {
    if (dataRows.length > 0 && column.missingRate > 0.2) {
      warnings.push(
        `${column.name} 缺失率 ${(column.missingRate * 100).toFixed(1)}%`
      );
    }
  }

  const report = {
    schemaVersion: "0.1",
    generatedAt: startedAt,
    source: {
      path: params.path,
      delimiter
    },
    rowCount: dataRows.length,
    columnCount: columns.length,
    columns,
    warnings,
    boundary:
      "仅描述已读取文件的形状、缺失和类型猜测；未验证语义、单位、代表性和科学有效性。"
  };

  const artifact = await context.tools.writeArtifact({
    name: `data-profile-${safeName(basename(params.path))}.json`,
    content: `${JSON.stringify(report, null, 2)}\n`,
    mime: "application/json",
    kind: "data-profile"
  });

  return {
    skillId: manifest.id,
    version: manifest.version,
    status: "succeeded",
    startedAt,
    finishedAt: new Date().toISOString(),
    artifacts: [artifact],
    summary: `已分析 ${dataRows.length} 行 × ${columns.length} 列；${warnings.length} 个提醒。`,
    warnings
  };
}

function inferType(values: string[]): ColumnProfile["inferredType"] {
  if (values.length === 0) return "empty";
  if (values.every((value) => /^-?\d+$/.test(value))) return "integer";
  if (
    values.every(
      (value) =>
        /^-?(?:\d+\.?\d*|\.\d+)$/.test(value) && Number.isFinite(Number(value))
    )
  ) {
    return "number";
  }
  if (values.every((value) => /^(?:true|false)$/i.test(value))) return "boolean";
  if (values.every((value) => /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.+-Z]+)?$/.test(value))) {
    return "date";
  }
  return "string";
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "data";
}
