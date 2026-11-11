import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import {
  RemoteDirectorySchema,
  RemotePythonSchema,
  SSH_ERROR_MESSAGES,
  type ManagedPlan,
  type ManagedRun,
  type SshConnectionIdentity
} from "@research-workbench/contracts";
import { executionEnvironment } from "./execution-env.js";
import { workspacePath, atomicWorkspaceWrite } from "./workspace.js";

export const REMOTE_SUPERVISOR = String.raw`
import json, os, signal, subprocess, sys, time
from pathlib import Path
directory = Path(sys.argv[1]); config = json.loads((directory/'job.json').read_text())
started = time.time(); reason = None
def stamp():
    import datetime
    return datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')
started_at = stamp()
def save(state, code=None):
    body = dict(runId=config['runId'], token=config['token'], state=state, pid=os.getpid(), startedAt=started_at,
                heartbeatAt=stamp(), finishedAt=None if state=='running' else stamp(), exitCode=code, reason=reason)
    temp=directory/'status.tmp'; temp.write_text(json.dumps(body)); temp.replace(directory/'status.json')
allowed = ['PATH','HOME','LANG','LC_ALL','VIRTUAL_ENV','CONDA_PREFIX','CUDA_VISIBLE_DEVICES']
env = {key:os.environ[key] for key in allowed if key in os.environ}
env.update(RW_RUN_ID=config['runId'],RW_REVISION=config['revision'])
with open(directory/'stdout.log','ab',buffering=0) as out, open(directory/'stderr.log','ab',buffering=0) as err:
    try:
        process=subprocess.Popen(['/bin/sh','-c',config['command']],cwd=directory/'source',env=env,stdout=out,stderr=err,start_new_session=True)
        save('running')
        while process.poll() is None:
            if (directory/'cancel.json').exists(): reason='canceled'
            elif time.time()-started >= config['timeoutSeconds']: reason='timeout'
            elif (directory/'stdout.log').stat().st_size+(directory/'stderr.log').stat().st_size > config['maxOutputBytes']: reason='output-budget'
            if reason:
                try: os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError: pass
                process.wait(); break
            save('running'); time.sleep(.25)
        save('canceled' if reason=='canceled' else 'completed' if process.returncode==0 and not reason else 'failed',process.returncode)
    except Exception as error:
        reason=str(error); save('failed')
`;

/** A fixed trusted bootstrap; payload stays on stdin and never enters a shell expression. */
export const REMOTE_TRANSPORT = String.raw`
import base64, hashlib, json, os, re, subprocess, sys
from pathlib import Path
request=json.load(sys.stdin)
identifier=request['id']
if not re.fullmatch(r'job-[a-f0-9-]{36}',identifier): raise ValueError('invalid job id')
action=request['action']
if action not in ['submit','inspect','cancel']: raise ValueError('invalid action')
base=Path(request.get('workdir') or str(Path.home()/'.local/share/research-workbench/jobs'))
if not base.is_absolute() or base==Path('/') or '..' in base.parts: raise ValueError('invalid job root')
parent=Path(base.anchor)
for component in base.parts[1:]:
    parent=parent/component
    if parent.is_symlink(): raise ValueError('base directory link rejected')
    if action=='submit': parent.mkdir(exist_ok=True,mode=0o700)
directory=base/identifier
if base.is_symlink() or directory.is_symlink(): raise ValueError('job directory link rejected')
def target(name):
    path=Path(name)
    if not name or path.is_absolute() or '..' in path.parts or '\\' in name: raise ValueError('invalid path')
    result=directory/path
    parent=directory
    for part in path.parts:
        parent=parent/part
        if parent.is_symlink(): raise ValueError('link rejected')
    return result
if action=='submit':
    if directory.exists():
        config=json.loads((directory/'job.json').read_text())
        if config['token']!=request['token']: raise ValueError('job identity mismatch')
        print(json.dumps({'existing':True})); sys.exit(0)
    directory.mkdir(mode=0o700)
    for file in request['files']:
        path=target('source/'+file['path']); path.parent.mkdir(parents=True,exist_ok=True)
        content=base64.b64decode(file['content'],validate=True)
        if hashlib.sha256(content).hexdigest()!=file['sha256']: raise ValueError('snapshot hash mismatch')
        path.write_bytes(content)
        if hashlib.sha256(path.read_bytes()).hexdigest()!=file['sha256']: raise ValueError('uploaded hash mismatch')
        path.chmod(0o700 if file.get('executable') else 0o600)
    target('job.json').write_text(json.dumps(request['config']))
    target('supervisor.py').write_text(request['supervisor'])
    with open(directory/'supervisor.log','ab') as log:
        subprocess.Popen([sys.executable,str(directory/'supervisor.py'),str(directory)],stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
    print(json.dumps({'submitted':True,'python':sys.version.split()[0]})); sys.exit(0)
config=json.loads(target('job.json').read_text())
if config['token']!=request['token']: raise ValueError('job identity mismatch')
if action=='cancel':
    target('cancel.json').write_text(json.dumps({'token':request['token']})); print('{}'); sys.exit(0)
status=json.loads(target('status.json').read_text())
files=[]; total=0
if status['state']!='running':
    for name in request['paths']+['stdout.log','stderr.log']:
        try:
            path=target(name)
            if path.is_file() and path.stat().st_size <= 128*1024*1024:
                content=path.read_bytes(); total+=len(content)
                if total>256*1024*1024: raise ValueError('collection budget exceeded')
                files.append({'path':name,'content':base64.b64encode(content).decode()})
        except FileNotFoundError: pass
print(json.dumps({'status':status,'files':files}))
`;

export interface RemoteExecutor {
  connectionIdentity?(host: string): SshConnectionIdentity | undefined;
  validateConnection?(plan: ManagedPlan): void;
  submit(run: ManagedRun, plan: ManagedPlan): Promise<void>;
  sync(run: ManagedRun, plan: ManagedPlan): Promise<void>;
  cancel(run: ManagedRun, plan: ManagedPlan): Promise<void>;
}
/** Trusted Core-only injection; never selected through RPC or an Agent tool. */
export type SshRequestTransport = (
  host: string,
  command: string,
  payload: unknown
) => Promise<unknown>;
export class SshExecutor implements RemoteExecutor {
  constructor(
    private readonly root: string,
    private readonly transport?: SshRequestTransport,
    private readonly identity?: (
      host: string
    ) => SshConnectionIdentity | undefined
  ) {}
  connectionIdentity(host: string): SshConnectionIdentity | undefined {
    return this.identity?.(host);
  }
  validateConnection(plan: ManagedPlan): void {
    const current = this.identity?.(plan.proposal.host!);
    if (JSON.stringify(plan.sshConnection) !== JSON.stringify(current))
      throw new Error(SSH_ERROR_MESSAGES.SSH_IDENTITY_CHANGED);
  }
  async submit(run: ManagedRun, plan: ManagedPlan): Promise<void> {
    const files = [];
    for (const file of plan.files)
      files.push({
        ...file,
        content: (
          await readFile(
            await workspacePath(
              this.root,
              `.research/jobs/${run.id}/source/${file.path}`
            )
          )
        ).toString("base64")
      });
    await this.request(plan, {
      action: "submit",
      id: run.id,
      token: run.jobToken,
      files,
      supervisor: REMOTE_SUPERVISOR,
      config: {
        runId: run.id,
        token: run.jobToken,
        command: plan.proposal.command,
        revision: plan.revision,
        timeoutSeconds: plan.proposal.timeoutSeconds,
        maxOutputBytes: plan.proposal.maxOutputBytes
      }
    });
  }
  async sync(run: ManagedRun, plan: ManagedPlan): Promise<void> {
    if (run.cancelRequested) await this.cancel(run, plan);
    const paths = [
      ...new Set([
        plan.proposal.protocol.metricsPath,
        ...plan.proposal.protocol.requiredArtifacts
      ])
    ].map((path) => `source/${path}`);
    const result = (await this.request(plan, {
      action: "inspect",
      id: run.id,
      token: run.jobToken,
      paths
    })) as { status: unknown; files: Array<{ path: string; content: string }> };
    await atomicWorkspaceWrite(
      this.root,
      `.research/jobs/${run.id}/status.json`,
      JSON.stringify(result.status)
    );
    const permitted = new Set([...paths, "stdout.log", "stderr.log"]);
    for (const file of result.files) {
      if (!permitted.has(file.path))
        throw new Error("远端返回了未经请求的产物路径");
      await atomicWorkspaceWrite(
        this.root,
        `.research/jobs/${run.id}/${file.path}`,
        Buffer.from(file.content, "base64")
      );
    }
  }
  async cancel(run: ManagedRun, plan: ManagedPlan): Promise<void> {
    await this.request(plan, {
      action: "cancel",
      id: run.id,
      token: run.jobToken
    });
  }
  private request(
    plan: ManagedPlan,
    payload: Record<string, unknown>
  ): Promise<unknown> {
    const host = plan.proposal.host!;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(host))
      throw new Error("只允许已配置 SSH 主机别名");
    const current = this.identity?.(host);
    this.validateConnection(plan);
    const python = RemotePythonSchema.parse(
      plan.proposal.remotePython ?? "python3"
    );
    const workdir =
      plan.proposal.remoteWorkdir === undefined
        ? undefined
        : RemoteDirectorySchema.parse(plan.proposal.remoteWorkdir);
    const request = { ...payload, workdir };
    const encoded = Buffer.from(REMOTE_TRANSPORT).toString("base64");
    const remote = `'${python.replaceAll("'", "'\\''")}' -c 'import base64;exec(base64.b64decode("${encoded}"))'`;
    if (this.transport && (!this.identity || current))
      return this.transport(host, remote, request);
    return new Promise((resolve, reject) => {
      const child = spawn(
        "ssh",
        [
          "-T",
          "-oBatchMode=yes",
          "-oStrictHostKeyChecking=yes",
          "-oConnectTimeout=10",
          "--",
          host,
          remote
        ],
        {
          env: {
            ...executionEnvironment(this.root),
            ...(process.env.SSH_AUTH_SOCK
              ? { SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK }
              : {})
          },
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"]
        }
      );
      const output: Buffer[] = [];
      let size = 0;
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(
          new Error("SSH 响应超时；原 Job 状态未知，请核对，不要重新提交")
        );
      }, 30000);
      child.stdout.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 384 * 1024 * 1024) {
          child.kill();
          reject(new Error("SSH 回收内容超限"));
        } else output.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-2000);
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`SSH 不可达或 host key/环境校验失败：${stderr}`));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(output).toString()));
        } catch {
          reject(new Error("SSH 返回数据无效"));
        }
      });
      child.stdin.on("error", () => {});
      child.stdin.end(JSON.stringify(request));
    });
  }
}
