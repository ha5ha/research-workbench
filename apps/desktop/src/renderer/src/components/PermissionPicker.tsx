import type { PermissionLevel } from "../types";
import { Icon, type IconName } from "@research-workbench/ui";

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
  const icons: Record<typeof name, IconName> = {
    eye: "eye",
    edit: "pencil",
    unlock: "lock-open"
  };
  return <Icon name={icons[name]} />;
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
    <div
      className="perm-picker"
      role="radiogroup"
      aria-label="权限级别"
      onKeyDown={(event) => {
        if (
          disabled ||
          ![
            "ArrowDown",
            "ArrowUp",
            "ArrowRight",
            "ArrowLeft",
            "Home",
            "End"
          ].includes(event.key)
        )
          return;
        event.preventDefault();
        const current = PERMISSION_LEVELS.findIndex(
          (item) => item.id === value
        );
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? PERMISSION_LEVELS.length - 1
              : (current +
                  (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1) +
                  PERMISSION_LEVELS.length) %
                PERMISSION_LEVELS.length;
        onChange(PERMISSION_LEVELS[next]!.id);
        event.currentTarget
          .querySelectorAll<HTMLButtonElement>('[role="radio"]')
          .item(next)
          ?.focus();
      }}
    >
      {PERMISSION_LEVELS.map((item) => (
        <button
          type="button"
          key={item.id}
          role="radio"
          aria-checked={value === item.id}
          tabIndex={value === item.id ? 0 : -1}
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
              <Icon name="check" />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
