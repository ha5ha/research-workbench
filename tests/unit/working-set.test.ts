import { describe, expect, it } from "vitest";
import { buildWorkingSet } from "@research-workbench/core";

describe("buildWorkingSet", () => {
  it("anchors the turn on topic, question and task", () => {
    const text = buildWorkingSet({
      topic: { id: "TP-01", title: "小样本泛化", description: "跨域是否稳定" },
      question: { id: "R-01", title: "增强是否有效", status: "active" },
      task: { id: "T-03", title: "三种子验证", status: "active" }
    });
    expect(text).toContain("[Working set]");
    expect(text).toContain("TP-01 小样本泛化 / R-01 增强是否有效 / T-03 三种子验证");
    expect(text).toContain("Topic note: 跨域是否稳定");
  });

  it("ranks confirmed and important facts first", () => {
    const text = buildWorkingSet({
      facts: [
        { statement: "临时观察", kind: "finding", importance: 1, status: "proposed" },
        { statement: "关键结论", kind: "finding", importance: 5, status: "confirmed" },
        { statement: "失败过", kind: "negative", importance: 4, status: "supported" }
      ]
    });
    const indexConfirmed = text.indexOf("关键结论");
    const indexTentative = text.indexOf("临时观察");
    expect(indexConfirmed).toBeGreaterThan(-1);
    expect(indexConfirmed).toBeLessThan(indexTentative);
  });

  it("uses none for empty sections and hides finished tasks", () => {
    const text = buildWorkingSet({
      openTasks: [
        { id: "T-01", title: "已完成的任务", status: "done" },
        { id: "T-02", title: "进行中的任务", status: "active" }
      ]
    });
    expect(text).toContain("- none");
    expect(text).toContain("T-02 进行中的任务 (active)");
    expect(text).not.toContain("T-01 已完成的任务");
  });

  it("truncates long lines so the block stays small", () => {
    const text = buildWorkingSet({
      facts: [
        {
          statement: "长".repeat(400),
          kind: "finding",
          importance: 3,
          status: "proposed"
        }
      ]
    });
    const factLine = text
      .split("\n")
      .find((line) => line.startsWith("- [proposed]"));
    expect(factLine).toBeDefined();
    expect((factLine ?? "").length).toBeLessThan(180);
    expect(factLine).toContain("…");
  });
});
