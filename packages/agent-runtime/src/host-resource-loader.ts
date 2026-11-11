import {
  createExtensionRuntime,
  type Extension,
  type ResourceLoader
} from "@earendil-works/pi-coding-agent";
import type { AgentToolAuthorization } from "@research-workbench/contracts";

interface HostResourceOptions {
  systemPrompt(): string;
  toolNames: string[];
  authorizeToolCall(
    name: string,
    input: Record<string, unknown>
  ): Promise<AgentToolAuthorization>;
}

function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

/** SDK adapter containing only trusted in-memory host hooks; no resource discovery. */
export class HostResourceLoader implements ResourceLoader {
  private readonly extensions;

  constructor(private readonly options: HostResourceOptions) {
    const path = "<host:tool-policy>";
    const handlers: Extension["handlers"] = new Map();
    const allowedTools = new Set(options.toolNames);
    handlers.set("before_agent_start", [
      async () => ({ systemPrompt: options.systemPrompt() })
    ]);
    handlers.set("tool_call", [
      async (event: unknown) => {
        if (
          !isObject(event) ||
          typeof event.toolName !== "string" ||
          !allowedTools.has(event.toolName)
        ) {
          return { block: true, reason: "Host did not register this tool" };
        }
        if (!isObject(event.input))
          return { block: true, reason: "Tool input must be a JSON object" };
        const authorization = await options.authorizeToolCall(
          event.toolName,
          event.input
        );
        return authorization.allowed
          ? undefined
          : {
              block: true,
              reason: authorization.reason ?? "Host denied this tool"
            };
      }
    ]);
    const extension: Extension = {
      path,
      resolvedPath: path,
      sourceInfo: {
        path,
        source: "host",
        scope: "temporary",
        origin: "top-level"
      },
      handlers,
      tools: new Map(),
      messageRenderers: new Map(),
      commands: new Map(),
      flags: new Map(),
      shortcuts: new Map()
    };
    this.extensions = {
      extensions: [extension],
      errors: [],
      runtime: createExtensionRuntime()
    };
  }

  getExtensions() {
    return this.extensions;
  }
  getSkills() {
    return { skills: [], diagnostics: [] };
  }
  getPrompts() {
    return { prompts: [], diagnostics: [] };
  }
  getThemes() {
    return { themes: [], diagnostics: [] };
  }
  getAgentsFiles() {
    return { agentsFiles: [] };
  }
  getSystemPrompt() {
    return this.options.systemPrompt();
  }
  getSystemPromptSource() {
    return undefined;
  }
  getAppendSystemPrompt() {
    return [];
  }
  getAppendSystemPromptSources() {
    return [];
  }

  extendResources(
    paths: Parameters<ResourceLoader["extendResources"]>[0]
  ): void {
    if (
      paths.skillPaths?.length ||
      paths.promptPaths?.length ||
      paths.themePaths?.length
    ) {
      throw new Error(
        "External resources are disabled; the host must inject tools and context explicitly"
      );
    }
  }

  // There are no disk settings, resource paths, packages or modules to reload.
  async reload(): Promise<void> {
    this.extensions.runtime = createExtensionRuntime();
  }
}
