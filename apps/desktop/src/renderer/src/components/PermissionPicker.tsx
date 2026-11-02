import type { PermissionLevel } from "../types";

export const PERMISSION_LEVELS: Array<{
  id: PermissionLevel;
  title: string;
  detail: string;
  icon: "eye" | "edit" | "unlock";
}> = [
  {
    id: "read-only",
    title: "仅可查看",
    detail: "Agent 只能读取工作区；写入与命令会被拒绝。",
    icon: "eye"
  },
  {
    id: "workspace-write",
    title: "工作区内修改",
    detail: "Agent 可以修改工作区内的文件；终端命令执行前仍需一次确认。",
    icon: "edit"
  },
  {
    id: "full-access",
    title: "完全权限",
    detail: "写入与命令都不再逐次确认；文件写入仍限制在当前项目目录内。",
    icon: "unlock"
  }
];

function LevelIcon({ name }: { name: "eye" | "edit" | "unlock" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.6 3.2 3.9v4.2c0 3 2 5.4 4.8 6.2 2.8-.8 4.8-3.2 4.8-6.2V3.9L8 1.6Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {name === "eye" && (
        <circle cx="8" cy="7.8" r="1.9" stroke="currentColor" strokeWidth="1.2" />
      )}
      {name === "edit" && (
        <path
          d="m5.9 9.9 3.6-3.6 1.2 1.2-3.6 3.6-1.5.3.3-1.5Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      )}
      {name === "unlock" && (
        <path
          d="M6.3 9.7V8.2a1.7 1.7 0 0 1 3.4 0v1.5M6 9.7h4v2.6H6z"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/**
 * Three-level access selector, matching the mature-agent convention: the level
 * is standing consent, so there is no per-category "ask / allow / deny" grid.
 */
export function PermissionPicker({
  value,
  onChange,
  disabled
}: {
  value: PermissionLevel;
  onChange: (level: PermissionLevel) => void;
  disabled?: boolean;
}) {
  return (
    <div className="perm-picker" role="radiogroup" aria-label="权限级别">
      {PERMISSION_LEVELS.map((item) => (
        <button
          type="button"
          key={item.id}
          role="radio"
          aria-checked={value === item.id}
          className={`perm-row ${value === item.id ? "selected" : ""}`}
          disabled={disabled}
          onClick={() => onChange(item.id)}
        >
          <span className="perm-icon">
            <LevelIcon name={item.icon} />
          </span>
          <span className="perm-copy">
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
          </span>
          {value === item.id && (
            <span className="perm-check" aria-hidden="true">
              ✓
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
