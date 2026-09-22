import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { currentLithographArtifact } from "./lithograph-artifacts.mjs";
import { run } from "./process.mjs";

export async function prepareRuntimeProfile({ root, home, host, port }) {
  await run("node", ["scripts/prepare-lithograph.mjs"], { cwd: root });
  const artifact = currentLithographArtifact(root);
  const mainLibrary = resolve(artifact.cacheDirectory, artifact.library);
  const providerLibrary = resolve(artifact.cacheDirectory, artifact.providerLibrary);
  const toml =
    [
      "[server]",
      "host = " + JSON.stringify(host),
      "port = " + String(port),
      "",
      "[[sqlite.extensions]]",
      "source = " + JSON.stringify(mainLibrary),
      'entrypoint = "sqlite3_lithograph_init"',
      "",
      "[[sqlite.extensions]]",
      "source = " + JSON.stringify(providerLibrary),
      'entrypoint = "sqlite3_lithographopenaicompatible_init"',
      "",
      "[fulltext]",
      'analyzer = "unicode61"',
      "",
      "[embedding]",
      'base_url = "https://example.invalid/v1"',
      'model = "phase01-runtime-fixture"',
      "dimensions = 3",
      'similarity = "cosine"'
    ].join("\n") + "\n";

  await mkdir(home, { recursive: true });
  await writeFile(resolve(home, "config.toml"), toml, { mode: 0o600 });
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(import.meta.dirname, "..");
  const home = resolve(root, ".kgos-dev");
  await prepareRuntimeProfile({
    root,
    home,
    host: "127.0.0.1",
    port: 4765
  });
  process.stdout.write("Prepared KG OS runtime profile: " + home + "\n");
}
