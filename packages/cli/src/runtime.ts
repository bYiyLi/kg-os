import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { access, mkdir, readFile, stat } from "node:fs/promises";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

import { KGOSClient, KGOS_VERSION } from "@kgos/sdk";

import { localAuthenticationError, localIOError, runtimeError, targetError } from "./errors.js";

const require = createRequire(import.meta.url);
const START_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 40;

export interface RuntimeLocator {
  pid: number;
  endpoint?: string;
  version: string;
}

export interface NativeRuntime {
  name: string;
  root: string;
  daemon: string;
  version: string;
}

interface RuntimeManifestFile {
  file: string;
  sha256: string;
}

interface RuntimeManifest {
  arch: string;
  files: RuntimeManifestFile[];
  platform: string;
  version: string;
}

interface PackageMetadata {
  name: string;
  version: string;
}

export interface RuntimeTarget {
  packageName: string;
  platform: "darwin" | "linux";
  arch: "arm64" | "x64";
}

export function currentRuntimeTarget(): RuntimeTarget {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    throw localIOError("unsupported KG OS Runtime platform", { platform: process.platform });
  }
  if (process.arch !== "arm64" && process.arch !== "x64") {
    throw localIOError("unsupported KG OS Runtime architecture", { arch: process.arch });
  }
  if (process.platform === "linux" && !isGlibc()) {
    throw localIOError("KG OS v1 Linux Runtime requires glibc");
  }
  const platform = process.platform;
  const arch = process.arch;
  return {
    packageName: "@kgos/runtime-" + platform + "-" + arch,
    platform,
    arch
  };
}

function isGlibc(): boolean {
  const report = process.report.getReport();
  if (typeof report === "string") {
    return false;
  }
  if (!isRecord(report)) {
    return false;
  }
  const header = report["header"];
  return isRecord(header) && typeof header["glibcVersionRuntime"] === "string";
}

export async function resolveNativeRuntime(): Promise<NativeRuntime> {
  const target = currentRuntimeTarget();
  let packageJSON: string;
  try {
    packageJSON = require.resolve(target.packageName + "/package.json");
  } catch {
    throw localIOError("required KG OS native Runtime package is unavailable", {
      package: target.packageName
    });
  }
  const root = dirname(packageJSON);
  const metadata = decodePackageMetadata(await readFile(packageJSON, "utf8"), target.packageName);
  const manifest = decodeManifest(await readFile(join(root, "manifest.json"), "utf8"));
  validateRuntimeMetadata(target, metadata, manifest);
  await verifyRuntimeFiles(root, manifest);
  return {
    name: target.packageName,
    root,
    daemon: join(root, process.platform === "win32" ? "kgosd.exe" : "kgosd"),
    version: manifest.version
  };
}

function decodePackageMetadata(body: string, expectedName: string): PackageMetadata {
  const value = parseRecordJSON(body, "native Runtime package.json");
  const name = value["name"];
  const version = value["version"];
  if (name !== expectedName || typeof version !== "string" || version.length === 0) {
    throw localIOError("native Runtime package metadata is invalid");
  }
  return { name, version };
}

function decodeManifest(body: string): RuntimeManifest {
  const value = parseRecordJSON(body, "native Runtime manifest");
  const platform = value["platform"];
  const arch = value["arch"];
  const version = value["version"];
  const files = value["files"];
  if (
    typeof platform !== "string" ||
    typeof arch !== "string" ||
    typeof version !== "string" ||
    !Array.isArray(files)
  ) {
    throw localIOError("native Runtime manifest is invalid");
  }
  const decoded = files.map(decodeManifestFile);
  return { platform, arch, version, files: decoded };
}

function decodeManifestFile(value: unknown): RuntimeManifestFile {
  if (!isRecord(value)) {
    throw localIOError("native Runtime manifest file entry is invalid");
  }
  const file = value["file"];
  const sha256 = value["sha256"];
  if (
    typeof file !== "string" ||
    file.length === 0 ||
    typeof sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(sha256)
  ) {
    throw localIOError("native Runtime manifest file entry is invalid");
  }
  return { file, sha256 };
}

function validateRuntimeMetadata(
  target: RuntimeTarget,
  metadata: PackageMetadata,
  manifest: RuntimeManifest
): void {
  if (
    metadata.version !== KGOS_VERSION ||
    manifest.version !== KGOS_VERSION ||
    manifest.platform !== target.platform ||
    manifest.arch !== target.arch
  ) {
    throw localIOError("native Runtime package is incompatible with this CLI", {
      cliVersion: KGOS_VERSION,
      packageVersion: metadata.version,
      runtimeVersion: manifest.version
    });
  }
  const suffix = target.platform === "darwin" ? ".dylib" : ".so";
  const expected = new Set([
    "kgosd",
    "extensions/lithograph" + suffix,
    "extensions/lithograph-openai-compatible" + suffix,
    "extensions/kgos-jieba" + suffix,
    "JIEBA-NOTICE.md",
    "licenses/sqlite-simple-tokenizer-MIT.txt",
    "licenses/jieba-rs-MIT.txt"
  ]);
  const actual = new Set(manifest.files.map((item) => item.file));
  if (actual.size !== expected.size || [...expected].some((file) => !actual.has(file))) {
    throw localIOError("native Runtime manifest has an invalid required file set");
  }
}

async function verifyRuntimeFiles(root: string, manifest: RuntimeManifest): Promise<void> {
  for (const file of manifest.files) {
    const path = join(root, ...file.file.split("/"));
    const body = await readFile(path).catch(() => {
      throw localIOError("native Runtime file is missing", { file: file.file });
    });
    const digest = createHash("sha256").update(body).digest("hex");
    if (digest !== file.sha256) {
      throw localIOError("native Runtime file failed SHA-256 verification", { file: file.file });
    }
  }
  const daemon = join(root, "kgosd");
  const info = await stat(daemon);
  if ((info.mode & 0o111) === 0) {
    throw localIOError("native Runtime kgosd is not executable");
  }
}

function parseRecordJSON(body: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(body) as unknown;
  } catch {
    throw localIOError(label + " is invalid JSON");
  }
  if (!isRecord(value)) {
    throw localIOError(label + " must be a JSON object");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readLocator(root: string): Promise<RuntimeLocator | undefined> {
  let body: string;
  try {
    body = await readFile(join(root, "kgosd.lock"), "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw localIOError("read kgosd.lock failed");
  }
  if (body.trim().length === 0) {
    return undefined;
  }
  const value = parseRecordJSON(body, "kgosd.lock");
  const pid = value["pid"];
  const endpoint = value["endpoint"];
  const version = value["version"];
  if (
    typeof pid !== "number" ||
    !Number.isSafeInteger(pid) ||
    pid <= 0 ||
    typeof version !== "string" ||
    version.length === 0 ||
    (endpoint !== undefined && typeof endpoint !== "string")
  ) {
    throw targetError("kgosd.lock contains an invalid Runtime locator");
  }
  return endpoint === undefined ? { pid, version } : { pid, endpoint, version };
}

export async function endpointReachable(endpoint: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port.length === 0) {
    return false;
  }
  return await new Promise<boolean>((resolveReachable) => {
    const socket = connect({ host: "127.0.0.1", port: Number(url.port) });
    const done = (reachable: boolean) => {
      socket.destroy();
      resolveReachable(reachable);
    };
    socket.setTimeout(250);
    socket.once("connect", () => {
      done(true);
    });
    socket.once("error", () => {
      done(false);
    });
    socket.once("timeout", () => {
      done(false);
    });
  });
}

export async function ensureClient(
  root: string,
  nativeRuntime?: NativeRuntime
): Promise<KGOSClient> {
  const existing = await usableLocator(root);
  if (existing !== undefined) {
    return await clientForLocator(root, existing);
  }
  const runtime = nativeRuntime ?? (await resolveNativeRuntime());
  if (runtime.version !== KGOS_VERSION) {
    throw runtimeError("native Runtime version does not match CLI version");
  }
  await spawnRuntime(root, runtime);
  const locator = await waitForLocator(root);
  return await clientForLocator(root, locator);
}

async function usableLocator(root: string): Promise<RuntimeLocator | undefined> {
  const locator = await readLocator(root);
  if (locator?.endpoint === undefined) {
    return undefined;
  }
  const reachable = await endpointReachable(locator.endpoint);
  if (!reachable) {
    return undefined;
  }
  if (locator.version !== KGOS_VERSION) {
    throw runtimeError("active kgosd version does not match CLI version", {
      cliVersion: KGOS_VERSION,
      daemonVersion: locator.version
    });
  }
  return locator;
}

async function spawnRuntime(root: string, runtime: NativeRuntime): Promise<void> {
  const logs = join(root, "logs");
  try {
    await mkdir(logs, { recursive: true, mode: 0o700 });
    await access(runtime.daemon);
  } catch {
    throw localIOError("native Runtime kgosd is unavailable");
  }
  const logPath = join(logs, "kgosd.log");
  let descriptor: number;
  try {
    descriptor = openSync(logPath, "a", 0o600);
  } catch {
    throw localIOError("open kgosd log failed");
  }
  try {
    const child = spawn(runtime.daemon, ["--root", root], {
      detached: true,
      stdio: ["ignore", descriptor, descriptor]
    });
    child.once("error", () => undefined);
    child.unref();
  } catch {
    throw localIOError("spawn kgosd failed");
  } finally {
    closeSync(descriptor);
  }
}

async function waitForLocator(root: string): Promise<RuntimeLocator> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const locator = await readLocator(root).catch(() => undefined);
    if (locator?.endpoint !== undefined && (await endpointReachable(locator.endpoint))) {
      if (locator.version !== KGOS_VERSION) {
        throw runtimeError("active kgosd version does not match CLI version", {
          cliVersion: KGOS_VERSION,
          daemonVersion: locator.version
        });
      }
      return locator;
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw targetError("kgosd did not publish a usable endpoint");
}

async function clientForLocator(root: string, locator: RuntimeLocator): Promise<KGOSClient> {
  if (locator.endpoint === undefined) {
    throw targetError("kgosd endpoint is unavailable");
  }
  const token = await readToken(root);
  return new KGOSClient({ endpoint: locator.endpoint, token });
}

export async function readToken(root: string): Promise<string> {
  let body: string;
  try {
    body = await readFile(join(root, "auth.json"), "utf8");
  } catch {
    throw localAuthenticationError("local KG OS credential is unavailable");
  }
  const value = parseRecordJSON(body, "auth.json");
  const token = value["token"];
  if (typeof token !== "string" || token.length === 0) {
    throw localAuthenticationError("local KG OS credential is unavailable");
  }
  return token;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
