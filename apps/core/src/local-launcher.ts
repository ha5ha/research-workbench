import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

const psLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** A process may exist even when the launcher's acknowledgement was lost. */
export class SupervisorLaunchUncertainError extends Error {}

/** Starts the registered supervisor; the research command is never shell input here. */
export async function launchLocalSupervisor(
  executable: string,
  supervisor: string,
  directory: string,
  env: NodeJS.ProcessEnv
): Promise<number> {
  if (process.platform === "win32") {
    // Windows filenames cannot contain a double quote. Start-Process joins its
    // ArgumentList, so preserve a quoted Windows argument for each fixed path.
    if (
      [executable, supervisor, directory].some((path) => /[\0\r\n"]/.test(path))
    )
      throw new Error("Supervisor 启动路径包含无效字符");
    const acknowledgement = join(directory, `.launcher-${randomUUID()}.pid`);
    const script = [
      "$ErrorActionPreference='Stop'",
      `$p=Start-Process -FilePath ${psLiteral(executable)} -ArgumentList @(${psLiteral(`"${supervisor}"`)},${psLiteral(`"${directory}"`)}) -WorkingDirectory ${psLiteral(directory)} -WindowStyle Hidden -PassThru`,
      `[IO.File]::WriteAllText(${psLiteral(acknowledgement)},[string]$p.Id)`
    ].join(";");
    let stdout: string;
    try {
      const launcher = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(script, "utf16le").toString("base64")
        ],
        {
          cwd: directory,
          env,
          windowsHide: true,
          stdio: "ignore"
        }
      );
      // Never give the detached supervisor a pipe owned by this acknowledgement.
      // A descendant retaining execFile's stdio can keep its callback pending even
      // after PowerShell exits. Keep ShellExecute and read a private, unique receipt.
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          launcher.kill();
          reject(new Error("Supervisor 启动器确认超时"));
        }, 15000);
        launcher.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        launcher.once("exit", (code, signal) => {
          clearTimeout(timeout);
          if (code === 0) resolve();
          else reject(new Error(`Supervisor 启动器退出：${code ?? signal}`));
        });
      });
      stdout = await readFile(acknowledgement, "utf8");
    } catch (error) {
      // Failure to create the launcher itself proves no job was submitted.
      if (
        ["ENOENT", "EACCES"].includes(
          String((error as NodeJS.ErrnoException).code)
        )
      )
        throw error;
      throw new SupervisorLaunchUncertainError(
        "Supervisor 启动确认丢失，需核对同一 Job；禁止重复提交",
        { cause: error }
      );
    } finally {
      await unlink(acknowledgement).catch(() => {});
    }
    if (!/^\d+\s*$/.test(stdout))
      throw new SupervisorLaunchUncertainError(
        "Supervisor 启动器未返回有效 PID，需核对同一 Job"
      );
    const pid = Number(stdout.trim());
    if (!Number.isSafeInteger(pid) || pid <= 0)
      throw new SupervisorLaunchUncertainError(
        "Supervisor 启动器返回无效 PID，需核对同一 Job"
      );
    return pid;
  }
  const child = spawn(executable, [supervisor, directory], {
    cwd: directory,
    env,
    detached: true,
    windowsHide: true,
    stdio: "ignore"
  });
  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();
  if (!child.pid) throw new Error("Supervisor 启动器未返回有效 PID");
  return child.pid;
}
