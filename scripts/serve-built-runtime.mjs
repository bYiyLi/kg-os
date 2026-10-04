import { createHash } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { runCapture } from "./process.mjs";
import { startFixtureDaemon } from "./p14-runtime-lifecycle.mjs";
import { seedResearchRuntime } from "./p14-seed-research.mjs";
import { prepareRuntimeProfile } from "./runtime-profile.mjs";
import { currentRuntimeTarget } from "./runtime-package.mjs";

const root = resolve(import.meta.dirname, "..");
const portIndex = process.argv.indexOf("--port");
const port = portIndex === -1 ? 4173 : Number(process.argv[portIndex + 1]);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error("--port must be an integer between 0 and 65535");
}
const fixtureIndex = process.argv.indexOf("--fixture");
if (fixtureIndex !== -1 && process.argv[fixtureIndex + 1] === undefined) {
  throw new Error("--fixture requires a private metadata file");
}
const fixturePath =
  fixtureIndex === -1
    ? resolve(root, ".cache", "e2e-instance.json")
    : resolve(process.argv[fixtureIndex + 1]);
const workRoot = await mkdtemp(join(tmpdir(), "kgos-e2e-packed-"));
const workspaceRoot = join(workRoot, "workspace");
let daemon;
let proxy;
let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  proxy?.closeAllConnections();
  proxy?.close();
  void daemon?.stop(signal);
}
process.once("SIGINT", () => {
  stop("SIGINT");
});
process.once("SIGTERM", () => {
  stop("SIGTERM");
});
process.once("disconnect", () => {
  stop("SIGTERM");
});

try {
  const stage = resolve(root, "artifacts", "npm", "runtime-" + currentRuntimeTarget());
  const packed = await runCapture(
    "npm",
    [
      "pack",
      "--offline",
      "--ignore-scripts",
      "--json",
      "--cache",
      join(workRoot, "npm-cache"),
      "--pack-destination",
      workRoot,
      stage
    ],
    { cwd: workRoot }
  );
  const metadata = JSON.parse(packed.stdout);
  const filename = metadata[0]?.filename;
  if (typeof filename !== "string" || filename.includes("/") || filename.includes("\\")) {
    throw new Error("npm pack did not return one local Runtime tarball");
  }
  const tarball = join(workRoot, filename);
  await runCapture("tar", ["-xzf", tarball, "-C", workRoot], { cwd: workRoot });
  const runtimeRoot = join(workRoot, "package");
  const manifest = JSON.parse(await readFile(join(runtimeRoot, "manifest.json"), "utf8"));
  for (const entry of manifest.files) {
    const bytes = await readFile(resolve(runtimeRoot, entry.file));
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) {
      throw new Error("packed Runtime manifest mismatch: " + entry.file);
    }
  }
  await prepareRuntimeProfile({ workspaceRoot });
  if (stopping) throw new Error("E2E fixture stopped before startup");
  daemon = await startFixtureDaemon(workspaceRoot, runtimeRoot);
  if (stopping) throw new Error("E2E fixture stopped during startup");
  const credential = JSON.parse(await readFile(join(workspaceRoot, ".kgos", "auth.json"), "utf8"));
  if (typeof credential.token !== "string" || credential.token === "") {
    throw new Error("E2E Runtime did not publish a credential");
  }
  const research = process.argv.includes("--research")
    ? await seedResearchRuntime(daemon.endpoint, credential.token)
    : undefined;
  proxy = createServer((incoming, outgoing) => {
    const upstream = httpRequest(
      new URL(incoming.url ?? "/", daemon.endpoint),
      {
        headers: incoming.headers,
        method: incoming.method
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      }
    );
    upstream.once("error", (error) => {
      outgoing.destroy(error);
    });
    incoming.once("aborted", () => {
      upstream.destroy();
    });
    outgoing.once("close", () => {
      if (!outgoing.writableFinished) upstream.destroy();
    });
    incoming.pipe(upstream);
  });
  await new Promise((resolveListen, rejectListen) => {
    proxy.once("error", rejectListen);
    proxy.listen(port, "127.0.0.1", resolveListen);
  });
  const address = proxy.address();
  if (address === null || typeof address === "string")
    throw new Error("E2E proxy has no loopback address");
  await mkdir(resolve(fixturePath, ".."), { recursive: true });
  function currentMetadata() {
    return {
      workspaceRoot,
      endpoint: daemon.endpoint,
      token: credential.token,
      origin: `http://127.0.0.1:${String(address.port)}`,
      runtimeRoot,
      tarball,
      pid: daemon.pid,
      ...(research === undefined ? {} : { research })
    };
  }
  async function publishMetadata() {
    await writeFile(fixturePath + ".tmp", JSON.stringify(currentMetadata()), { mode: 0o600 });
    if (process.platform !== "win32") await chmod(fixturePath + ".tmp", 0o600);
    await rename(fixturePath + ".tmp", fixturePath);
  }
  await publishMetadata();
  process.on("message", (message) => {
    if (
      typeof message !== "object" ||
      message === null ||
      message.type !== "restart" ||
      typeof message.id !== "string"
    )
      return;
    void daemon
      .restart()
      .then(async () => {
        await publishMetadata();
        process.send?.({ type: "restarted", id: message.id, metadata: currentMetadata() });
      })
      .catch(() => {
        process.send?.({ type: "restart-failed", id: message.id });
      });
  });
  const outcome = await daemon.closed;
  if (outcome.code !== 0 && outcome.signal === null) process.exitCode = outcome.code ?? 1;
} finally {
  stop("SIGTERM");
  await daemon?.stop();
  await rm(workRoot, { force: true, recursive: true });
  await rm(fixturePath, { force: true });
  if (process.connected) process.disconnect();
}
