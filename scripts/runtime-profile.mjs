import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function prepareRuntimeProfile({ instanceRoot }) {
  const toml =
    [
      "[cache]",
      'path = "cache/openai-compatible.db"',
      "max_size_mb = 4096",
      "",
      "[fulltext]",
      'analyzer = "unicode61"',
      "",
      "[embedding]",
      'base_url = "https://example.invalid/v1"',
      'model = "phase01-runtime-fixture"',
      "dimensions = 3",
      'similarity = "cosine"',
      'api_key_env = ""'
    ].join("\n") + "\n";

  await mkdir(instanceRoot, { recursive: true });
  await writeFile(resolve(instanceRoot, "config.toml"), toml, { mode: 0o600 });
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(import.meta.dirname, "..");
  const instanceRoot = resolve(root, ".kgos-dev");
  await prepareRuntimeProfile({
    instanceRoot
  });
  process.stdout.write("Prepared KG OS runtime profile: " + instanceRoot + "\n");
}
