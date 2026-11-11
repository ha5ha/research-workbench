import assert from "node:assert/strict";
import { generateKeyPairSync, createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createInterface } from "node:readline";

const repo = process.cwd();
const coreRequire = createRequire(join(repo, "apps/core/package.json"));
const { Server, utils } = coreRequire("ssh2");
const secret = "packaging-fixture-only-NOT-A-REAL-CREDENTIAL";
const key = generateKeyPairSync("rsa", {
  modulusLength: 2048
}).privateKey.export({ type: "pkcs1", format: "pem" });
const pin = `SHA256:${createHash("sha256").update(utils.parseKey(key).getPublicSSH()).digest("base64").replace(/=+$/, "")}`;
const clients = new Set();
let submissions = 0;
const jobs = new Map();
const server = new Server({ hostKeys: [key] }, (client) => {
  clients.add(client);
  client.on("error", () => {});
  client.on("close", () => clients.delete(client));
  client.on("authentication", (context) => {
    if (
      context.method === "password" &&
      context.username === "fixture" &&
      context.password === secret
    )
      context.accept();
    else context.reject(["password"]);
  });
  client.on("ready", () =>
    client.on("session", (accept) =>
      accept().on("exec", (acceptExec, _reject, info) => {
        assert.ok(info.command.includes("base64.b64decode"));
        assert.ok(!info.command.includes(secret));
        const stream = acceptExec();
        let payload = "";
        stream.on("data", (chunk) => {
          payload += chunk.toString();
        });
        stream.on("end", () => {
          const request = JSON.parse(payload);
          assert.ok(!payload.includes(secret));
          let result;
          if (request.action === "submit") {
            submissions += 1;
            for (const file of request.files)
              assert.equal(
                createHash("sha256")
                  .update(Buffer.from(file.content, "base64"))
                  .digest("hex"),
                file.sha256
              );
            jobs.set(request.id, request);
            result = { submitted: true };
          } else {
            const original = jobs.get(request.id);
            assert.ok(original);
            assert.equal(request.token, original.token);
            const now = new Date().toISOString();
            result = {
              status: {
                runId: request.id,
                token: request.token,
                state: "completed",
                pid: 123,
                startedAt: now,
                heartbeatAt: now,
                finishedAt: now,
                exitCode: 0,
                reason: null
              },
              files: [
                {
                  path: "source/results/metrics.json",
                  content: Buffer.from(
                    JSON.stringify([{ seed: 1, score: 7 }])
                  ).toString("base64")
                },
                {
                  path: "stdout.log",
                  content: Buffer.from("fixture completed\n").toString("base64")
                }
              ]
            };
          }
          stream.write(JSON.stringify(result));
          stream.exit(0);
          stream.end();
        });
      })
    )
  );
});
await new Promise((done, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", done);
});
const profile = {
  id: "ssh-packaging-fixture",
  label: "Packaging fixture",
  hostname: "127.0.0.1",
  port: server.address().port,
  username: "fixture",
  hostKeySha256: pin,
  revision: 1
};
const root = await mkdtemp(join(tmpdir(), "rw-native-ssh-package-"));
const git =
  process.platform === "win32" ? "C:/Program Files/Git/cmd/git.exe" : "git";
let processOutput = "",
  child;
const pending = new Map();
let sequence = 0;
function startCore() {
  child = spawn(
    process.execPath,
    [
      join(repo, "apps/desktop/resources/core/cli.mjs"),
      "--workspace",
      root,
      "--skills-dir",
      join(repo, "apps/desktop/resources/skills")
    ],
    {
      windowsHide: true,
      cwd: root,
      env: Object.fromEntries(
        Object.entries(process.env).filter(([key]) =>
          [
            "PATH",
            "PATHEXT",
            "SYSTEMROOT",
            "WINDIR",
            "COMSPEC",
            "TEMP",
            "TMP",
            "HOME",
            "USERPROFILE",
            "APPDATA",
            "LOCALAPPDATA"
          ].includes(key.toUpperCase())
        )
      )
    }
  );
  child.stderr.on("data", (data) => {
    processOutput += data;
  });
  createInterface({ input: child.stdout }).on("line", (line) => {
    processOutput += line;
    const message = JSON.parse(line),
      request = pending.get(String(message.id));
    if (request) {
      pending.delete(String(message.id));
      clearTimeout(request.timer);
      message.error
        ? request.reject(new Error(message.error.message))
        : request.resolve(message.result);
    }
  });
}
function request(method, params) {
  const id = String(++sequence);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("packaged Core request timed out"));
    }, 15_000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`
    );
  });
}
async function stopCore() {
  if (!child || child.exitCode !== null) return;
  const done = new Promise((resolve) => child.once("exit", resolve));
  child.stdin.end();
  await done;
}
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (entry.isFile())
      assert.ok(
        !(await readFile(path)).includes(Buffer.from(secret)),
        "credential persisted in fixture workspace"
      );
  }
}
try {
  execFileSync(git, ["init", root], { windowsHide: true, stdio: "ignore" });
  await writeFile(join(root, "experiment.py"), "print('fixture')\n");
  for (const args of [
    ["add", "experiment.py"],
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "fixture"
    ]
  ])
    execFileSync(git, ["-C", root, ...args], {
      windowsHide: true,
      stdio: "ignore"
    });
  startCore();
  await request("system.hello");
  assert.deepEqual(
    await request("$private.ssh.probe", {
      profile: { ...profile, hostKeySha256: null }
    }),
    { hostKeySha256: pin }
  );
  await request("$private.ssh.configure", {
    profiles: [{ profile, password: secret }]
  });
  assert.deepEqual(await request("$private.ssh.test", { id: profile.id }), {
    connected: true
  });
  const experiment = await request("experiments.propose", {
    title: "Packaged native SSH fixture",
    goal: "validate transport",
    hypothesis: "fixture",
    design: "local SSH",
    seeds: 1
  });
  const plan = await request("runs.propose", {
    experimentId: experiment.id,
    command: "python3 experiment.py",
    backend: "ssh",
    host: profile.id,
    timeoutSeconds: 20,
    protocol: {
      name: "fixture",
      metric: "score",
      direction: "maximize",
      unit: "",
      dataset: "fixture",
      environment: "fixture",
      seeds: [1],
      metricsPath: "results/metrics.json"
    }
  });
  assert.equal(plan.sshConnection.hostKeySha256, pin);
  assert.ok(!JSON.stringify(plan).includes(secret));
  await request("runs.approve", { id: plan.id, digest: plan.digest });
  const run = await request("runs.start", {
    id: plan.id,
    idempotencyKey: "packaging-fixture"
  });
  assert.equal(run.state, "running");
  await stopCore();
  startCore();
  await request("system.hello");
  await request("$private.ssh.configure", {
    profiles: [{ profile, password: secret }]
  });
  const recovered = await request("runs.get", { id: run.id });
  assert.equal(recovered.run.state, "succeeded");
  assert.equal(recovered.run.metrics.score, 7);
  assert.equal(submissions, 1);
  assert.equal(
    (
      await request("runs.start", {
        id: plan.id,
        idempotencyKey: "packaging-fixture"
      })
    ).id,
    run.id
  );
  await request("$private.ssh.configure", { profiles: [{ profile }] });
  await assert.rejects(
    request("$private.ssh.test", { id: profile.id }),
    /SSH_CREDENTIAL_MISSING/
  );
  await stopCore();
  await scan(root);
  assert.ok(!processOutput.includes(secret));
  const notice = await readFile(
    join(repo, "apps/desktop/resources/core/SSH_THIRD_PARTY_NOTICES.md"),
    "utf8"
  );
  for (const name of [
    "ssh2 1.17.0",
    "asn1 0.2.6",
    "bcrypt-pbkdf 1.0.2",
    "safer-buffer 2.1.2",
    "tweetnacl 0.14.5"
  ])
    assert.ok(notice.includes(name));
  assert.deepEqual(
    (await readdir(join(repo, "apps/desktop/resources/core"))).sort(),
    ["SSH_THIRD_PARTY_NOTICES.md", "cli.mjs"].sort()
  );
  console.log(
    "Packaged Core native SSH fixture passed: strict pin, password, frozen identity, recovery, deduplication, clear, no secret persistence, pure JS/WASM notices."
  );
} finally {
  await stopCore();
  for (const client of clients) client.end();
  await new Promise((resolve) => server.close(resolve));
  if (
    !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
    !root.includes("rw-native-ssh-package-")
  )
    throw new Error("unsafe fixture cleanup");
  await rm(root, { recursive: true, force: true });
}
