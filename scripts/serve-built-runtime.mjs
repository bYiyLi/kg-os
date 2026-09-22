import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { prepareRuntimeProfile } from "./runtime-profile.mjs";

const root = resolve(import.meta.dirname, "..");
const portIndex = process.argv.indexOf("--port");
const port = portIndex === -1 ? 4173 : Number(process.argv[portIndex + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("--port must be an integer between 1 and 65535");
}

const home = await mkdtemp(join(tmpdir(), "kgos-e2e-"));
await prepareRuntimeProfile({ root, home, host: "127.0.0.1", port });

const binary = resolve(
  root,
  "artifacts/build",
  process.platform === "win32" ? "kgosd.exe" : "kgosd"
);
const child = spawn(binary, [], {
  cwd: root,
  env: { ...process.env, KG_HOME: home },
  stdio: "inherit"
});

let stopping = false;
function stop(signal) {
  if (stopping || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  stopping = true;
  child.kill(signal);
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

const outcome = await new Promise((resolveExit, rejectExit) => {
  child.once("error", rejectExit);
  child.once("exit", (code, signal) => resolveExit({ code, signal }));
});
await rm(home, { force: true, recursive: true });

if (outcome.code !== 0 && outcome.signal === null) {
  process.exitCode = outcome.code ?? 1;
}
