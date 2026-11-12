import { useEffect, useState } from "react";
import type {
  CoreStatus,
  ApprovalRequest
} from "@research-workbench/contracts";
export function useCoreEvents(setError: (message: string | null) => void) {
  const [status, setStatus] = useState<CoreStatus>({
    state: "starting",
    message: "正在连接研究服务"
  });
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [recordCount, setRecordCount] = useState(0);
  const [milestoneTick, setMilestoneTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const offEvent = window.rw.onEvent(({ params }) => {
      if (params.type === "agent.approval-required") {
        setApproval(params.payload);
        setApprovalError(null);
      } else if (
        params.type === "agent.approval-resolved" ||
        params.type === "agent.approval-timeout"
      ) {
        setApproval((current) =>
          current?.id === params.payload.id ? null : current
        );
      } else if (params.type === "experiments.changed") {
        setRecordCount(params.payload.count);
      } else if (params.type === "schedule.digest") {
        setMilestoneTick((tick) => tick + 1);
      } else if (
        params.type === "skill.failed" ||
        params.type === "git.auto-commit-failed"
      ) {
        setError(params.payload.message);
      }
    });
    const offStatus = window.rw.onStatus(setStatus);
    void window.rw.status().then((next) => {
      if (alive && next) setStatus(next);
    });
    return () => {
      alive = false;
      offEvent();
      offStatus();
    };
  }, [setError]);
  const respondApproval = async (approved: boolean) => {
    if (!approval || approvalBusy) return;
    setApprovalBusy(true);
    setApprovalError(null);
    try {
      await window.rw.request("approval.respond", {
        id: approval.id,
        approved
      });
      setApproval(null);
    } catch (failure) {
      setApprovalError(
        failure instanceof Error ? failure.message : "审批响应失败"
      );
    } finally {
      setApprovalBusy(false);
    }
  };

  return {
    status,
    approval,
    approvalBusy,
    approvalError,
    respondApproval,
    recordCount,
    setRecordCount,
    milestoneTick
  };
}
