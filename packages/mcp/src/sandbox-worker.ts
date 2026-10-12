import { parentPort, workerData } from "node:worker_threads";

import type { WorkerInput, runSandboxEngine as EngineRunner } from "./sandbox-engine.js";

// Node 24 can strip TypeScript when running source tests; packaged workers
// import the compiled .js file located beside the Worker.
const moduleUrl = new URL(
  import.meta.url.endsWith(".ts") ? "./sandbox-engine.ts" : "./sandbox-engine.js",
  import.meta.url
);
const { runSandboxEngine } = (await import(moduleUrl.href)) as {
  runSandboxEngine: typeof EngineRunner;
};

const parent = parentPort;
if (parent === null) throw new Error("Sandbox Worker requires a parent");

void runSandboxEngine(workerData as WorkerInput, {
  postMessage(value) {
    parent.postMessage(value);
  },
  onMessage(listener) {
    parent.on("message", listener);
  },
  removeMessageListeners() {
    parent.removeAllListeners("message");
  }
});
