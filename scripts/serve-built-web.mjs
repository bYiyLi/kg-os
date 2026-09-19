import { access } from "node:fs/promises";
import { resolve } from "node:path";

import { startStaticShellServer } from "../packages/daemon/dist/index.js";

const root = resolve(import.meta.dirname, "..");
const webRoot = resolve(root, "packages/daemon/dist/web");
const portIndex = process.argv.indexOf("--port");
const port = portIndex === -1 ? 4173 : Number(process.argv[portIndex + 1]);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid --port value: ${String(process.argv[portIndex + 1])}`);
}

await access(resolve(webRoot, "index.html"));
const running = await startStaticShellServer({ host: "127.0.0.1", port, webRoot });
process.stdout.write(`KG OS built Web shell: ${running.origin}\n`);

let stopping = false;
async function stop() {
  if (stopping) {
    return;
  }
  stopping = true;
  await running.close();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void stop().then(() => {
      process.exitCode = 0;
    });
  });
}
