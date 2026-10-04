import { spawn } from "node:child_process";
import { join } from "node:path";

import { waitForRuntimeEndpoint } from "./runtime-locator.mjs";
import { markRuntimeProfileInitialized } from "./runtime-profile.mjs";

export async function startFixtureDaemon(workspaceRoot, runtimeRoot) {
  let child;
  let restarting = false;
  let stopping = false;
  let firstStartup = true;
  let resolveClosed;
  const closed = new Promise((resolveExit) => {
    resolveClosed = resolveExit;
  });
  async function launch() {
    child = spawn(
      join(runtimeRoot, process.platform === "win32" ? "kgosd.exe" : "kgosd"),
      ["--root", workspaceRoot],
      {
        cwd: workspaceRoot,
        env: process.env,
        stdio: ["ignore", "inherit", "inherit"]
      }
    );
    child.once("error", () => {
      resolveClosed({ code: 1, signal: null });
    });
    child.once("exit", (code, signal) => {
      if (!restarting || stopping) resolveClosed({ code, signal });
    });
    try {
      const endpoint = await waitForRuntimeEndpoint(workspaceRoot, child);
      if (firstStartup) {
        await markRuntimeProfileInitialized({ workspaceRoot, endpoint });
        firstStartup = false;
      }
      return endpoint;
    } catch (error) {
      await stopChild("SIGTERM");
      resolveClosed({ code: child.exitCode, signal: child.signalCode });
      throw error;
    }
  }
  async function stopChild(signal) {
    if (child?.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise((resolveExit) => {
      child.once("exit", resolveExit);
    });
    child.kill(signal);
    await exited;
  }
  let endpoint = await launch();
  return {
    get endpoint() {
      return endpoint;
    },
    get pid() {
      return child.pid;
    },
    closed,
    async restart() {
      if (restarting || stopping) throw new Error("Fixture daemon is busy or stopped");
      restarting = true;
      try {
        await stopChild("SIGTERM");
        if (stopping) throw new Error("Fixture daemon stopped before restart");
        endpoint = await launch();
      } finally {
        restarting = false;
      }
    },
    async stop(signal = "SIGTERM") {
      stopping = true;
      await stopChild(signal);
    }
  };
}
