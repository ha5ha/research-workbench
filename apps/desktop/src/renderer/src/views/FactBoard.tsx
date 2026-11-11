import { Button } from "@research-workbench/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Fact, FactStatus } from "../types";

const GROUPS: Array<{ status: FactStatus; label: string; hint: string }> = [
  { status: "proposed", label: "待确认", hint: "Agent 写下但还没有证据或签字" },
  { status: "supported", label: "有证据", hint: "至少有一次运行支撑" },
  { status: "confirmed", label: "已确认", hint: "你签过字，可以作为结论引用" },
  { status: "refuted", label: "已反驳", hint: "被后续实验推翻；保留以免重犯" }
];

const KIND_LABEL: Record<string, string> = {
  finding: "发现",
  negative: "负结果",
  method: "方法",
  constraint: "约束"
};

/**
 * Topic-level fact board: a review surface, not a workflow step. The agent
 * writes facts while archiving; the researcher confirms or refutes them here.
 */
export function FactBoard({ topicId }: { topicId?: string }) {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.rw.request<{ facts: Fact[] }>("facts.list", {
        topicId
      });
      setFacts(result.facts);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "读取事实失败");
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<FactStatus, Fact[]>();
    for (const group of GROUPS) map.set(group.status, []);
    for (const fact of facts) map.get(fact.status)?.push(fact);
    return map;
  }, [facts]);

  const setStatus = async (id: string, status: FactStatus) => {
    setBusyId(id);
    try {
      const updated = await window.rw.request<Fact>("facts.update", {
        id,
        status
      });
      setFacts((current) =>
        current.map((fact) => (fact.id === updated.id ? updated : fact))
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "更新事实失败");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page-view">
      <div className="page-heading">
        <div>
          <span className="eyebrow">课题</span>
          <h1>事实黑板</h1>
          <p>
            Agent
            在归档时写下的事实与负结果。它能提议，只有你能确认——确认后的条目会成为后续研究的默认前提。
          </p>
        </div>
        <Button variant="default" type="button" onClick={() => void load()}>
          刷新
        </Button>
      </div>

      {error && (
        <div className="error-card" role="alert">
          <p>{error}</p>
        </div>
      )}

      {loading && <div className="empty-note">读取事实…</div>}

      {!loading && facts.length === 0 && (
        <div className="empty-state">
          <strong>还没有事实</strong>
          <p>
            让 Agent 跑一次实验并在归档时写下结论，这里就会出现待确认的条目。
          </p>
        </div>
      )}

      {GROUPS.map((group) => {
        const items = grouped.get(group.status) ?? [];
        if (items.length === 0) return null;
        return (
          <section className="fact-group" key={group.status}>
            <div className="section-title">
              <h2>
                {group.label} <span className="muted">{items.length}</span>
              </h2>
              <span className="muted">{group.hint}</span>
            </div>
            <div className="fact-board">
              {items.map((fact) => (
                <article className={`fact-row ${fact.status}`} key={fact.id}>
                  <div className="fact-main">
                    <div className="fact-tags">
                      <span className="tag">
                        {KIND_LABEL[fact.kind] ?? fact.kind}
                      </span>
                      <span className="muted">权重 {fact.importance}</span>
                      {fact.runId && (
                        <span className="muted">来源 {fact.runId}</span>
                      )}
                    </div>
                    <p>{fact.statement}</p>
                  </div>
                  <div className="fact-actions">
                    {fact.status !== "confirmed" && (
                      <Button
                        variant="primary"
                        type="button"

                        disabled={busyId === fact.id}
                        onClick={() => void setStatus(fact.id, "confirmed")}
                      >
                        确认
                      </Button>
                    )}
                    {fact.status !== "refuted" && (
                      <Button
                        variant="default"
                        type="button"

                        disabled={busyId === fact.id}
                        onClick={() => void setStatus(fact.id, "refuted")}
                      >
                        反驳
                      </Button>
                    )}
                    {fact.status === "proposed" && (
                      <Button
                        variant="default"
                        type="button"

                        disabled={busyId === fact.id}
                        onClick={() => void setStatus(fact.id, "supported")}
                      >
                        标记有证据
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
