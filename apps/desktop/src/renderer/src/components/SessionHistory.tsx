import { useEffect, useRef, useState } from "react";
import { Icon, MenuItem, Popover } from "@research-workbench/ui";
import type { SessionSummary } from "../types";

export function SessionHistory({
  loadSessions,
  onOpenSession
}: {
  loadSessions: () => Promise<SessionSummary[]>;
  onOpenSession: (session: SessionSummary) => Promise<void>;
}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    []
  );
  const refresh = () => {
    const request = ++generation.current;
    setBusy(true);
    setError(null);
    void loadSessions()
      .then((next) => {
        if (request === generation.current) setSessions(next);
      })
      .catch((failure) => {
        if (request === generation.current)
          setError(failure instanceof Error ? failure.message : "读取会话失败");
      })
      .finally(() => {
        if (request === generation.current) setBusy(false);
      });
  };
  return (
    <Popover
      ariaLabel="历史会话"
      label={
        <>
          <Icon name="history" />
          历史
        </>
      }
      align="end"
      panelClassName="history-menu"
      onOpenChange={(open) => {
        if (open) refresh();
        else generation.current++;
      }}
    >
      {(close) => (
        <>
          <div className="ui-menu-header">
            <strong>历史会话</strong>
            {!busy && !error && <span>{sessions.length} 个</span>}
          </div>
          {busy && (
            <p className="ui-menu-note" role="status">
              读取会话…
            </p>
          )}
          {error && (
            <>
              <p className="ui-menu-note" role="alert">
                {error}
              </p>
              <MenuItem onClick={refresh}>
                <Icon name="refresh-cw" />
                重新读取
              </MenuItem>
            </>
          )}
          {!busy && !error && sessions.length === 0 && (
            <p className="ui-menu-note">还没有保存的会话。</p>
          )}
          {!busy &&
            !error &&
            sessions.map((session) => (
              <MenuItem
                key={session.file}
                className="history-row"
                onClick={() => {
                  close();
                  void onOpenSession(session);
                }}
              >
                <span className="ui-menu-item-copy">
                  <span title={session.title}>{session.title}</span>
                  <small>
                    {session.messages} 条
                    {session.startedAt
                      ? ` · ${new Date(session.startedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                      : ""}
                  </small>
                </span>
              </MenuItem>
            ))}
        </>
      )}
    </Popover>
  );
}
