import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERMISSION_LEVEL,
  PermissionService
} from "@research-workbench/core";

describe("PermissionService", () => {
  it("denies unregistered tools at every permission level", () => {
    for (const level of ["read-only", "workspace-write", "full-access"]) {
      const permissions = new PermissionService(level);
      expect(permissions.allows("future_write_tool")).toBe(false);
      expect(permissions.allows("toString")).toBe(false);
    }
  });
  it("defaults to workspace-write", () => {
    const permissions = new PermissionService();
    expect(permissions.level()).toBe(DEFAULT_PERMISSION_LEVEL);
    expect(permissions.level()).toBe("workspace-write");
  });

  it("denies every gated tool in read-only", () => {
    const permissions = new PermissionService("read-only");
    expect(permissions.allows("write_file")).toBe(false);
    expect(permissions.allows("run_command")).toBe(false);
    expect(permissions.allows("record_note")).toBe(false);
    expect(permissions.requiresConfirmation("run_command")).toBe(false);
  });

  it("allows workspace writes but confirms commands in workspace-write", () => {
    const permissions = new PermissionService("workspace-write");
    expect(permissions.allows("write_file")).toBe(true);
    expect(permissions.allows("run_command")).toBe(true);
    expect(permissions.requiresConfirmation("write_file")).toBe(false);
    expect(permissions.requiresConfirmation("run_command")).toBe(true);
  });

  it("stops asking at full-access", () => {
    const permissions = new PermissionService("full-access");
    expect(permissions.allows("write_file")).toBe(true);
    expect(permissions.allows("run_command")).toBe(true);
    expect(permissions.requiresConfirmation("run_command")).toBe(false);
  });

  it("never gates read-only tools", () => {
    const permissions = new PermissionService("read-only");
    expect(permissions.allows("read_file")).toBe(true);
    expect(permissions.requiresConfirmation("list_files")).toBe(false);
  });

  it("configures a level and ignores invalid input", () => {
    const permissions = new PermissionService();
    expect(permissions.configure({ level: "read-only" })).toEqual({
      level: "read-only"
    });
    permissions.configure({ level: "nope" });
    expect(permissions.snapshot()).toEqual({ level: "read-only" });
  });
});
