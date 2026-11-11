import { useCallback, useEffect, useState } from "react";
import type { LoopOverview } from "@research-workbench/contracts";

/** The Core ledger owns plans and runs; chat cards only reference their IDs. */
export function useResearchOverview(connected: boolean) {
  const [overview, setOverview] = useState<LoopOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!connected) return;
    const next = await window.rw.request<LoopOverview>("loop.overview");
    setOverview(next);
    setError(null);
    return next;
  }, [connected]);

  useEffect(() => {
    if (!connected) return;
    let active = true;
    const load = () =>
      void refresh().catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : String(reason));
      });
    load();
    const off = window.rw.onEvent((event) => {
      if (
        ["runs.changed", "agent.card", "agent.done"].includes(event.params.type)
      )
        load();
    });
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      off();
      clearInterval(timer);
    };
  }, [connected, refresh]);

  return { overview, refresh, error };
}
