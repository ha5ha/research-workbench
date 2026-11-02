import { createHash } from "node:crypto";

/**
 * Stable identifier for the active project.
 *
 * A project is the workspace directory chosen in the desktop app; there is no
 * separate project registry. Deriving the id from the absolute path keeps
 * `ResearchScope.projectId` honest (two different directories can never share
 * an id, and renaming the folder does not silently re-point history).
 */
export function projectIdFromWorkspace(workspaceRoot: string): string {
  const normalized = workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const digest = createHash("sha256")
    .update(normalized.toLowerCase())
    .digest("hex");
  return `ws-${digest.slice(0, 12)}`;
}
