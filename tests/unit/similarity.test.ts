import { describe, expect, it } from "vitest";
import { rankSimilar, similarity, tokenize } from "@research-workbench/core";

describe("similarity", () => {
  it("tokenises latin words and CJK bigrams", () => {
    const tokens = tokenize("学习率 1e-4 无效");
    expect(tokens).toContain("1e-4");
    expect(tokens).toContain("学习");
    expect(tokens).toContain("习率");
  });

  it("scores related statements higher than unrelated ones", () => {
    const base = "验证学习率 1e-4 是否有效";
    const related = "学习率 1e-4 无效，瓶颈不在学习率";
    const unrelated = "更换数据增强策略提升泛化";
    expect(similarity(base, related)).toBeGreaterThan(
      similarity(base, unrelated)
    );
  });

  it("ranks candidates and drops weak matches", () => {
    const matches = rankSimilar("验证学习率 1e-4 是否有效", [
      { id: "F-01", text: "学习率 1e-4 无效", kind: "fact:negative" },
      { id: "RUN-002", text: "数据增强对比实验", kind: "run" },
      { id: "RUN-003", text: "学习率扫描 1e-4 / 1e-3", kind: "run" }
    ]);
    expect(matches[0]?.id).toBe("F-01");
    expect(matches.map((match) => match.id)).not.toContain("RUN-002");
    expect(matches[0]?.score).toBeGreaterThan(0.1);
  });

  it("returns nothing for empty input", () => {
    expect(rankSimilar("", [{ id: "F-01", text: "学习率" }])).toEqual([]);
    expect(similarity("", "学习率")).toBe(0);
  });
});
