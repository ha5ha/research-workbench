import type {
  ActionSpec,
  ActionResult,
  DomainEvent,
  Observation,
  PolicyDecision,
  ResearchEnvironment,
  ResearchScope
} from "@research-workbench/contracts";

const ACTIONS: ActionSpec[] = [
  {
    id: "research.read-summary",
    title: "读取研究摘要",
    description: "读取当前课题的受控状态摘要，不修改任何记录。",
    risk: "read",
    approval: "auto"
  },
  {
    id: "research.request-observation",
    title: "提出候选观察",
    description: "由 Agent 提出候选观察，写入前必须由研究者确认。",
    risk: "write",
    approval: "required"
  }
];

export class InMemoryResearchEnvironment implements ResearchEnvironment {
  private readonly facts: string[];
  private readonly events: DomainEvent[] = [];

  constructor(
    private readonly projectId: string,
    private readonly projectTitle: string,
    facts: string[] = []
  ) {
    this.facts = [`课题：${projectTitle}`, ...facts];
  }

  async observe(scope: ResearchScope): Promise<Observation> {
    this.assertScope(scope);
    return {
      scope,
      summary: `${this.projectTitle} · ${this.facts.length} 条状态事实`,
      facts: [...this.facts],
      artifactCount: 0,
      actions: await this.listActions(scope)
    };
  }

  async listActions(scope: ResearchScope): Promise<ActionSpec[]> {
    this.assertScope(scope);
    return ACTIONS.map((action) => ({ ...action }));
  }

  async validate(
    scope: ResearchScope,
    actionId: string
  ): Promise<PolicyDecision> {
    this.assertScope(scope);
    const action = ACTIONS.find((candidate) => candidate.id === actionId);
    if (!action) {
      return {
        allowed: false,
        approvalRequired: false,
        reason: `未知动作：${actionId}`
      };
    }
    if (action.approval === "forbidden") {
      return {
        allowed: false,
        approvalRequired: false,
        reason: `${action.title} 被策略禁止`
      };
    }
    return {
      allowed: true,
      approvalRequired: action.approval === "required",
      reason:
        action.approval === "required"
          ? `${action.title} 需要研究者确认`
          : `${action.title} 可直接执行`
    };
  }

  async apply(
    scope: ResearchScope,
    actionId: string
  ): Promise<ActionResult> {
    this.assertScope(scope);
    const decision = await this.validate(scope, actionId);
    if (!decision.allowed) {
      return {
        actionId,
        status: "rejected",
        detail: decision.reason,
        events: []
      };
    }
    if (decision.approvalRequired) {
      return {
        actionId,
        status: "approval-required",
        detail: decision.reason,
        events: []
      };
    }
    const event: DomainEvent = {
      type: "domain.action.applied",
      at: new Date().toISOString(),
      payload: { actionId, projectId: scope.projectId }
    };
    this.events.push(event);
    return {
      actionId,
      status: "applied",
      detail: decision.reason,
      events: [event]
    };
  }

  snapshotEvents(): DomainEvent[] {
    return [...this.events];
  }

  private assertScope(scope: ResearchScope): void {
    if (scope.projectId !== this.projectId) {
      throw new Error(`未知课题：${scope.projectId}`);
    }
  }
}

export function createDemoEnvironment(options?: {
  projectId?: string;
  projectTitle?: string;
  facts?: string[];
}): InMemoryResearchEnvironment {
  return new InMemoryResearchEnvironment(
    options?.projectId ?? "project-demo",
    options?.projectTitle ?? "小样本分类的泛化研究",
    options?.facts ?? [
      "当前问题：数据增强能稳定改善跨域表现吗？",
      "当前子任务：三种子配对验证"
    ]
  );
}
