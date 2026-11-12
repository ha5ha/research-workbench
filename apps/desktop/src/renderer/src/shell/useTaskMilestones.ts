import { useCallback, useEffect, useRef, useState } from "react";
import type { Milestone } from "@research-workbench/contracts";

export function useTaskMilestones(taskId: string | undefined, tick: number) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const version = useRef(0);
  const activeTask = useRef(taskId);
  activeTask.current = taskId;
  const refreshMilestones = useCallback(async () => {
    if (activeTask.current !== taskId) return;
    const request = ++version.current;
    try {
      const result = await window.rw.request("milestones.list", {
        taskId,
        limit: 8
      });
      if (request === version.current && activeTask.current === taskId)
        setMilestones(result.milestones);
    } catch {
      if (request === version.current) setMilestones([]);
    }
  }, [taskId]);
  useEffect(() => {
    const requestVersion = version;
    setMilestones([]);
    void refreshMilestones();
    return () => {
      requestVersion.current++;
    };
  }, [refreshMilestones, tick]);
  return { milestones, refreshMilestones };
}
