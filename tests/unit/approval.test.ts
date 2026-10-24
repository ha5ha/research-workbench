import { describe, expect, it } from "vitest";
import { ApprovalBroker } from "../../apps/core/src/approval.js";

describe("approval broker", () => {
  it("emits a request and resolves it with the user's decision", async () => {
    const events: Array<{ type: string; payload: unknown }> = [];
    const broker = new ApprovalBroker((type, payload) =>
      events.push({ type, payload })
    );

    const decision = broker.request({
      toolName: "record_note",
      title: "记录研究笔记",
      detail: "写入一条 artifact"
    });

    expect(events[0]?.type).toBe("agent.approval-required");
    const payload = events[0]?.payload as { id: string };
    expect(broker.respond(payload.id, true)).toBe(true);
    await expect(decision).resolves.toBe(true);
    expect(broker.respond(payload.id, false)).toBe(false);
    expect(events.at(-1)?.type).toBe("agent.approval-resolved");
    broker.dispose();
  });

  it("rejects unknown approvals", () => {
    const broker = new ApprovalBroker(() => {});
    expect(broker.respond("missing", true)).toBe(false);
    broker.dispose();
  });
});
