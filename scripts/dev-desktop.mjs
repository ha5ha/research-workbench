import { spawn } from "node:child_process";

const env = { ...process.env };
// DSH/embedded environments may launch Electron as Node; the desktop app needs
// the real Electron runtime.
delete env.ELECTRON_RUN_AS_NODE;

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const child = spawn(
  command,
  ["--filter", "@research-workbench/desktop", "dev"],
  {
    stdio: "inherit",
    env,
    shell: process.platform === "win32"
  }
);

child.on("exit", (code) => process.exit(code ?? 0));
