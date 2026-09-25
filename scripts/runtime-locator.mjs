import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function waitForRuntimeEndpoint(rootPath, child) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("kgosd exited before publishing an endpoint");
    }
    try {
      const locator = JSON.parse(await readFile(resolve(rootPath, "kgosd.lock"), "utf8"));
      if (typeof locator.endpoint === "string" && locator.endpoint !== "") {
        return locator.endpoint;
      }
    } catch {
      // Startup may not have created or fully published the locator yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 40));
  }
  throw new Error("kgosd did not publish an endpoint");
}
