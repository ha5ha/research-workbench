import type {
  RpcEventType,
  ApprovalInput as ApprovalRequest
} from "@research-workbench/contracts";
export type { ApprovalInput as ApprovalRequest } from "@research-workbench/contracts";
import { randomUUID } from "node:crypto";

interface PendingApproval {
  resolve: (approved: boolean) => void;
  timer: NodeJS.Timeout;
}

export class ApprovalBroker {
  private readonly pending = new Map<string, PendingApproval>();

  constructor(
    private readonly emitEvent: (type: RpcEventType, payload: unknown) => void,
    private readonly timeoutMs = 120_000
  ) {}

  request(input: ApprovalRequest): Promise<boolean> {
    const id = `approval-${randomUUID()}`;
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.emitEvent("agent.approval-timeout", { id, ...input });
        resolve(false);
      }, this.timeoutMs);

      this.pending.set(id, { resolve, timer });
      this.emitEvent("agent.approval-required", {
        id,
        ...input
      });
    });
  }

  respond(id: string, approved: boolean): boolean {
    const pending = this.pending.get(id);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    pending.resolve(approved);
    this.emitEvent("agent.approval-resolved", { id, approved });
    return true;
  }

  dispose(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.resolve(false);
    }
    this.pending.clear();
  }
}
