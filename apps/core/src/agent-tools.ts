import { z } from "zod";
import {
  ClaimProposalSchema,
  RunProposalSchema,
  type AgentDemoResponse,
  type AgentToolAuthorization,
  type AgentToolDefinition,
  type AgentToolResult,
  type AgentToolSchema,
  type ArtifactRef,
  type EvidenceClaim,
  type ResearchStateView,
  type ManagedPlan,
  type ResearchScope,
  type RunProposal
} from "@research-workbench/contracts";
import type { ApprovalRequest } from "./approval.js";
import type { CreateExperimentInput } from "./experiment-store.js";
import type { CommandResult, WorkspaceEntry } from "./workspace-service.js";

const createExperimentSchema = z.object({
  title: z.string(),
  goal: z.string(),
  hypothesis: z.string(),
  design: z.string(),
  metrics: z.string(),
  seeds: z.number()
});
const finishExperimentSchema = z.object({
  experimentId: z.string(),
  runId: z.string(),
  conclusion: z.string().optional(),
  reusable: z
    .object({
      kind: z.string(),
      description: z.string()
    })
    .optional(),
  curation: z
    .object({
      facts: z
        .array(
          z.object({
            statement: z.string(),
            kind: z
              .enum(["finding", "negative", "method", "constraint"])
              .optional(),
            importance: z.number().min(1).max(5).optional()
          })
        )
        .optional(),
      discarded: z
        .array(z.object({ what: z.string(), reason: z.string() }))
        .optional()
    })
    .optional()
});
export type AgentFinishExperimentInput = z.infer<typeof finishExperimentSchema>;
export interface AgentToolServices {
  profileData(
    path: string
  ): Promise<{ summary: string; warnings: string[]; artifacts: ArtifactRef[] }>;
  requestApproval(input: ApprovalRequest): Promise<boolean>;
  recordNote(input: { note: string }): Promise<ArtifactRef>;
  listFiles(): Promise<WorkspaceEntry[]>;
  readFile(path: string): Promise<string>;
  writeFile(
    path: string,
    content: string
  ): Promise<{ path: string; size: number }>;
  runCommand(command: string): Promise<CommandResult>;
  createExperiment(
    input: CreateExperimentInput
  ): Promise<{ experimentId: string; taskBookId: string }>;
  finishExperiment(
    input: AgentFinishExperimentInput
  ): Promise<{ experimentId: string; status: string }>;
  proposeRun?(input: RunProposal): Promise<ManagedPlan>;
  researchState?(): Promise<ResearchStateView>;
  proposeClaim?(
    input: z.infer<typeof ClaimProposalSchema>
  ): Promise<EvidenceClaim>;
}

const string = { type: "string" };
const number = { type: "number" };
const strings = { type: "array", items: string };
const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties)
): AgentToolSchema => ({ type: "object", properties, required });
const textResult = (text: string, details?: unknown): AgentToolResult => ({
  content: [{ type: "text", text }],
  details
});
const jsonResult = (details: unknown) =>
  textResult(JSON.stringify(details), details);
function tool<T>(
  name: string,
  label: string,
  description: string,
  parameters: AgentToolSchema,
  validator: { parse(input: unknown): T },
  execute: (input: T) => Promise<AgentToolResult>
): AgentToolDefinition {
  return {
    name,
    label,
    description,
    parameters,
    execute: (input) => execute(validator.parse(input))
  };
}

/** All product semantics, schemas and service callbacks belong to Core. */
export function createAgentTools(
  services: AgentToolServices
): AgentToolDefinition[] {
  const tools = [
    tool(
      "data_profile",
      "Data profile",
      "Profile a workspace CSV/TSV without exposing raw rows. Returns shape, missingness and artifact references.",
      object({ path: string }),
      z.object({ path: z.string() }),
      async ({ path }) => {
        const result = await services.profileData(path);
        return textResult(
          `${result.summary}\nWarnings: ${result.warnings.length ? result.warnings.join("; ") : "none"}`,
          result
        );
      }
    ),
    tool(
      "record_note",
      "Record research note",
      "Persist a durable research note as an artifact under the workspace permission policy.",
      object({ note: string }),
      z.object({ note: z.string() }),
      async (input) => {
        const artifact = await services.recordNote(input);
        return textResult(`研究笔记已写入 ${artifact.path}`, { artifact });
      }
    ),
    tool(
      "list_files",
      "List workspace files",
      "List workspace files and directories, excluding hidden metadata and dependency folders.",
      object({}),
      z.object({}),
      async () => {
        const entries = await services.listFiles();
        return textResult(
          entries.length
            ? entries
                .map(
                  (entry) =>
                    `${"  ".repeat(entry.depth)}${entry.type === "directory" ? "▸" : "·"} ${entry.path}`
                )
                .join("\n")
            : "(empty workspace)",
          { entries }
        );
      }
    ),
    tool(
      "read_file",
      "Read workspace file",
      "Read a workspace-relative UTF-8 text file.",
      object({ path: string }),
      z.object({ path: z.string() }),
      async ({ path }) => {
        const text = await services.readFile(path);
        return textResult(
          text.length > 60000
            ? `${text.slice(0, 60000)}\n… file output truncated at 60000 chars`
            : text,
          { path, size: text.length }
        );
      }
    ),
    tool(
      "write_file",
      "Write workspace file",
      "Write a workspace-relative UTF-8 file under the workspace permission policy.",
      object({ path: string, content: string }),
      z.object({ path: z.string(), content: z.string() }),
      async ({ path, content }) => {
        const result = await services.writeFile(path, content);
        return textResult(`已写入 ${result.path}（${result.size} B）`, result);
      }
    ),
    tool(
      "run_command",
      "Run terminal command",
      "Run an interactive coding shell command in the workspace root. Workspace-write mode requires human command approval. NEVER use for research compute; use request_run.",
      object({ command: string }),
      z.object({ command: z.string() }),
      async ({ command }) => {
        const result = await services.runCommand(command);
        return textResult(
          `exit=${result.exitCode ?? "?"} timedOut=${result.timedOut}\n${result.stdout || ""}${result.stderr ? `\n[stderr]\n${result.stderr}` : ""}`,
          result
        );
      }
    ),
    tool(
      "create_experiment",
      "Create experiment record",
      "Create a draft task book and experiment record for research compute, then request_run for one human review of the frozen plan. NEVER use for ordinary coding.",
      object({
        title: string,
        goal: string,
        hypothesis: string,
        design: string,
        metrics: string,
        seeds: number
      }),
      createExperimentSchema,
      async (input) => {
        const result = await services.createExperiment(input);
        return textResult(
          `实验 ${result.experimentId} 已创建，任务书 ${result.taskBookId}。`,
          result
        );
      }
    ),
    tool(
      "finish_experiment",
      "Finish experiment record",
      "Archive an existing succeeded managed run by experimentId and runId. Core re-verifies its artifacts and derives all metrics, seeds and artifact references. conclusion is a candidate interpretation, never human confirmation of a claim.",
      object(
        {
          experimentId: string,
          runId: string,
          conclusion: string,
          reusable: object({ kind: string, description: string }, [
            "kind",
            "description"
          ]),
          curation: object(
            {
              facts: {
                type: "array",
                items: object(
                  {
                    statement: string,
                    kind: {
                      type: "string",
                      enum: ["finding", "negative", "method", "constraint"]
                    },
                    importance: { type: "number", minimum: 1, maximum: 5 }
                  },
                  ["statement"]
                )
              },
              discarded: {
                type: "array",
                items: object({ what: string, reason: string })
              }
            },
            []
          )
        },
        ["experimentId", "runId"]
      ),
      finishExperimentSchema,
      async (input) => {
        const result = await services.finishExperiment(input);
        return textResult(
          `实验 ${result.experimentId} 已更新为 ${result.status}。`,
          result
        );
      }
    )
  ];
  const { proposeRun, researchState, proposeClaim } = services;
  if (proposeRun && researchState && proposeClaim)
    tools.push(
      tool(
        "research_state",
        "Read structured research state",
        "Read research goals, frozen plans, runs, evidence claims and human decisions before proposing the next experiment.",
        object({}),
        z.object({}),
        async () => jsonResult(await researchState())
      ),
      tool(
        "request_run",
        "Propose managed experiment run",
        "Propose a frozen Git experiment with inputs, output contract and budget. MUST use for research compute; human reviews and launches the plan. NEVER launch training through run_command. Outputs MUST be absent from the committed snapshot; inputs MUST NOT overwrite committed code.",
        object(
          {
            experimentId: string,
            command: string,
            timeoutSeconds: { type: "integer", minimum: 1, maximum: 86400 },
            inputs: strings,
            backend: { type: "string", enum: ["local", "ssh"] },
            host: string,
            remoteWorkdir: string,
            remotePython: string,
            baselineRunId: string,
            protocol: object({
              name: string,
              metric: string,
              direction: { type: "string", enum: ["minimize", "maximize"] },
              unit: string,
              dataset: string,
              environment: string,
              seeds: { type: "array", items: { type: "integer" } },
              metricsPath: string,
              requiredArtifacts: strings
            })
          },
          [
            "experimentId",
            "command",
            "timeoutSeconds",
            "inputs",
            "backend",
            "protocol"
          ]
        ),
        RunProposalSchema,
        async (input) => jsonResult(await proposeRun(input))
      ),
      tool(
        "propose_claim",
        "Propose evidence-linked claim",
        "Propose a candidate claim using existing verified run artifacts and exact sha256. Relation describes whether evidence supports or refutes the ENTIRE statement, never whether a run is the baseline. Both arms can support a comparison. MUST preserve limitations and genuine counterevidence; only the human can confirm.",
        object({
          statement: string,
          limitations: string,
          sources: {
            type: "array",
            items: object({
              runId: string,
              artifactPath: string,
              sha256: string,
              relation: { type: "string", enum: ["supports", "refutes"] }
            })
          }
        }),
        ClaimProposalSchema,
        async (input) => jsonResult(await proposeClaim(input))
      )
    );
  return tools;
}

/** Runtime calls this policy before executing any registered host tool. */
export async function authorizeAgentTool(
  services: AgentToolServices,
  name: string,
  input: Record<string, unknown>
): Promise<AgentToolAuthorization> {
  if (["list_files", "read_file", "research_state"].includes(name))
    return { allowed: true };
  const approval: ApprovalRequest =
    name === "record_note"
      ? {
          toolName: name,
          title: "记录研究笔记",
          detail:
            typeof input.note === "string"
              ? input.note
              : "Agent 请求写入研究笔记",
          consequence: "写入研究笔记 artifact，不修改原始数据"
        }
      : name === "write_file"
        ? {
            toolName: name,
            title: "写入工作区文件",
            detail:
              typeof input.path === "string" ? input.path : "(unknown path)",
            consequence: "覆盖或创建工作区文件；不会修改工作区之外的内容"
          }
        : name === "run_command"
          ? {
              toolName: name,
              title: "执行终端命令",
              detail:
                typeof input.command === "string"
                  ? input.command
                  : "(unknown command)",
              consequence: "在本地工作区执行 shell 命令，可能修改文件或访问网络"
            }
          : {
              toolName: name,
              title: "更新科研记录",
              detail: name,
              consequence: "写入工作区科研记录或分析产物"
            };
  const allowed = await services.requestApproval(approval);
  return {
    allowed,
    reason: allowed ? undefined : "用户拒绝、审批超时或权限策略拒绝；工具未执行"
  };
}

export function researchSystemPrompt(scope: ResearchScope): string {
  const label = [scope.projectId, scope.questionId, scope.taskId]
    .filter(Boolean)
    .join(" / ");
  return (
    "You are Research Workbench, a computational research agent. " +
    "RFC 2119 applies to MUST, REQUIRED, SHOULD, RECOMMENDED, MAY, OPTIONAL. NEVER and AVOID mean MUST NOT and SHOULD NOT respectively. " +
    "You NEVER approve runs, confirm claims or change permissions. " +
    `Current research scope: ${label}. ` +
    "Answer as a careful research collaborator. Use data_profile before making claims about data.csv. " +
    "Use list_files/read_file to inspect the workspace. write_file and run_command follow the user's permission level. " +
    "Before changing code, you MUST read AGENTS.md if present and follow its layout, style and verification rules; keep diffs minimal. " +
    "For research compute, you MUST create_experiment, then request_run with a frozen plan and wait for human approval and launch. " +
    "The frozen plan review includes its task book; NEVER ask for a separate task-book confirmation. NEVER execute research compute through run_command. " +
    "After launch, you MUST inspect research_state for terminal run status and verified artifacts before finish_experiment or propose_claim. " +
    "You MUST use tool-produced metrics, exact artifact paths and hashes. Derived numbers require a reproducible script/tool; NEVER calculate them mentally. " +
    "Claims MUST stay within the measured protocol; NEVER infer untested stability bounds, significance, generalization or optimality. " +
    "Evidence relation refers to the entire claim; NEVER mark baseline evidence as refuting merely because it is the comparison arm. " +
    "Ordinary coding uses file and command tools without creating an experiment. " +
    "Before a new experiment, you MUST check prior facts and runs; explain existing results instead of duplicating a tested hypothesis. " +
    "Use record_note for durable notes. NEVER claim a dataset is clean, complete or scientifically valid from a profile alone. " +
    "You NEVER approve runs, confirm claims or change permissions."
  );
}

/** Demo behavior belongs to the product host, never the generic adapter. */
export function researchDemoResponses(text: string): AgentDemoResponse[] {
  if (/实验|experiment/i.test(text))
    return [
      {
        toolCalls: [
          {
            name: "create_experiment",
            arguments: {
              title: "轻量增强三种子验证",
              goal: "验证轻量增强是否稳定改善跨域表现",
              hypothesis: "轻量增强在三个种子上均高于匹配基线",
              design: "三种子配对验证；固定预算；同一划分",
              metrics: "验证准确率",
              seeds: 3
            }
          }
        ]
      },
      {
        text: "实验记录和任务书已创建。运行命令与指标回填需要继续执行；当前记录状态为待决策。"
      }
    ];
  if (/笔记|note|记录/i.test(text))
    return [
      {
        toolCalls: [
          {
            name: "record_note",
            arguments: {
              note: "数据画像只描述表面统计特征，不能证明数据干净或科学有效。"
            }
          }
        ]
      },
      { text: "研究笔记已记录；写入经过工作区权限策略。" }
    ];
  if (/profile|画像|data\.csv|数据/i.test(text))
    return [
      {
        toolCalls: [{ name: "data_profile", arguments: { path: "data.csv" } }]
      },
      {
        text: "数据画像已完成。缺失和类型问题已记录到 artifact；这只是数据形状检查，不构成科学结论。"
      }
    ];
  return [
    {
      text: "pi 运行时已连接，当前没有真实模型凭据，处于演示模式。配置模型后可直接对话，也可输入“画像 data.csv”验证工具链路。"
    }
  ];
}
