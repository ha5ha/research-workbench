import { describe, expect, it } from "vitest";
import { createDemoEnvironment } from "@research-workbench/domain";

const scope = {
  projectId: "project-demo",
  questionId: "Q-01",
  taskId: "T-02"
};

describe("InMemoryResearchEnvironment", () => {
  it("returns a bounded observation and typed actions", async () => {
    const environment = createDemoEnvironment();
    const observation = await environment.observe(scope);

    expect(observation.facts.length).toBeGreaterThan(0);
    expect(observation.actions.map((action) => action.id)).toContain(
      "research.request-observation"
    );
    expect(observation.actions.every((action) => action.risk)).toBe(true);
  });

  it("does not apply a write action without approval", async () => {
    const environment = createDemoEnvironment();
    const decision = await environment.validate(
      scope,
      "research.request-observation"
    );
    expect(decision.allowed).toBe(true);
    expect(decision.approvalRequired).toBe(true);

    const result = await environment.apply(
      scope,
      "research.request-observation"
    );
    expect(result.status).toBe("approval-required");
    expect(result.events).toHaveLength(0);
  });

  it("rejects a write to another project", async () => {
    const environment = createDemoEnvironment();
    await expect(
      environment.observe({ projectId: "project-other" })
    ).rejects.toThrow("未知课题");
  });
});
