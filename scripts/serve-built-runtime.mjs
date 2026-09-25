import { spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { waitForRuntimeEndpoint } from "./runtime-locator.mjs";
import { prepareRuntimeProfile } from "./runtime-profile.mjs";
import { currentRuntimeTarget } from "./runtime-package.mjs";

const root = resolve(import.meta.dirname, "..");
const portIndex = process.argv.indexOf("--port");
const port = portIndex === -1 ? 4173 : Number(process.argv[portIndex + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("--port must be an integer between 1 and 65535");
}

const instanceRoot = await mkdtemp(join(tmpdir(), "kgos-e2e-"));
await prepareRuntimeProfile({ instanceRoot });

const runtimeRoot = resolve(root, "artifacts", "npm", "runtime-" + currentRuntimeTarget());
const child = spawn(resolve(runtimeRoot, "kgosd"), ["--root", instanceRoot], {
  cwd: root,
  env: process.env,
  stdio: ["ignore", "inherit", "inherit"]
});
const endpoint = await waitForRuntimeEndpoint(instanceRoot, child);
const proxy = createServer((incoming, outgoing) => {
  const target = new URL(incoming.url ?? "/", endpoint);
  const upstream = httpRequest(
    target,
    { headers: incoming.headers, method: incoming.method },
    (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    }
  );
  upstream.once("error", (error) => {
    outgoing.destroy(error);
  });
  incoming.pipe(upstream);
});
await new Promise((resolveListen, rejectListen) => {
  proxy.once("error", rejectListen);
  proxy.listen(port, "127.0.0.1", resolveListen);
});

let stopping = false;
async function stop(signal) {
  if (stopping) {
    return;
  }
  stopping = true;
  await new Promise((resolveClose) => proxy.close(resolveClose));
  if (child.exitCode === null && child.signalCode === null) {
    child.kill(signal);
  }
}

process.once("SIGINT", () => {
  void stop("SIGINT");
});
process.once("SIGTERM", () => {
  void stop("SIGTERM");
});

const outcome = await new Promise((resolveExit, rejectExit) => {
  child.once("error", rejectExit);
  child.once("exit", (code, signal) => resolveExit({ code, signal }));
});
if (!stopping) {
  await new Promise((resolveClose) => proxy.close(resolveClose));
}
await rm(instanceRoot, { force: true, recursive: true });

if (outcome.code !== 0 && outcome.signal === null) {
  process.exitCode = outcome.code ?? 1;
}
