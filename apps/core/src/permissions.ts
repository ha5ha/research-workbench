/**
 * Access level for the agent, mirroring the mature-agent convention:
 * a level replaces per-action prompts, and the level is the user's consent.
 *
 * - `read-only`      : the agent may inspect the workspace, nothing else.
 * - `workspace-write`: the agent may edit files inside the workspace. Because a
 *                      shell command cannot be confined to a directory the way
 *                      a file write can, each command is still confirmed once.
 * - `full-access`    : writes and commands run without asking.
 *
 * Actions the human performs in the IDE (saving a file, running a command,
 * committing) are never gated here: the person performing them is the consent.
 */
export type PermissionLevel = "read-only" | "workspace-write" | "full-access";

export const PERMISSION_LEVELS: PermissionLevel[] = [
  "read-only",
  "workspace-write",
  "full-access"
];

export const DEFAULT_PERMISSION_LEVEL: PermissionLevel = "workspace-write";

export function isPermissionLevel(value: unknown): value is PermissionLevel {
  return (
    value === "read-only" ||
    value === "workspace-write" ||
    value === "full-access"
  );
}

export interface PermissionSnapshot {
  level: PermissionLevel;
}

/** Tools whose effect the agent must be allowed to perform at this level. */
export type GatedTool = "write_file" | "run_command" | "record_note" | "create_experiment" | "finish_experiment" | "data_profile" | "request_run" | "propose_claim";

const GATED_TOOLS: GatedTool[] = ["write_file", "run_command", "record_note", "create_experiment", "finish_experiment", "data_profile", "request_run", "propose_claim"];

export function isGatedTool(tool: string): tool is GatedTool {
  return (GATED_TOOLS as string[]).includes(tool);
}

export class PermissionService {
  private current: PermissionLevel;

  constructor(initial?: PermissionLevel | string) {
    this.current = isPermissionLevel(initial)
      ? initial
      : DEFAULT_PERMISSION_LEVEL;
  }

  level(): PermissionLevel {
    return this.current;
  }

  assertAllowed(tool: GatedTool): void {
    if (!this.allows(tool)) throw new Error(`权限拒绝：只读模式不能执行 ${tool}`);
  }

  configure(input: { level?: unknown }): PermissionSnapshot {
    if (isPermissionLevel(input.level)) {
      this.current = input.level;
    }
    return this.snapshot();
  }

  snapshot(): PermissionSnapshot {
    return { level: this.current };
  }

  /** Whether the agent may perform this tool at the current level. */
  allows(tool: string): boolean {
    if (!isGatedTool(tool)) return true;
    return this.current !== "read-only";
  }

  /** Whether the agent must additionally confirm a single call. */
  requiresConfirmation(tool: string): boolean {
    if (!isGatedTool(tool)) return false;
    if (this.current !== "workspace-write") return false;
    return tool === "run_command";
  }
}
