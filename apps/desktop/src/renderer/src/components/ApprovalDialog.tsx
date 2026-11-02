import type { ApprovalRequest } from "../types";

/**
 * Blocking approval prompt for tools that need explicit user consent.
 *
 * Rendered by both the research shell and the IDE shell: approvals are raised
 * by Core regardless of which surface is visible, so hiding the dialog would
 * leave the pending tool call unreachable until it times out.
 */
export function ApprovalDialog({
  approval,
  busy,
  error,
  onRespond
}: {
  approval: ApprovalRequest | null;
  busy: boolean;
  error: string | null;
  onRespond: (approved: boolean) => void;
}) {
  if (!approval) return null;
  return (
    <div className="approval-backdrop">
      <div
        className="approval-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-title"
      >
        <span className="eyebrow">需要你的批准</span>
        <h2 id="approval-title">{approval.title}</h2>
        <p>{approval.detail}</p>
        <div className="approval-meta">
          <span>工具</span>
          <code>{approval.toolName}</code>
          <span>后果</span>
          <span>{approval.consequence ?? "执行该操作"}</span>
        </div>
        {error && (
          <div className="error-card" role="alert">
            <p>{error}</p>
          </div>
        )}
        <div className="approval-actions">
          <button
            type="button"
            className="quiet-button"
            disabled={busy}
            onClick={() => onRespond(false)}
          >
            拒绝
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => onRespond(true)}
          >
            {busy ? "处理中…" : "批准执行"}
          </button>
        </div>
        <p className="approval-note">
          Agent 不能替你做这个决定。超时或拒绝时工具不会执行。
        </p>
      </div>
    </div>
  );
}
