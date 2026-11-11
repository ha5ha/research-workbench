/** Runtime-neutral JSON schema. SDK schema types stay inside their adapter. */
export interface AgentToolSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface AgentToolResult {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
}

export interface AgentToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: AgentToolSchema;
  execute(input: Record<string, unknown>): Promise<AgentToolResult>;
}

/** Deterministic host-owned fixture responses, independent of an SDK message. */
export type AgentJsonValue =
  string | number | boolean | null | AgentJsonObject | AgentJsonValue[];
export interface AgentJsonObject {
  [key: string]: AgentJsonValue;
}
export interface AgentDemoResponse {
  text?: string;
  toolCalls?: Array<{ name: string; arguments: AgentJsonObject }>;
}

export interface AgentToolAuthorization {
  allowed: boolean;
  reason?: string;
}
