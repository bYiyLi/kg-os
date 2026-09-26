import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { run, spawnCommand } from "./process.mjs";
import { waitForRuntimeEndpoint } from "./runtime-locator.mjs";
import { prepareRuntimeProfile } from "./runtime-profile.mjs";
import { currentRuntimeTarget } from "./runtime-package.mjs";

const root = resolve(import.meta.dirname, "..");
const instanceRoot = resolve(root, ".kgos-dev");

await run("pnpm", ["build"], { cwd: root });
await prepareRuntimeProfile({ instanceRoot });

const runtimeRoot = resolve(root, "artifacts", "npm", "runtime-" + currentRuntimeTarget());
const daemon = spawn(
  resolve(runtimeRoot, process.platform === "win32" ? "kgosd.exe" : "kgosd"),
  ["--root", instanceRoot],
  {
    cwd: root,
    detached: process.platform !== "win32",
    env: process.env,
    stdio: "inherit"
  }
);
daemon.once("error", (error) => {
  process.stderr.write("Go daemon: " + error.message + "\n");
});

const endpoint = await waitForRuntimeEndpoint(instanceRoot, daemon);
const vite = spawnCommand(
  "pnpm",
  [
    "--filter",
    "@kgos/web",
    "exec",
    "vite",
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort"
  ],
  {
    cwd: root,
    detached: process.platform !== "win32",
    env: { ...process.env, KGOS_DEV_ENDPOINT: endpoint },
    stdio: "inherit"
  }
);
vite.once("error", (error) => {
  process.stderr.write("Vite: " + error.message + "\n");
});

process.stdout.write("KG OS daemon: " + endpoint + "\n");
process.stdout.write("KG OS Web dev: http://127.0.0.1:5173\n");

let stopping = false;
function stopAll(signal) {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of [daemon, vite]) {
    if (child.exitCode !== null || child.signalCode !== null) {
      continue;
    }
    if (process.platform === "win32" || child.pid === undefined) {
      child.kill(signal);
      continue;
    }
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
        throw error;
      }
    }
  }
}

const requestedStop = new Promise((resolveStop) => {
  process.once("SIGINT", () => {
    stopAll("SIGINT");
    resolveStop({ requested: true });
  });
  process.once("SIGTERM", () => {
    stopAll("SIGTERM");
    resolveStop({ requested: true });
  });
});

const childExit = Promise.race(
  [
    { child: daemon, label: "Go daemon" },
    { child: vite, label: "Vite" }
  ].map(
    ({ child, label }) =>
      new Promise((resolveExit) => {
        child.once("exit", (code, signal) => resolveExit({ code, label, signal }));
      })
  )
);

const outcome = await Promise.race([requestedStop, childExit]);
if (!("requested" in outcome)) {
  process.stderr.write(
    outcome.label +
      " exited unexpectedly: code=" +
      String(outcome.code) +
      " signal=" +
      String(outcome.signal) +
      "\n"
  );
  stopAll("SIGTERM");
  process.exitCode = outcome.code === null || outcome.code === 0 ? 1 : outcome.code;
}

await Promise.all(
  [daemon, vite].map(
    (child) =>
      new Promise((resolveExit) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          resolveExit();
          return;
        }
        child.once("exit", resolveExit);
      })
  )
);
