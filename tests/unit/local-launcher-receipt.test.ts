import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  launchLocalSupervisor,
  SupervisorLaunchUncertainError
} from "../../apps/core/src/local-launcher.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it.skipIf(process.platform !== "win32")(
  "keeps a missing PID receipt uncertain after the launcher was created",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "rw-launch-receipt-"));
    const child = new EventEmitter() as ChildProcess;
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => {
        child.emit("spawn");
        child.emit("exit", 0, null);
      });
      return child;
    });
    try {
      await expect(
        launchLocalSupervisor(
          process.execPath,
          join(root, "supervisor.cjs"),
          root,
          {}
        )
      ).rejects.toBeInstanceOf(SupervisorLaunchUncertainError);
    } finally {
      if (
        !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
        !root.includes("rw-launch-receipt-")
      )
        throw new Error("unsafe fixture cleanup");
      await rm(root, { recursive: true });
    }
  }
);

it.skipIf(process.platform !== "win32")(
  "distinguishes a launcher that could not be created from a lost receipt",
  async () => {
    const child = new EventEmitter() as ChildProcess;
    const failure = Object.assign(new Error("launcher unavailable"), {
      code: "ENOENT"
    });
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => child.emit("error", failure));
      return child;
    });
    await expect(
      launchLocalSupervisor(process.execPath, "supervisor.cjs", tmpdir(), {})
    ).rejects.toBe(failure);
  }
);
