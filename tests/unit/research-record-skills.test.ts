import { expect,it } from "vitest";
import { runResearchRecords } from "../../packages/research-skills/src/builtins/research-records.js";
import type { LoopOverview,SkillContext,SkillManifest } from "@research-workbench/contracts";
const state:LoopOverview={compass:{goal:"goal",constraints:"cpu",stopConditions:"stop on invalid",nextStep:"baseline",nextStepReason:"measure first",updatedAt:""},plans:[],runs:[{id:"job-unknown",planId:"p",experimentId:"e",state:"unknown",attempt:1,idempotencyKey:"k",jobToken:"t",pid:null,createdAt:"",startedAt:null,finishedAt:null,exitCode:null,reason:"network lost",metrics:{},artifacts:[],cancelRequested:false}],claims:[],decisions:[]};
const input={scope:{projectId:"project"},artifacts:[],params:{}};
const manifest=(id:string):SkillManifest=>({id,name:id,description:"record",version:"0.2.0",lastReviewed:"2026-11-10",allowedTools:["research.read","artifact.write"],status:"runnable",path:"skill"});
it.each(["research-checkpoint","research-evidence-ledger","research-decision-log","research-next-step"])("%s preserves provenance and returns an artifact only",async id=>{
  let body="";
  const context:SkillContext={scope:input.scope,workspaceRoot:"root",params:{},tools:{readText:async()=>{throw new Error("unused");},readResearchState:async()=>structuredClone(state),writeArtifact:async artifact=>{body=String(artifact.content);return {id:"artifact",path:".research/artifact.json",sha256:"a".repeat(64),size:body.length,mime:artifact.mime,kind:artifact.kind,createdAt:new Date().toISOString()};}}};
  const result=await runResearchRecords(manifest(id),input,context);
  expect(result.status).toBe("succeeded");expect(result.artifacts).toHaveLength(1);
  const report=JSON.parse(body);expect(report.provenance.runIds).toEqual(["job-unknown"]);expect(report.skill.version).toBe("0.2.0");
  if(id==="research-next-step")expect(report.projection.action).toContain("核对未知");
  if(id==="research-checkpoint")expect(report.projection.runs[0].state).toBe("unknown");
  expect(state.runs[0]?.state).toBe("unknown");
});
it("fails when state is unavailable or artifact storage fails",async()=>{
  const context:SkillContext={scope:input.scope,workspaceRoot:"root",params:{},tools:{readText:async()=>"",writeArtifact:async()=>{throw new Error("storage failed");}}};
  await expect(runResearchRecords(manifest("research-checkpoint"),input,context)).rejects.toThrow("未接入");
  context.tools.readResearchState=async()=>state;
  await expect(runResearchRecords(manifest("research-checkpoint"),input,context)).rejects.toThrow("storage failed");
});
