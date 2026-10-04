import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { KGOSClient, KGOSDaemonError } from "@kgos/sdk";

import { connect, expect, randomUUID, runQuery, startRuntime, test } from "./runtime-fixture.js";

import { unavailableStore } from "./store-failure.js";

test.describe.configure({ timeout: 60_000 });

test("isolates two packed Workspaces, validates boot before mutation, and preserves typed cache bytes", async ({
  runtime,
  research
}) => {
  const second = await startRuntime();
  try {
    const info = await runtime.client.web.data.info();
    const other = await second.client.web.data.info();
    if (info.storeId === undefined || other.storeId === undefined)
      throw new Error("Web stores are absent");
    expect(info.storeId).not.toBe(other.storeId);
    expect(info.databaseId).not.toBe(other.databaseId);
    expect(info.daemonBootId).not.toBe(other.daemonBootId);
    expect((await second.client.evolution.overview()).state).not.toBe(research.state);
    const guarded = new KGOSClient({
      endpoint: second.endpoint,
      token: second.token,
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("X-KGOS-Expected-Daemon-Boot", info.daemonBootId);
        return fetch(input, { ...init, headers });
      }
    });
    const initialOther = (await second.client.evolution.overview()).state;
    await expect(
      guarded.evolution.state.create({ branch: "main", message: "must not execute" })
    ).rejects.toMatchObject({ code: "WEB_CONNECTION_CHANGED" });
    expect((await second.client.evolution.overview()).state).toBe(initialOther);
    const wrongToken = new KGOSClient({ endpoint: second.endpoint, token: runtime.token });
    await expect(wrongToken.evolution.overview()).rejects.toMatchObject({
      code: "AUTHENTICATION_FAILED"
    });
    await expect(
      second.client.web.data.save({
        storeId: info.storeId,
        kind: "editor",
        id: randomUUID(),
        expectedRevision: null,
        mutationId: randomUUID(),
        data: { version: 1, statement: "RETURN 'other library'", paramsText: "{", mode: "query" }
      })
    ).rejects.toMatchObject({ code: "WEB_DATA_CHANGED" });

    const result = await runtime.client.graph.query({
      at: research.state,
      cypher: "MATCH (n:Model) RETURN n"
    });
    const id = randomUUID();
    const record = await runtime.client.web.data.save({
      storeId: info.storeId,
      kind: "frame",
      id,
      expectedRevision: null,
      mutationId: randomUUID(),
      data: {
        version: 1,
        mode: "query",
        statement: "MATCH (n:Model) RETURN n",
        params: {},
        status: "complete",
        closed: false,
        readState: result.state,
        resultState: result.state
      }
    });
    expect(record.revision).toBe("1");
    await runtime.client.web.cache.write({
      storeId: info.storeId,
      frameId: id,
      frameRevision: record.revision,
      result: { ...result, valueEncoding: "lithograph-json-v1" }
    });
    const hit = await runtime.client.web.cache.read({ storeId: info.storeId, frameId: id });
    expect(hit).toEqual({ hit: true, result: { ...result, valueEncoding: "lithograph-json-v1" } });
    expect(JSON.stringify(hit)).toContain("9223372036854775807");
    const exported = Buffer.from(await (await runtime.client.web.data.export()).arrayBuffer());
    expect(exported.subarray(0, 15).toString("utf8")).toBe("SQLite format 3");
    expect(exported.includes(Buffer.from(runtime.token))).toBe(false);
    const mode = (await stat(join(runtime.workspaceRoot, ".kgos", "web", "ui.db"))).mode & 0o777;
    if (process.platform !== "win32") expect(mode).toBe(0o600);
    const deleted = await runtime.client.web.data.delete({
      storeId: info.storeId,
      kind: "frame",
      id,
      expectedRevision: record.revision,
      mutationId: randomUUID()
    });
    expect(deleted.data).toBeNull();
    expect(deleted.deleted).toBe(true);
    expect(await runtime.client.web.cache.read({ storeId: info.storeId, frameId: id })).toEqual({
      hit: false
    });
    await expect(
      runtime.client.web.cache.write({
        storeId: info.storeId,
        frameId: id,
        frameRevision: record.revision,
        result: { ...result, valueEncoding: "lithograph-json-v1" }
      })
    ).rejects.toMatchObject({ code: "WEB_DATA_CHANGED" });
    expect((await runtime.client.evolution.overview()).state).toBe(research.state);
  } finally {
    await second.stop();
  }
});

test("enforces real CAS and record quota without losing the last confirmed input or creating knowledge States", async ({
  runtime
}) => {
  const initial = (await runtime.client.evolution.overview()).state;
  const info = await runtime.client.web.data.info();
  if (info.storeId === undefined) throw new Error("Web store is absent");
  const id = randomUUID();
  const data = { version: 1, statement: "RETURN 'base'", paramsText: "{", mode: "query" };
  const original = await runtime.client.web.data.save({
    storeId: info.storeId,
    kind: "editor",
    id,
    expectedRevision: null,
    mutationId: randomUUID(),
    data
  });
  const requests = ["first window", "second window"].map((statement) =>
    runtime.client.web.data.save({
      storeId: info.storeId ?? "",
      kind: "editor",
      id,
      expectedRevision: original.revision,
      mutationId: randomUUID(),
      data: { ...data, statement }
    })
  );
  const outcomes = await Promise.allSettled(requests);
  expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
  const rejected = outcomes.find((outcome) => outcome.status === "rejected");
  if (rejected?.status !== "rejected")
    throw new Error("CAS race unexpectedly accepted both writes");
  expect(rejected.reason).toBeInstanceOf(KGOSDaemonError);
  expect(rejected.reason as KGOSDaemonError).toMatchObject({ code: "WEB_DATA_CHANGED" });
  const confirmed = await runtime.client.web.data.read({
    storeId: info.storeId,
    kind: "editor",
    id
  });
  await expect(
    runtime.client.web.data.save({
      storeId: info.storeId,
      kind: "editor",
      id,
      expectedRevision: confirmed.revision,
      mutationId: randomUUID(),
      data: { ...data, statement: "x".repeat((8 << 20) + 1) }
    })
  ).rejects.toMatchObject({ code: "RESOURCE_ERROR" });
  expect(await runtime.client.web.data.read({ storeId: info.storeId, kind: "editor", id })).toEqual(
    confirmed
  );
  expect((await runtime.client.evolution.overview()).state).toBe(initial);
  const query = await runtime.client.graph.query({ at: initial, cypher: "RETURN 1 AS alive" });
  expect(query.rows).toHaveLength(1);
});

test("keeps Kernel browsing available when the actual Web managed directory fails", async ({
  page,
  runtime,
  research
}) => {
  await runtime.client.web.data.info();
  const restore = await unavailableStore(runtime);
  try {
    expect((await runtime.client.web.data.info()).storageStatus).toBe("unavailable");
    await connect(page, runtime);
    await expect(page.getByText("工作区保存库 unavailable", { exact: false })).toBeVisible();
    await runQuery(page, "MATCH (n:Model) RETURN n");
    await expect(
      page
        .locator(".query-frame")
        .getByRole("button", { name: `${research.model} Lumen-7B`, exact: true })
    ).toBeVisible();
    expect((await runtime.client.evolution.overview()).state).toBe(research.state);
  } finally {
    await restore();
  }
  expect((await runtime.client.web.data.info()).storageStatus).toBe("ready");
});

test("reports committed Knowledge separately from a failed Web receipt and retries only receipt storage", async ({
  page,
  runtime,
  research
}) => {
  await connect(page, runtime);
  await runQuery(page, "MATCH (n:Model) RETURN n");
  const frame = page.locator(".query-frame").first();
  await frame.getByRole("button", { name: `${research.model} Lumen-7B`, exact: true }).click();
  await frame.getByRole("button", { name: "编辑对象", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "对象草稿", exact: true });
  await editor
    .getByLabel("name · YAML 值", { exact: true })
    .fill('"Committed despite receipt failure"');
  await editor.getByRole("button", { name: "查看 Patch", exact: true }).click();
  let restore: (() => Promise<void>) | undefined;
  let patches = 0;
  await page.route("**/api/v1/object/patch", async (route) => {
    patches += 1;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    restore = await unavailableStore(runtime);
    await route.fulfill({ response });
  });
  try {
    await editor.getByRole("button", { name: "确认提交到 main", exact: true }).click();
    const receipt = editor.getByRole("status", { name: "真实提交回执", exact: true });
    await expect(receipt).toContainText("知识已提交");
    await expect(receipt).toContainText("Web 回执未保存");
    expect(patches).toBe(1);
    const head = (await runtime.client.evolution.overview()).state;
    expect(head).not.toBe(research.state);
    expect(
      JSON.stringify(
        (await runtime.client.object.read({ at: head, refs: [research.model] })).results
      )
    ).toContain("Committed despite receipt failure");
    if (restore === undefined) throw new Error("receipt failure was not induced");
    await restore();
    restore = undefined;
    await receipt.getByRole("button", { name: "重试保存回执", exact: true }).click();
    await expect(receipt).toContainText("回执已保存");
    expect(patches).toBe(1);
    expect((await runtime.client.evolution.overview()).state).toBe(head);
    const files = await readFile(join(runtime.workspaceRoot, ".kgos", "web", "ui.db"));
    expect(files.includes(Buffer.from(runtime.token))).toBe(false);
  } finally {
    await restore?.();
  }
});
