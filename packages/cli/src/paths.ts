import { access, link, mkdir, open, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import { localIOError } from "./errors.js";

const INITIALIZATION_VERSION = 1;

export interface WorkspacePaths {
  workspaceRoot: string;
  instanceRoot: string;
  config: string;
  auth: string;
  lock: string;
  database: string;
  cacheDir: string;
  extensionsDir: string;
  logsDir: string;
  initialized: string;
}

export function resolveWorkspacePaths(root: string): WorkspacePaths {
  const workspaceRoot = resolve(root);
  const instanceRoot = join(workspaceRoot, ".kgos");
  return {
    workspaceRoot,
    instanceRoot,
    config: join(instanceRoot, "config.toml"),
    auth: join(instanceRoot, "auth.json"),
    lock: join(instanceRoot, "kgosd.lock"),
    database: join(instanceRoot, "kgos.db"),
    cacheDir: join(instanceRoot, "cache"),
    extensionsDir: join(instanceRoot, "extensions"),
    logsDir: join(instanceRoot, "logs"),
    initialized: join(instanceRoot, "initialized.json")
  };
}

export async function hasLegacyInstanceLayout(root: string): Promise<boolean> {
  const paths = resolveWorkspacePaths(root);
  if (await exists(paths.config)) {
    return false;
  }
  const legacy = [
    join(paths.workspaceRoot, "config.toml"),
    join(paths.workspaceRoot, "auth.json"),
    join(paths.workspaceRoot, "kgos.db")
  ];
  const states = await Promise.all(legacy.map(exists));
  return states.every(Boolean);
}

export async function isInitializationComplete(root: string): Promise<boolean> {
  const path = resolveWorkspacePaths(root).initialized;
  let body: string;
  try {
    body = await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw localIOError("read initialization marker failed");
  }
  try {
    const value = JSON.parse(body) as unknown;
    if (!isRecord(value)) return false;
    return value["version"] === INITIALIZATION_VERSION && Object.keys(value).length === 1;
  } catch {
    throw localIOError("initialization marker is invalid");
  }
}

export async function markInitializationComplete(root: string): Promise<void> {
  const paths = resolveWorkspacePaths(root);
  await mkdir(paths.instanceRoot, { recursive: true, mode: 0o700 }).catch(() => {
    throw localIOError("create Instance Directory failed");
  });
  if (await isInitializationComplete(root)) {
    return;
  }
  const temporary = join(
    paths.instanceRoot,
    `.initialized-${String(process.pid)}-${String(Date.now())}.tmp`
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(JSON.stringify({ version: INITIALIZATION_VERSION }) + "\n", "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await link(temporary, paths.initialized).catch((error: unknown) => {
      if (isNodeError(error) && error.code === "EEXIST") {
        return;
      }
      throw localIOError("publish initialization marker failed");
    });
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
  }
  if (!(await isInitializationComplete(root))) {
    throw localIOError("initialization marker is invalid");
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
