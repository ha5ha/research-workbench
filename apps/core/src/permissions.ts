export type PermissionMode = "ask" | "allow" | "deny";

export interface PermissionSettings {
  fileWrite: PermissionMode;
  command: PermissionMode;
  gitCommit: PermissionMode;
  note: PermissionMode;
}

export const DEFAULT_PERMISSIONS: PermissionSettings = {
  fileWrite: "ask",
  command: "ask",
  gitCommit: "ask",
  note: "ask"
};

export class PermissionService {
  private settings: PermissionSettings;

  constructor(initial?: Partial<PermissionSettings>) {
    this.settings = { ...DEFAULT_PERMISSIONS, ...initial };
  }

  configure(input: Partial<PermissionSettings>): PermissionSettings {
    this.settings = { ...this.settings, ...input };
    return { ...this.settings };
  }

  snapshot(): PermissionSettings {
    return { ...this.settings };
  }

  modeForTool(toolName: string): PermissionMode {
    if (toolName === "workspace.write" || toolName === "write_file") {
      return this.settings.fileWrite;
    }
    if (toolName === "terminal.run" || toolName === "run_command") {
      return this.settings.command;
    }
    if (toolName === "git.commit") {
      return this.settings.gitCommit;
    }
    if (toolName === "record_note") {
      return this.settings.note;
    }
    return "ask";
  }
}
