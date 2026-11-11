import { Button } from "@research-workbench/ui";
import { useEffect, useRef } from "react";
import type { ManagedPlan, ManagedRun } from "@research-workbench/contracts";
import { PlanReview } from "./PlanReview";

/** Native modal provides focus containment, Escape and return-to-trigger behavior. */
export function PlanReviewDialog({
  plan,
  connected,
  onClose,
  onChanged,
  onAskAgent
}: {
  plan: ManagedPlan;
  connected: boolean;
  onClose: () => void;
  onChanged: (run?: ManagedRun) => Promise<void>;
  onAskAgent: (prompt: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (trigger?.isConnected) trigger.focus();
      else
        document.querySelector<HTMLTextAreaElement>(".composer-input")?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="plan-review-dialog"
      aria-labelledby="plan-dialog-title"
      onCancel={onClose}
      onClose={onClose}
    >
      <header>
        <div>
          <span className="eyebrow">冻结方案</span>
          <h2 id="plan-dialog-title">审阅运行方案</h2>
        </div>
        <Button
          variant="default"

          onClick={onClose}
          aria-label="关闭方案审阅"
        >
          关闭
        </Button>
      </header>
      <PlanReview
        plan={plan}
        title={plan.proposal.experimentId}
        connected={connected}
        onAskAgent={(prompt) => {
          onClose();
          onAskAgent(prompt);
        }}
        onDismissed={async () => {
          await onChanged();
          onClose();
        }}
        onStarted={async (run) => {
          await onChanged(run);
          onClose();
        }}
      />
    </dialog>
  );
}
