import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, expect, it } from "vitest";
import { ResearchService, ExperimentStore, PermissionService, executionEnvironment } from "@research-workbench/core";
import { WorkspaceToolGateway } from "../../apps/core/src/workspace.js";
import { ExperimentService } from "../../apps/core/src/experiment-service.js";
const directories:string[]=[];
async function fixture(){const root=await mkdtemp(join(tmpdir(),"rw-integrity-"));directories.push(root);return root;}
afterEach(async()=>{for(const path of directories.splice(0)){if(!resolve(path).startsWith(resolve(tmpdir())+sep)||!path.includes("rw-integrity-"))throw new Error("unsafe cleanup");await rm(path,{recursive:true,force:true});}});
it("rejects junction writes before changing the target or creating descendants",async()=>{
  const root=await fixture(),outside=await fixture();
  await writeFile(join(outside,"sentinel.txt"),"original");
  await symlink(outside,join(root,"linked"),process.platform==="win32"?"junction":"dir");
  const gateway=new WorkspaceToolGateway(root);
  await expect(gateway.writeText("linked/sentinel.txt","changed")).rejects.toThrow("链接");
  await expect(gateway.writeText("linked/new/nested.txt","changed")).rejects.toThrow("链接");
  expect(await readFile(join(outside,"sentinel.txt"),"utf8")).toBe("original");
  await expect(readFile(join(outside,"new/nested.txt"))).rejects.toThrow();
  await gateway.writeText("safe/nested.txt","saved");expect(await gateway.readText("safe/nested.txt")).toBe("saved");
  await symlink(outside,join(root,".research"),process.platform==="win32"?"junction":"dir");
  expect(()=>new ExperimentStore(root)).toThrow("不能是链接");
});
it("does not pass provider credentials or Node injection settings to ordinary processes",()=>{
  const env=executionEnvironment("workspace",{PATH:"bin",RW_API_KEY:"fake-api-key",OPENAI_API_KEY:"fake-openai-key",NODE_OPTIONS:"--import=evil",SYSTEMROOT:"Windows"});
  expect(env.PATH).toBe("bin");expect(env.RW_API_KEY).toBeUndefined();expect(env.OPENAI_API_KEY).toBeUndefined();expect(env.NODE_OPTIONS).toBeUndefined();
  for (const tool of ["create_experiment","finish_experiment","data_profile","request_run","propose_claim","record_note"] as const) expect(()=>new PermissionService("read-only").assertAllowed(tool)).toThrow("权限拒绝");
});
it("keeps all concurrent research writes and blocks overwriting damaged storage",async()=>{
  const root=await fixture();const a=new ResearchService(root),b=new ResearchService(root);
  await Promise.all(Array.from({length:16},(_,i)=>(i%2?a:b).createTopic(`topic ${i}`)));
  expect(await a.tree()).toHaveLength(16);
  expect(JSON.parse(await readFile(join(root,".research/research.backup.json"),"utf8")).topics).toHaveLength(15);
  await writeFile(join(root,".research/research.json"),"{broken");
  await expect(b.createTopic("do not overwrite")).rejects.toThrow("阻止覆盖");
  expect(await readFile(join(root,".research/research.json"),"utf8")).toBe("{broken");
});
it("does not allow a second archive or edits to confirmed conclusions",async()=>{
  const root=await fixture();const store=new ExperimentStore(root);
  try {
    const record=store.create({title:"test",goal:"g",hypothesis:"h",design:"d",metrics:"m",seeds:1});
    expect(()=>store.finish(record.id,{},[])).toThrow("任务书");store.confirmTaskbook(record.id);
    store.finish(record.id,{conclusion:"original"},[]);store.update(record.id,{confirmed:true});
    expect(()=>store.finish(record.id,{conclusion:"overwrite"},[])).toThrow("不可覆盖");
    expect(()=>store.update(record.id,{conclusion:"overwrite"})).toThrow("不可覆盖");
    expect(store.get(record.id)?.conclusion).toBe("original");
  } finally {store.close();}
});
it("finds a changed file after eighty unchanged paths",async()=>{
  const root=await fixture();await mkdir(join(root,"files"));
  for(let i=0;i<100;i++)await writeFile(join(root,`files/${String(i).padStart(3,"0")}.txt`),"same");
  const service=new ExperimentService(root),session=await service.begin("terminal","change");
  await writeFile(join(root,"files/099.txt"),"changed");
  expect((await service.finish(session)).files.map(file=>file.path)).toContain("files/099.txt");
});
