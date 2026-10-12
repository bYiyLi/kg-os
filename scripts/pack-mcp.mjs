import { chmod, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { runCapture } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
const version = JSON.parse(await readFile(join(root, "package.json"), "utf8")).version;
const outputIndex = process.argv.indexOf("--output");
const temporary = process.argv.includes("--temporary");
if (temporary === (outputIndex !== -1)) {
  throw new Error("Select exactly one of --temporary or --output <directory>");
}
if (outputIndex !== -1 && process.argv[outputIndex + 1] === undefined) {
  throw new Error("--output requires a directory");
}

const temp = await mkdtemp(join(tmpdir(), "kgos-mcp-pack-"));
const destination = temporary ? join(temp, "out") : resolve(process.argv[outputIndex + 1]);

async function stage(name) {
  const from = join(root, "packages", name);
  const into = join(temp, "staging", name);
  const metadata = JSON.parse(await readFile(join(from, "package.json"), "utf8"));
  if (metadata.version !== version) throw new Error("MCP package version mismatch: " + name);
  for (const group of ["dependencies", "optionalDependencies"]) {
    for (const [dependency, requested] of Object.entries(metadata[group] ?? {})) {
      if (typeof requested === "string" && requested.startsWith("workspace:")) {
        metadata[group][dependency] = version;
      }
    }
  }
  await mkdir(into, { recursive: true });
  await cp(join(from, "dist"), join(into, "dist"), { recursive: true });
  await rm(join(into, "dist", ".tsbuildinfo"), { force: true });
  await cp(join(root, "LICENSE"), join(into, "LICENSE"));
  if (name === "cli" || name === "mcp") {
    await chmod(join(into, "dist", "bin.js"), 0o755);
  }
  await writeFile(join(into, "package.json"), JSON.stringify(metadata, null, 2) + "\n");
  return into;
}

async function pack(name) {
  const staged = await stage(name);
  const packed = await runCapture(
    "npm",
    ["pack", "--json", "--pack-destination", destination, staged],
    {
      cwd: root
    }
  );
  const parsed = JSON.parse(packed.stdout);
  const result = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
  if (result?.name !== "@kgos/" + name || result?.version !== version || !result.filename) {
    throw new Error(
      "npm pack returned incorrect MCP package metadata: " +
        JSON.stringify({ expected: name, packed: parsed }).slice(0, 850)
    );
  }
  const path = join(destination, result.filename);
  const contents = (await runCapture("tar", ["-tzf", path], { cwd: root })).stdout;
  const files =
    name === "mcp"
      ? ["dist/bin.js", "dist/server.js", "dist/sandbox-worker.js", "dist/sdk-dispatch.js"]
      : name === "cli"
        ? ["dist/bin.js", "dist/connection.js"]
        : ["dist/index.js"];
  for (const file of files) {
    if (!contents.includes("package/" + file)) throw new Error("Packed package is missing " + file);
  }
  await rename(path, join(destination, name + ".tgz"));
}

try {
  await mkdir(destination, { recursive: true });
  for (const name of ["sdk", "cli", "mcp"]) await pack(name);
  if (!process.argv.includes("--no-smoke")) {
    await runCapture("pnpm", ["mcp:staging:smoke", destination], {
      cwd: root
    });
  }
  process.stdout.write("KG OS MCP Docker-internal staging tarballs created and verified\n");
} finally {
  await rm(temp, { recursive: true, force: true });
}
