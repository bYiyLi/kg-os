import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { KGOSClient, type JsonObject, type PatchResult } from "@kgos/sdk";
import { expect, test as base, type Page } from "@playwright/test";

import researchObjects from "./research-objects.json" with { type: "json" };

interface RuntimeMetadata {
  workspaceRoot: string;
  endpoint: string;
  origin: string;
  token: string;
  runtimeRoot: string;
  tarball: string;
  pid: number;
}

export interface RuntimeFixture extends RuntimeMetadata {
  client: KGOSClient;
  restart: () => Promise<void>;
  stop: () => Promise<void>;
}

function runtimeMetadata(value: unknown): RuntimeMetadata {
  if (typeof value !== "object" || value === null) throw new Error("Runtime metadata is absent");
  const record = value as Record<string, unknown>;
  for (const key of ["workspaceRoot", "endpoint", "origin", "token", "runtimeRoot", "tarball"]) {
    if (typeof record[key] !== "string" || record[key] === "")
      throw new Error("Runtime metadata field is absent: " + key);
  }
  if (typeof record["pid"] !== "number") throw new Error("Runtime did not report a process ID");
  return record as unknown as RuntimeMetadata;
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise<void>((resolveClose) => {
    child.once("close", () => {
      resolveClose();
    });
  });
  child.kill("SIGTERM");
  await closed;
}

async function restartProcess(child: ChildProcess): Promise<RuntimeMetadata> {
  const id = randomUUID();
  return await new Promise<RuntimeMetadata>((resolveRestart, rejectRestart) => {
    const timer = setTimeout(() => {
      child.off("message", received);
      rejectRestart(new Error("Private Runtime restart timed out"));
    }, 15_000);
    function received(value: unknown) {
      if (typeof value !== "object" || value === null) return;
      const message = value as Record<string, unknown>;
      if (message["id"] !== id) return;
      clearTimeout(timer);
      child.off("message", received);
      if (message["type"] !== "restarted")
        rejectRestart(new Error("Private Runtime restart failed"));
      else resolveRestart(runtimeMetadata(message["metadata"]));
    }
    child.on("message", received);
    child.send({ type: "restart", id });
  });
}

export async function startRuntime(browserName = "browser"): Promise<RuntimeFixture> {
  const directory = await mkdtemp(join(tmpdir(), `kgos-${browserName}-driver-`));
  const metadataFile = join(directory, "runtime.json");
  const child = spawn(
    process.execPath,
    [resolve("scripts/serve-built-runtime.mjs"), "--port", "0", "--fixture", metadataFile],
    {
      cwd: resolve("."),
      stdio: ["ignore", "pipe", "pipe", "ipc"]
    }
  );
  let diagnostic = "";
  const capture = (chunk: Buffer) => {
    diagnostic = (diagnostic + chunk.toString("utf8")).slice(-12_000);
  };
  if (child.stdout === null || child.stderr === null)
    throw new Error("Fixture diagnostic pipes are absent");
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  let failure: Error | undefined;
  child.once("error", (error) => {
    failure = error;
  });
  try {
    const deadline = Date.now() + 25_000;
    let metadata: RuntimeMetadata | undefined;
    while (Date.now() < deadline && metadata === undefined) {
      if (failure !== undefined) throw failure;
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error("packed Runtime fixture exited before readiness: " + diagnostic);
      try {
        metadata = runtimeMetadata(JSON.parse(await readFile(metadataFile, "utf8")));
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        await delay(40);
      }
    }
    if (metadata === undefined)
      throw new Error("packed Runtime fixture readiness timed out: " + diagnostic);
    const client = new KGOSClient({ endpoint: metadata.endpoint, token: metadata.token });
    await client.evolution.overview();
    const runtime: RuntimeFixture = {
      ...metadata,
      client,
      restart: async () => {
        const updated = await restartProcess(child);
        Object.assign(runtime, updated);
        runtime.client = new KGOSClient({ endpoint: updated.endpoint, token: updated.token });
        await runtime.client.evolution.overview();
      },
      stop: async () => {
        await stopProcess(child);
        await rm(directory, { recursive: true, force: true });
      }
    };
    return runtime;
  } catch (error) {
    await stopProcess(child);
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

function addedObject(ref: string, value: JsonObject): string {
  const lines = JSON.stringify(value, null, 2).split("\n");
  return [
    `diff --git a/${ref} b/${ref}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${ref}`,
    `@@ -0,0 +1,${String(lines.length)} @@`,
    ...lines.map((line) => "+" + line),
    ""
  ].join("\n");
}

export function changedObject(ref: string, before: string, after: string): string {
  const oldLines = before.replace(/\n$/u, "").split("\n");
  const newLines = after.replace(/\n$/u, "").split("\n");
  return [
    `diff --git a/${ref} b/${ref}`,
    `--- a/${ref}`,
    `+++ b/${ref}`,
    `@@ -1,${String(oldLines.length)} +1,${String(newLines.length)} @@`,
    ...oldLines.map((line) => "-" + line),
    ...newLines.map((line) => "+" + line),
    ""
  ].join("\n");
}

export interface ResearchFixture {
  state: string;
  model: string;
  paper: string;
  unlabelled: string;
  describes: string[];
  selfLoop: string;
  reverse: string;
}

function created(receipt: PatchResult, alias: string, kind = "knowledge-node"): string {
  const ref = receipt.created.find((item) => item.alias === alias && item.kind === kind)?.ref;
  if (ref === undefined) throw new Error("real Patch receipt omitted alias " + alias);
  return ref;
}

const objects = researchObjects as [string, JsonObject][];
async function seedResearch(client: KGOSClient): Promise<ResearchFixture> {
  const initial = await client.evolution.overview();
  const receipt = await client.object.patch({
    branch: "main",
    baseState: initial.state,
    patch: objects.map(([ref, value]) => addedObject(ref, value)).join(""),
    message: "E2E research fixture",
    author: "P14 E2E"
  });
  return {
    state: receipt.state,
    model: created(receipt, "model"),
    paper: created(receipt, "paper"),
    unlabelled: created(receipt, "unlabelled"),
    describes: [
      created(receipt, "describes-one", "knowledge-relationship"),
      created(receipt, "describes-two", "knowledge-relationship")
    ],
    selfLoop: created(receipt, "self", "knowledge-relationship"),
    reverse: created(receipt, "reverse", "knowledge-relationship")
  };
}

export async function connect(page: Page, runtime: RuntimeFixture): Promise<void> {
  await page.goto(runtime.origin);
  await reconnect(page, runtime);
}

export async function reconnect(page: Page, runtime: RuntimeFixture): Promise<void> {
  await page.getByRole("button", { name: "连接 Runtime", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "连接当前 Runtime", exact: true });
  await dialog.getByLabel("访问凭证").fill(runtime.token);
  await dialog.getByRole("button", { name: "连接", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".connection-status")).toHaveText("已连接");
  await expect(page.getByRole("button", { name: "运行查询", exact: true })).toBeEnabled();
}

export async function selectState(page: Page, state: string): Promise<void> {
  await page.getByRole("combobox", { name: "浏览版本", exact: true }).fill(state);
  await page.getByRole("button", { name: "选择版本", exact: true }).click();
  await expect(page.locator(".context-bar .badge")).toHaveAttribute(
    "title",
    state.startsWith("commit/") ? state : /^commit\/[0-9a-f]{64}$/u
  );
  await expect(page.getByRole("button", { name: "运行查询", exact: true })).toBeEnabled();
}

export async function runQuery(page: Page, statement: string): Promise<void> {
  await page.getByRole("textbox", { name: "Cypher 语句", exact: true }).fill(statement);
  await page.getByRole("button", { name: "运行查询", exact: true }).click();
  await expect(page.locator(".query-frame").first().getByRole("status").first()).toContainText(
    "完成"
  );
}

export async function editorRecord(runtime: RuntimeFixture) {
  const info = await runtime.client.web.data.info();
  if (info.storeId === undefined) throw new Error("real Web store is not ready");
  const list = await runtime.client.web.data.list({ storeId: info.storeId, kind: "editor" });
  const header = list.items.find((item) => !item.deleted);
  if (header === undefined) return undefined;
  return await runtime.client.web.data.read({
    storeId: info.storeId,
    kind: "editor",
    id: header.id
  });
}

export const test = base.extend<{ runtime: RuntimeFixture; research: ResearchFixture }>({
  runtime: async ({ browserName }, use) => {
    const runtime = await startRuntime(browserName);
    try {
      await use(runtime);
    } finally {
      await runtime.stop();
    }
  },
  research: async ({ runtime }, use) => {
    await use(await seedResearch(runtime.client));
  }
});

export { expect, randomUUID };
