import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { prepareRuntimeProfile } from "./runtime-profile.mjs";

const root = resolve(import.meta.dirname, "..");
const kgHome = resolve(root, ".kgos-dev");
await mkdir(kgHome, { recursive: true });
await prepareRuntimeProfile({
  root,
  home: kgHome,
  host: "127.0.0.1",
  port: 4765
});

const env = {
  ...process.env,
  CGO_ENABLED: "1",
  GOTOOLCHAIN: "go1.27.1",
  KG_HOME: kgHome
};

function start(label, command, args) {
  const child = spawn(command, args, {
    cwd: root,
    detached: process.platform !== "win32",
    env,
    stdio: "inherit"
  });
  child.once("error", (error) => {
    process.stderr.write(label + ": " + error.message + "\n");
  });
  return { child, label };
}

const children = [
  start("Go daemon", "go", ["run", "-tags=sqlite_fts5", "./cmd/kgosd"]),
  start("Vite", "pnpm", [
    "--filter",
    "@kgos/web",
    "exec",
    "vite",
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort"
  ])
];

process.stdout.write("KG OS Web dev: http://127.0.0.1:5173\n");

let stopping = false;
function stopAll(signal) {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null) {
      if (process.platform === "win32" || child.pid === undefined) {
        child.kill(signal);
      } else {
        try {
          process.kill(-child.pid, signal);
        } catch (error) {
          if (error.code !== "ESRCH") {
            throw error;
          }
        }
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
  children.map(
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
  children.map(
    ({ child }) =>
      new Promise((resolveExit) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          resolveExit();
          return;
        }
        child.once("exit", resolveExit);
      })
  )
);
