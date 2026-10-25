import { spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { waitForRuntimeEndpoint } from "./runtime-locator.mjs";
import { prepareRuntimeProfile } from "./runtime-profile.mjs";
import { currentRuntimeBundle } from "./runtime-bundle.mjs";

const root = resolve(import.meta.dirname, "..");
const portIndex = process.argv.indexOf("--port");
const port = portIndex === -1 ? 4173 : Number(process.argv[portIndex + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("--port must be an integer between 1 and 65535");
}

const workspaceRoot = await mkdtemp(join(tmpdir(), "kgos-e2e-"));
await prepareRuntimeProfile({ workspaceRoot });

const runtimeRoot = currentRuntimeBundle(root);
const child = spawn(
  resolve(runtimeRoot, process.platform === "win32" ? "kgosd.exe" : "kgosd"),
  ["--root", workspaceRoot],
  {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"]
  }
);
let endpoint;
try {
  endpoint = await waitForRuntimeEndpoint(workspaceRoot, child);
  const deadline = Date.now() + 25_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("E2E Runtime exited before initialization completed");
    }
    let token;
    try {
      const credential = JSON.parse(
        await readFile(join(workspaceRoot, ".kgos", "auth.json"), "utf8")
      );
      token = credential.token;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await new Promise((resolveReady) => setTimeout(resolveReady, 50));
      continue;
    }
    if (typeof token !== "string" || token === "") {
      throw new Error("E2E Runtime administrator credential invalid");
    }
    const response = await fetch(endpoint + "/api/v1/setup/status", {
      signal: AbortSignal.timeout(2_000),
      headers: { Authorization: "Bearer " + token }
    });
    // Auto-initialization may have written auth.json before the controller
    // switches to its authenticated ready Session. Wait for that transition.
    if (response.status === 401) {
      await new Promise((resolveReady) => setTimeout(resolveReady, 250));
      continue;
    }
    if (!response.ok) throw new Error("E2E Runtime setup status unavailable");
    const status = await response.json();
    if (status.state === "error") throw new Error("E2E Runtime initialization failed");
    if (status.state === "ready") {
      ready = true;
      break;
    }
    await new Promise((resolveReady) => setTimeout(resolveReady, 50));
  }
  if (!ready) throw new Error("E2E Runtime initialization timed out");
} catch (error) {
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise((resolveExit) => {
      child.once("exit", resolveExit);
      child.kill("SIGTERM");
    });
  }
  await rm(workspaceRoot, { force: true, recursive: true });
  throw error;
}
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
await rm(workspaceRoot, { force: true, recursive: true });

if (outcome.code !== 0 && outcome.signal === null) {
  process.exitCode = outcome.code ?? 1;
}
