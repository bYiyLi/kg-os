import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { run } from "./process.mjs";

export async function prepareKGOSDDaemonFixture({ root, env, tags }) {
  const directory = resolve(root, "artifacts", "test");
  const binary = resolve(directory, process.platform === "win32" ? "kgosd.exe" : "kgosd");
  await mkdir(directory, { recursive: true });
  await run("go", ["build", "-tags=" + tags, "-o", binary, "./cmd/kgosd"], { cwd: root, env });
  return binary;
}
