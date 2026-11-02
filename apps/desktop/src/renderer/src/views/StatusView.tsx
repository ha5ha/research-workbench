import type { CoreStatus, Hello, Observation, SkillInfo } from "../types";
import type { RpcEvent } from "@research-workbench/contracts";

/**
 * System-level view: what Core reports about the workspace and its skills.
 *
 * This is deliberately not a research view — research state lives in the left
 * tree and the right inspector. Keeping only one list of skills (here) removes
 * the duplication that previously existed between this page and the inspector.
 */
export function StatusView({
  observation,
  skills,
  events,
  hello,
  status,
  refresh
}: {
  observation: Observation | null;
  skills: SkillInfo[];
  events: RpcEvent[];
  hello: Hello | null;
  status: CoreStatus;
  refresh: () => Promise<void>;
}) {
  const online = status.state === "online";
  return (
    <div className="page-view">
      <div className="page-heading">
        <div>
          <span className="eyebrow">系统状态</span>
          <h1>{observation?.summary ?? "当前项目状态"}</h1>
          <p>工作区、Core 连接、Skills 与运行事件</p>
        </div>
        <button
          type="button"
          className="quiet-button"
          onClick={() => void refresh()}
        >
          刷新
        </button>
      </div>

      <div className="section-title">
        <h2>Core</h2>
        <span className={`tag ${online ? "green" : "amber"}`}>
          {online ? "在线" : "等待"}
        </span>
      </div>
      <div className="fact-card">
        <p>{observation?.summary ?? "等待 Core 返回研究状态…"}</p>
        <ul>
          <li>工作区：{hello?.workspaceRoot ?? "等待 Core 返回"}</li>
          <li>Core：{status.message}</li>
          <li>连接状态：{status.state}</li>
        </ul>
      </div>

      <div className="section-title">
        <h2>已注册 Skills</h2>
        <span className="muted">{skills.length}</span>
      </div>
      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>版本</th>
              <th>状态</th>
              <th>工具</th>
            </tr>
          </thead>
          <tbody>
            {skills.map((skill) => (
              <tr key={skill.id}>
                <td>
                  <strong>{skill.id}</strong>
                  <small>{skill.description}</small>
                </td>
                <td className="mono">v{skill.version}</td>
                <td>
                  <span
                    className={`tag ${skill.status === "runnable" ? "green" : "amber"}`}
                  >
                    {skill.status === "runnable" ? "可执行" : "计划中"}
                  </span>
                </td>
                <td className="mono">{skill.allowedTools.join(", ")}</td>
              </tr>
            ))}
            {skills.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <span className="muted">尚未读取到 skill。</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="section-title">
        <h2>运行事件</h2>
        <span className="muted">{events.length}</span>
      </div>
      <div className="event-list page-events">
        {events.length === 0 && (
          <div className="empty-note">运行 Agent 或工具后这里会出现事件。</div>
        )}
        {events
          .slice()
          .reverse()
          .map((event) => (
            <div className="event-row" key={event.params.seq}>
              <span className="event-seq">{event.params.seq}</span>
              <div>
                <strong>{event.params.type}</strong>
                <small>
                  {new Date(event.params.at).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                  })}
                </small>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
