import type { PermissionLevel } from "@research-workbench/contracts";

export type ToolPolicy = {
  effect: "read" | "write" | "execute";
  requiredPermission: PermissionLevel;
};

export const TOOL_POLICIES = {
  list_files: { effect: "read", requiredPermission: "read-only" },
  read_file: { effect: "read", requiredPermission: "read-only" },
  research_state: { effect: "read", requiredPermission: "read-only" },
  write_file: { effect: "write", requiredPermission: "workspace-write" },
  record_note: { effect: "write", requiredPermission: "workspace-write" },
  create_experiment: { effect: "write", requiredPermission: "workspace-write" },
  finish_experiment: { effect: "write", requiredPermission: "workspace-write" },
  data_profile: { effect: "write", requiredPermission: "workspace-write" },
  request_run: { effect: "write", requiredPermission: "workspace-write" },
  propose_claim: { effect: "write", requiredPermission: "workspace-write" },
  run_command: { effect: "execute", requiredPermission: "workspace-write" }
} as const satisfies Record<string, ToolPolicy>;

export type AgentToolName = keyof typeof TOOL_POLICIES;
export function toolPolicy(name: string): ToolPolicy | undefined {
  return Object.hasOwn(TOOL_POLICIES, name)
    ? TOOL_POLICIES[name as AgentToolName]
    : undefined;
}
