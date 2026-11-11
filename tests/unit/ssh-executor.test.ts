import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, expect, it } from "vitest";
import { RunProposalSchema, type ManagedPlan, type ManagedRun } from "@research-workbench/contracts";
import { SshExecutor } from "../../apps/core/src/ssh-executor.js";

const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0)){
  if(!resolve(root).startsWith(resolve(tmpdir())+sep)||!root.includes("rw-ssh-"))throw new Error("unsafe fixture cleanup");
  await rm(root,{recursive:true,force:true});
}});
function plan():ManagedPlan {
  const proposal=RunProposalSchema.parse({experimentId:"test",command:"python3 check.py",timeoutSeconds:10,inputs:[],backend:"ssh",host:"lab-host",
    remoteWorkdir:"/workdir/project/jobs",remotePython:"/opt/env/bin/python",
    protocol:{name:"audit",metric:"mae",direction:"minimize",unit:"",dataset:"fixed",environment:"test",seeds:[17],metricsPath:"results/metrics.json",requiredArtifacts:[]}});
  return {id:"plan-test",version:1,proposal,taskbookHash:"a".repeat(64),revision:"b".repeat(40),codeHash:"c".repeat(64),inputHash:"d".repeat(64),
    environmentHash:"e".repeat(64),comparableGroup:"f".repeat(64),files:[],digest:"0".repeat(64),approvedAt:null,closure:null,createdAt:new Date().toISOString()};
}
const run={id:"job-11111111-1111-1111-1111-111111111111",jobToken:"fixture-only",cancelRequested:false} as ManagedRun;

it("freezes absolute remote paths and refuses traversal or ambiguous directories",()=>{
  const base=plan().proposal;
  for(const remoteWorkdir of ["/","relative/jobs","/workdir/../other","/workdir//jobs","/workdir/jobs/","/workdir\\jobs","/workdir\n/jobs"]){
    expect(RunProposalSchema.safeParse({...base,remoteWorkdir}).success,remoteWorkdir).toBe(false);
  }
  expect(RunProposalSchema.safeParse({...base,remotePython:"python3; echo invalid"}).success).toBe(false);
  expect(RunProposalSchema.safeParse({...base,remotePython:"python3"}).success).toBe(true);
});

it("sends snapshot hashes and selected directory through the fixed transport payload",async()=>{
  const root=await mkdtemp(join(tmpdir(),"rw-ssh-"));roots.push(root);
  const p=plan(); const content="print('fixture')\n";
  p.files=[{path:"check.py",sha256:createHash("sha256").update(content).digest("hex"),size:Buffer.byteLength(content)}];
  await mkdir(join(root,".research/jobs",run.id,"source"),{recursive:true});
  await writeFile(join(root,".research/jobs",run.id,"source/check.py"),content);
  let called=false;
  const executor=new SshExecutor(root,async(host,command,payload)=>{
    called=true;expect(host).toBe("lab-host");expect(command.startsWith("'/opt/env/bin/python' -c '")).toBe(true);
    expect(command).not.toContain("/workdir/project/jobs");
    expect(payload).toMatchObject({action:"submit",workdir:"/workdir/project/jobs",id:run.id,files:[{sha256:p.files[0]!.sha256,content:Buffer.from(content).toString("base64")}]});
    return {submitted:true};
  });
  await executor.submit(run,p);expect(called).toBe(true);
  p.proposal.host="lab; touch rejected";
  await expect(executor.submit(run,p)).rejects.toThrow("主机别名");
});

it("collects only requested evidence and refuses additional remote file paths",async()=>{
  const root=await mkdtemp(join(tmpdir(),"rw-ssh-"));roots.push(root);const p=plan();
  const executor=new SshExecutor(root,async()=>({status:{runId:run.id},files:[{path:"source/results/metrics.json",content:Buffer.from('[{"seed":17,"mae":1}]').toString('base64')}]}));
  await executor.sync(run,p);
  expect(await readFile(join(root,".research/jobs",run.id,"source/results/metrics.json"),"utf8")).toContain('"seed":17');
  const rejected=new SshExecutor(root,async()=>({status:{runId:run.id},files:[{path:"../../outside.txt",content:"eA=="}]}));
  await expect(rejected.sync(run,p)).rejects.toThrow("未经请求");
});
