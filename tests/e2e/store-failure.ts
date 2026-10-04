import { rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { type RuntimeFixture } from "./runtime-fixture.js";

export async function unavailableStore(runtime: RuntimeFixture): Promise<() => Promise<void>> {
  const path = join(runtime.workspaceRoot, ".kgos", "web");
  const backup = path + ".held";
  await rename(path, backup);
  await writeFile(path, "E2E unavailable managed directory", { mode: 0o600 });
  return async () => {
    await rm(path);
    await rename(backup, path);
  };
}
