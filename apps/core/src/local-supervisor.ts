/** Registered, trusted Node supervisor. No database or model credentials in this process. */
export const LOCAL_SUPERVISOR = String.raw`
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, existsSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
const directory = process.argv[2];
const config = JSON.parse(readFileSync(join(directory, 'job.json'), 'utf8'));
const statePath = join(directory, 'status.json');
let child;
let closing = false;
let reason = null;
let terminationError = null;
let lastKillAttempt = 0;
let outputBytes = 0;
const startedAt = new Date().toISOString();
let writes = Promise.resolve();
function save(state, code = null) {
  const body = {runId: config.runId, token: config.token, state, pid:process.pid,
    startedAt, heartbeatAt:new Date().toISOString(), finishedAt: state === 'running' ? null : new Date().toISOString(), exitCode:code, reason, terminationError};
  writes = writes.then(async () => {
    writeFileSync(statePath + '.tmp', JSON.stringify(body));
    for (let attempt=0; ; attempt++) {
      try { renameSync(statePath + '.tmp', statePath); break; }
      catch(error) {
        if (!['EACCES','EPERM','EBUSY'].includes(error.code) || attempt>=99) throw error;
        await new Promise(resolve=>setTimeout(resolve,20));
      }
    }
  }).catch(error => { process.stderr.write('status persistence failed: '+error.message+'\n'); process.exitCode=1; });
}
function kill(why) {
  if (closing || Date.now()-lastKillAttempt<1000) return;
  lastKillAttempt = Date.now(); reason = why;
  if (!child?.pid) return;
  try {
    if (process.platform === 'win32') execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {windowsHide:true, stdio:'ignore', timeout:5000});
    else process.kill(-child.pid, 'SIGKILL');
    closing = true; terminationError = null;
  } catch {
    terminationError = '进程树终止失败，保留根进程并重试';
    // Killing only the Windows shell would orphan its research subprocesses and
    // lose the root PID needed for a later tree termination attempt.
    if (process.platform !== 'win32') {
      try { closing = child.kill('SIGKILL'); } catch {}
    }
  }
}
const stdout = createWriteStream(join(directory, 'stdout.log'), {flags:'a'});
const stderr = createWriteStream(join(directory, 'stderr.log'), {flags:'a'});
const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh';
const args = process.platform === 'win32' ? ['-NoProfile','-NonInteractive','-Command',config.command] : ['-c',config.command];
try {
  child = spawn(shell, args, {cwd:join(directory,'source'),env:{...process.env, RW_RUN_ID:config.runId, RW_REVISION:config.revision},
    windowsHide:true, detached:process.platform !== 'win32'});
  save('running');
  function append(stream, input, chunk) {
    outputBytes += chunk.length;
    if (outputBytes > config.maxOutputBytes) { kill('output-budget'); return; }
    if (!stream.write(chunk)) input.pause();
  }
  stdout.on('drain', () => child.stdout?.resume());
  stderr.on('drain', () => child.stderr?.resume());
  child.stdout.on('data', chunk => append(stdout, child.stdout, chunk));
  child.stderr.on('data', chunk => append(stderr, child.stderr, chunk));
  const poll = setInterval(() => {
    if (existsSync(join(directory, 'cancel.json'))) kill('canceled');
    if (Date.now() - Date.parse(startedAt) >= config.timeoutSeconds * 1000) kill('timeout');
    save('running');
  }, 250);
  child.on('error', error => { reason = error.message; });
  child.on('close', code => {
    clearInterval(poll);
    let flushed = 0;
    const finish = () => { if (++flushed === 2) save(reason === 'canceled' ? 'canceled' : code === 0 && !reason ? 'completed' : 'failed', code); };
    stdout.end(finish); stderr.end(finish);
  });
} catch(error) { reason = error.message; save('failed'); stdout.end(); stderr.end(); }
`;
