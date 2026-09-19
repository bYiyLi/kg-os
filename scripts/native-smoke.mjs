import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import { currentLithographArtifact, LITHOGRAPH_VERSION } from "./lithograph-artifacts.mjs";

const root = resolve(import.meta.dirname, "..");
const artifact = currentLithographArtifact(root);
const manifest = JSON.parse(await readFile(join(artifact.cacheDirectory, "manifest.json"), "utf8"));

if (
  manifest.library !== artifact.library ||
  manifest.platform !== artifact.key ||
  manifest.sourceSha256 !== artifact.sha256 ||
  manifest.version !== LITHOGRAPH_VERSION
) {
  throw new Error("Lithograph fixture manifest does not match the pinned platform artifact");
}

const databasePath = join(tmpdir(), `kgos-lithograph-${randomUUID()}.sqlite`);
const database = new DatabaseSync(databasePath, { allowExtension: true });

function parseValue(row) {
  if (row === undefined || typeof row.value !== "string") {
    throw new Error("Lithograph smoke query did not return a JSON text value");
  }
  return JSON.parse(row.value);
}

try {
  database.loadExtension(join(artifact.cacheDirectory, manifest.library));
  database.enableLoadExtension(false);

  const version = parseValue(database.prepare("SELECT lithograph_version() AS value").get());
  if (version.extension !== LITHOGRAPH_VERSION || version.abi !== 1) {
    throw new Error(`Unexpected Lithograph version response: ${JSON.stringify(version)}`);
  }

  const initialized = parseValue(database.prepare("SELECT lithograph_init() AS value").get());
  if (initialized.branch !== "main" || typeof initialized.databaseId !== "string") {
    throw new Error(
      `Unexpected Lithograph initialization response: ${JSON.stringify(initialized)}`
    );
  }

  const result = parseValue(
    database.prepare("SELECT lithograph(?) AS value").get("RETURN 1 AS value")
  );
  if (result.rows?.[0]?.[0] !== 1 || result.summary?.queryType !== "read") {
    throw new Error(`Unexpected Lithograph query response: ${JSON.stringify(result)}`);
  }

  process.stdout.write(
    `Lithograph native smoke passed: v${LITHOGRAPH_VERSION}, ABI 1, ${artifact.key}\n`
  );
} finally {
  database.close();
  await rm(databasePath, { force: true });
}
