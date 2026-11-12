import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
/** Only call for a child we own; POSIX children must be spawned as process groups. */
export async function terminateProcessTree(pid: number): Promise<void> {
  if (!Number.isSafeInteger(pid) || pid <= 1)
    throw new Error("无效的子进程身份");
  if (process.platform === "win32") {
    await execute("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      timeout: 5000
    });
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
}
