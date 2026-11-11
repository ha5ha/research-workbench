import type { SkillImplementation } from "../registry.js";

/** Deterministic projections. They never approve, confirm, launch or mutate research records. */
export const runResearchRecords: SkillImplementation = async (manifest,input,context) => {
  const startedAt=new Date().toISOString();
  if (!context.tools.readResearchState) throw new Error("科研状态服务未接入或 Skill 未声明 research.read");
  const state=await context.tools.readResearchState();
  const warnings:string[]=[];
  const uncertain=state.runs.filter(run=>["failed","unknown","canceled"].includes(run.state));
  if(uncertain.length)warnings.push(`${uncertain.length} 个失败/未知/取消运行必须保留，不能升级为成功结果`);
  if(state.claims.some(claim=>claim.status!=="confirmed"))warnings.push("未确认结论只作为候选材料");
  let projection:unknown;
  switch(manifest.id){
    case "research-checkpoint": projection={compass:state.compass,runs:state.runs,claims:state.claims,decisions:state.decisions};break;
    case "research-evidence-ledger": projection={claims:state.claims,runs:state.runs.map(run=>({id:run.id,state:run.state,metrics:run.metrics,artifacts:run.artifacts,reason:run.reason}))};break;
    case "research-decision-log": projection={decisions:state.decisions,claims:state.claims.map(claim=>({id:claim.id,status:claim.status,sources:claim.sources}))};break;
    case "research-next-step": {
      const blocked=state.runs.filter(run=>run.state==="unknown");
      const active=state.runs.filter(run=>["preparing","running","collecting"].includes(run.state));
      const pending=state.claims.filter(claim=>claim.status==="proposed");
      projection={status:"proposal",action:blocked.length?"核对未知 Job，避免重复提交":active.length?"等待当前运行并检查日志":pending.length?"核对候选结论的支持与反证":state.compass.nextStep||"明确研究问题并建立 baseline",
        reason:blocked.length?"原 Job 可能仍在运行":active.length?"已有运行尚未完成":pending.length?"下一步应基于已核验来源":state.compass.nextStepReason||"缺少明确的下一步依据",
        stopConditions:state.compass.stopConditions,runIds:[...blocked,...active].map(run=>run.id),claimIds:pending.map(claim=>claim.id)};break;
    }
    default:throw new Error("未知科研记录 Skill");
  }
  const report={schemaVersion:1,skill:{id:manifest.id,version:manifest.version},generatedAt:startedAt,scope:input.scope,params:input.params,
    provenance:{plans:state.plans.map(plan=>({id:plan.id,digest:plan.digest,revision:plan.revision,codeHash:plan.codeHash,inputHash:plan.inputHash,environmentHash:plan.environmentHash})),runIds:state.runs.map(run=>run.id),claimIds:state.claims.map(claim=>claim.id),decisionIds:state.decisions.map(decision=>decision.id)},
    projection,warnings,boundary:"状态快照与行动建议，非科学有效性背书；confirmed 表示人工确认，未重新复算原始数据。"};
  const artifact=await context.tools.writeArtifact({name:`${manifest.id}.json`,content:JSON.stringify(report,null,2),mime:"application/json",kind:manifest.id});
  return {skillId:manifest.id,version:manifest.version,status:"succeeded",startedAt,finishedAt:new Date().toISOString(),artifacts:[artifact],summary:`已记录 ${state.runs.length} 个运行、${state.claims.length} 条结论和 ${state.decisions.length} 个决策。`,warnings};
};
