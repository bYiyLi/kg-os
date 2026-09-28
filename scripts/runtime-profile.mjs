import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function prepareRuntimeProfile({ workspaceRoot }) {
  const toml =
    [
      "[cache]",
      'path = "cache/openai-compatible.db"',
      "max_size_mb = 4096",
      "",
      "[fulltext]",
      'analyzer = "jieba"',
      "",
      "[embedding]",
      'base_url = "https://example.invalid/v1"',
      'model = "phase01-runtime-fixture"',
      "dimensions = 3",
      'similarity = "cosine"',
      'api_key_env = ""'
    ].join("\n") + "\n";

  const instanceRoot = resolve(workspaceRoot, ".kgos");
  await mkdir(instanceRoot, { recursive: true });
  await rm(resolve(instanceRoot, "initialized.json"), { force: true });
  await writeFile(resolve(instanceRoot, "config.toml"), toml, { mode: 0o600 });
}

export async function markRuntimeProfileInitialized({ workspaceRoot, endpoint }) {
  const instanceRoot = resolve(workspaceRoot, ".kgos");
  const credential = JSON.parse(await readFile(resolve(instanceRoot, "auth.json"), "utf8"));
  if (typeof credential.token !== "string" || credential.token === "") {
    throw new Error("development Runtime did not publish a usable auth.json");
  }
  const response = await fetch(new URL("/api/v1/evolution/overview", endpoint), {
    method: "POST",
    headers: {
      authorization: "Bearer " + credential.token,
      "content-type": "application/json"
    },
    body: "{}"
  });
  if (!response.ok) {
    throw new Error("development Runtime failed authenticated readiness");
  }
  const overview = await response.json();
  if (
    typeof overview !== "object" ||
    overview === null ||
    typeof overview.defaultBranch !== "string" ||
    typeof overview.state !== "string"
  ) {
    throw new Error("development Runtime returned invalid readiness data");
  }

  const receipt = resolve(instanceRoot, "initialized.json");
  const temporary = resolve(instanceRoot, `.initialized-dev-${String(process.pid)}.tmp`);
  try {
    await writeFile(temporary, '{"version":1}\n', { flag: "wx", mode: 0o600 });
    await link(temporary, receipt);
  } finally {
    await rm(temporary, { force: true });
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(import.meta.dirname, "..");
  const workspaceRoot = resolve(root, ".kgos-dev");
  await prepareRuntimeProfile({
    workspaceRoot
  });
  process.stdout.write("Prepared KG OS runtime profile: " + resolve(workspaceRoot, ".kgos") + "\n");
}
