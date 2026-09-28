import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

export async function regularFile(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isFile();
  } catch {
    return false;
  }
}

export async function cachedArtifactPresent(directory: string, sha256: string): Promise<boolean> {
  const root = join(directory, sha256);
  const manifestPath = join(root, "manifest.json");
  const artifactPath = join(root, "artifact");
  if (!(await regularFile(manifestPath)) || !(await regularFile(artifactPath))) return false;
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
    const files = artifactManifestFiles(manifest, sha256);
    if (files === undefined || (await sha256File(artifactPath)) !== sha256) return false;
    for (const [relative, expected] of Object.entries(files)) {
      const path = cachedPayloadPath(root, relative);
      if (
        path === undefined ||
        !(await regularFile(path)) ||
        (await sha256File(path)) !== expected
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolveHash, rejectHash) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", rejectHash);
    stream.once("end", resolveHash);
  });
  return hash.digest("hex");
}

function artifactManifestFiles(value: unknown, sha256: string): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const files = record["files"];
  if (
    record["sha256"] !== sha256 ||
    typeof files !== "object" ||
    files === null ||
    Array.isArray(files)
  ) {
    return undefined;
  }
  const decoded: Record<string, string> = {};
  for (const [path, digest] of Object.entries(files)) {
    if (
      !safeCacheRelativePath(path) ||
      typeof digest !== "string" ||
      !/^[0-9a-f]{64}$/.test(digest)
    ) {
      return undefined;
    }
    decoded[path] = digest;
  }
  return Object.keys(decoded).length === 0 ? undefined : decoded;
}

function cachedPayloadPath(root: string, relative: string): string | undefined {
  if (!safeCacheRelativePath(relative)) return undefined;
  return join(root, ...relative.split("/"));
}

function safeCacheRelativePath(path: string): boolean {
  if (path === "" || path.includes("\\") || path.startsWith("/")) return false;
  const parts = path.split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..");
}
