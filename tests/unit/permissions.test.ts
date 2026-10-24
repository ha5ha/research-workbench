import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERMISSIONS,
  PermissionService
} from "@research-workbench/core";

describe("PermissionService", () => {
  it("maps tool names to configurable permission modes", () => {
    const permissions = new PermissionService();
    expect(permissions.modeForTool("write_file")).toBe(
      DEFAULT_PERMISSIONS.fileWrite
    );
    permissions.configure({ command: "allow", fileWrite: "deny" });
    expect(permissions.modeForTool("run_command")).toBe("allow");
    expect(permissions.modeForTool("terminal.run")).toBe("allow");
    expect(permissions.modeForTool("write_file")).toBe("deny");
    expect(permissions.modeForTool("workspace.write")).toBe("deny");
    expect(permissions.snapshot().gitCommit).toBe("ask");
  });
});
