import { afterEach, expect, it, vi } from "vitest";
import {
  type WebDeleteRequest,
  type WebReadRequest,
  type WebRecord,
  type WebRecordKind,
  type WebSaveRequest
} from "@kgos/sdk";

import { Connection } from "./connection.js";
import { RecordSlot, Records } from "./records.js";
import { Workspace } from "./workspace.js";

const endpoint = "http://127.0.0.1:42";
const storeId = "store";
const initial: WebRecord = {
  kind: "editor",
  id: "editor-id",
  revision: "9007199254740993",
  deleted: false,
  lastMutationId: "previous",
  data: { statement: "RETURN 1" }
};
const failure = (code: string) => Response.json({ code, message: code }, { status: 409 });

function storage(seed: WebRecord[] = [initial]) {
  const values = new Map(seed.map((record) => [record.id, structuredClone(record)]));
  const read = vi.fn<(request: WebReadRequest) => Response | Promise<Response>>((request) => {
    const record = values.get(request.id);
    return record === undefined ? failure("OBJECT_NOT_FOUND") : Response.json(record);
  });
  const save = vi.fn<(request: WebSaveRequest) => Response | Promise<Response>>((request) => {
    const old = values.get(request.id);
    if (old?.deleted === true || (old?.revision ?? null) !== request.expectedRevision)
      return failure("WEB_DATA_CHANGED");
    const record: WebRecord = {
      ...request,
      revision: (BigInt(old?.revision ?? "0") + 1n).toString(),
      deleted: false,
      lastMutationId: request.mutationId
    };
    values.set(request.id, record);
    return Response.json(record);
  });
  const remove = vi.fn<(request: WebDeleteRequest) => Response | Promise<Response>>((request) => {
    const old = values.get(request.id);
    if (old?.revision !== request.expectedRevision) return failure("WEB_DATA_CHANGED");
    const record: WebRecord = {
      ...old,
      revision: (BigInt(old.revision) + 1n).toString(),
      deleted: true,
      data: null,
      lastMutationId: request.mutationId
    };
    values.set(request.id, record);
    return Response.json(record);
  });
  const list = vi.fn<() => Response>(() => Response.json({ items: [...values.values()] }));
  const fetcher = vi.fn<typeof fetch>((input, init) => {
    const path = input instanceof Request ? input.url : input.toString();
    if (path.endsWith("/info"))
      return Promise.resolve(
        Response.json({ daemonBootId: "boot", storeId, storageStatus: "ready" })
      );
    if (path.endsWith("/list")) return Promise.resolve(list());
    const body = init?.body;
    if (typeof body !== "string") throw new Error("Expected SDK JSON body");
    if (path.endsWith("/save")) return Promise.resolve(save(JSON.parse(body) as WebSaveRequest));
    if (path.endsWith("/delete"))
      return Promise.resolve(remove(JSON.parse(body) as WebDeleteRequest));
    return Promise.resolve(read(JSON.parse(body) as WebReadRequest));
  });
  return { values, read, save, remove, list, fetcher };
}

async function windowRecords(server: ReturnType<typeof storage>) {
  const connection = new Connection(endpoint, server.fetcher);
  await connection.connect("opaque");
  const records = new Records(connection, storeId);
  const slot = records.add("editor", structuredClone(initial.data ?? {}), initial);
  return { connection, records, slot };
}

afterEach(() => {
  vi.useRealTimers();
});

it("serializes saves and only confirms the sent version when edits arrive in flight", async () => {
  const server = storage();
  const { records, slot } = await windowRecords(server);
  const delayed = Promise.withResolvers<Response>();
  server.save.mockReturnValueOnce(delayed.promise);
  slot.edit({ statement: "RETURN 2" });
  const first = slot.flush();
  const second = slot.flush();
  slot.edit({ statement: "RETURN 3", unfinished: "{" });
  expect(server.save).toHaveBeenCalledOnce();
  expect(slot.dirty).toBe(true);
  const sent = server.save.mock.calls[0]?.[0];
  expect(sent?.expectedRevision).toBe("9007199254740993");
  delayed.resolve(
    Response.json({
      ...initial,
      data: sent?.data,
      revision: "9007199254740994",
      lastMutationId: sent?.mutationId
    })
  );
  server.values.set(initial.id, {
    ...initial,
    data: { statement: "RETURN 2" },
    revision: "9007199254740994"
  });
  expect(await first).toBe(false);
  expect(await second).toBe(true);
  expect(server.save).toHaveBeenCalledTimes(2);
  expect(server.save.mock.calls[1]?.[0]).toMatchObject({
    expectedRevision: "9007199254740994",
    data: { statement: "RETURN 3", unfinished: "{" }
  });
  expect(slot.status).toBe("已保存");
  expect(records.dirty).toBe(false);
  records.stop();
});

it("debounces unfinished input and does not restart saving stopped records", async () => {
  const server = storage();
  const { records, slot } = await windowRecords(server);
  vi.useFakeTimers();
  slot.edit({ statement: "RETURN (", paramsText: "{" });
  await vi.advanceTimersByTimeAsync(400);
  slot.edit({ statement: "RETURN (n", paramsText: "{" });
  await vi.advanceTimersByTimeAsync(499);
  expect(server.save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(slot.status).toBe("已保存");
  records.stop();
  slot.edit({ statement: "RETURN (m" });
  await vi.advanceTimersByTimeAsync(500);
  expect(server.save).toHaveBeenCalledOnce();
  expect(await slot.flush()).toBe(false);
});

it("confirms lost responses by matching mutation and payload, never revision alone", async () => {
  const server = storage();
  const { records, slot } = await windowRecords(server);
  server.save.mockImplementationOnce((request) => {
    server.values.set(request.id, {
      ...initial,
      revision: "9007199254740994",
      data: request.data,
      lastMutationId: request.mutationId
    });
    return Promise.reject(new Error("response lost"));
  });
  slot.edit({ statement: "RETURN 2" });
  expect(await slot.flush()).toBe(true);
  expect(slot.confirmed?.revision).toBe("9007199254740994");
  server.save.mockImplementationOnce((request) => {
    server.values.set(request.id, {
      ...initial,
      revision: "9007199254740995",
      data: request.data,
      lastMutationId: "other-window"
    });
    return Promise.reject(new Error("response lost"));
  });
  slot.edit({ statement: "RETURN 3" });
  expect(await slot.flush()).toBe(false);
  expect(slot.status).toBe("内容冲突");
  expect(slot.confirmed?.revision).toBe("9007199254740994");
  expect(slot.data).toEqual({ statement: "RETURN 3" });
  expect(await slot.flush()).toBe(false);
  expect(server.save).toHaveBeenCalledTimes(2);
  records.stop();
});

it("retains the previous confirmation and input when storage or reconciliation fails", async () => {
  const server = storage();
  const { connection, records, slot } = await windowRecords(server);
  server.save.mockReturnValueOnce(failure("RESOURCE_ERROR"));
  slot.edit({ statement: "RETURN 2" });
  expect(await slot.flush()).toBe(false);
  expect(slot.confirmed).toEqual(initial);
  expect(slot.data).toEqual({ statement: "RETURN 2" });
  expect(slot.status).toBe("未保存");
  server.save.mockRejectedValueOnce(new Error("lost"));
  server.read.mockRejectedValueOnce(new Error("offline"));
  expect(await slot.flush()).toBe(false);
  expect(slot.status).toBe("结果待核对");
  expect(slot.error).toContain("daemon request failed");
  connection.info = { daemonBootId: "new", storageStatus: "ready", storeId: "other" };
  await expect(slot.readRemote()).rejects.toThrow("保存库已变化");
  expect(await slot.flush()).toBe(false);
  expect(slot.data).toEqual({ statement: "RETURN 2" });
  records.stop();
});

it("keeps both windows during CAS conflict and saves an explicit copy with a new ID", async () => {
  const server = storage();
  const first = await windowRecords(server);
  const second = await windowRecords(server);
  first.slot.edit({ statement: "RETURN 'first'" });
  second.slot.edit({ statement: "RETURN 'second'" });
  expect(await first.slot.flush()).toBe(true);
  expect(await second.slot.flush()).toBe(false);
  expect(second.slot.remote?.data).toEqual(first.slot.data);
  expect(second.slot.data).toEqual({ statement: "RETURN 'second'" });
  expect(second.slot.confirmed).toEqual(initial);
  const oldId = second.slot.id;
  expect(await second.slot.saveCopy()).toBe(true);
  expect(second.slot.id).not.toBe(oldId);
  expect(server.values.get(oldId)?.data).toEqual(first.slot.data);
  expect(server.values.get(second.slot.id)?.data).toEqual({ statement: "RETURN 'second'" });
  expect(server.save.mock.calls[2]?.[0]?.expectedRevision).toBeNull();
  first.records.stop();
  second.records.stop();
});

it("allows independent records and only adopts remote contents on explicit use", async () => {
  const server = storage();
  const { records, slot } = await windowRecords(server);
  const another = records.add("draft", { text: "unfinished" });
  expect(await another.flush()).toBe(true);
  slot.remote = { ...initial, revision: "9007199254740994", data: { statement: "remote" } };
  slot.status = "内容冲突";
  slot.edit({ statement: "local" });
  expect(slot.status).toBe("内容冲突");
  expect(slot.adoption).toBe(0);
  slot.useRemote();
  expect(slot.adoption).toBe(1);
  expect(slot.status).toBe("已保存");
  expect(slot.data).toEqual({ statement: "remote" });
  expect(slot.remote).toBeUndefined();
  expect(await slot.flush()).toBe(true);
  slot.useRemote();
  expect(server.save).toHaveBeenCalledOnce();
  records.stop();
});

it("keeps tombstones deleted, reconciles lost delete receipts, and cannot resurrect the ID", async () => {
  const server = storage();
  const first = await windowRecords(server);
  const stale = await windowRecords(server);
  server.remove.mockImplementationOnce((request) => {
    server.values.set(request.id, {
      ...initial,
      deleted: true,
      data: null,
      revision: "9007199254740994",
      lastMutationId: request.mutationId
    });
    return Promise.reject(new Error("lost delete"));
  });
  expect(await first.slot.delete()).toBe(true);
  expect(first.slot.status).toBe("已删除");
  expect(first.records.dirty).toBe(false);
  stale.slot.edit({ statement: "stale" });
  expect(await stale.slot.flush()).toBe(false);
  expect(stale.slot.remote?.deleted).toBe(true);
  stale.slot.useRemote();
  expect(stale.slot.data).toEqual({ statement: "stale" });
  expect(await stale.slot.saveCopy()).toBe(true);
  expect(server.values.get(initial.id)?.data).toBeNull();
  expect(server.values.get(stale.slot.id)?.data).toEqual({ statement: "stale" });
  first.records.stop();
  stale.records.stop();
});

it("deletes confirmed data with CAS and keeps conflicts and unavailable actions local", async () => {
  const server = storage();
  const { connection, records, slot } = await windowRecords(server);
  expect(await records.add("draft", { text: "new" }).delete()).toBe(false);
  server.remove.mockReturnValueOnce(failure("WEB_DATA_CHANGED"));
  expect(await slot.delete()).toBe(false);
  expect(slot.remote).toEqual(initial);
  slot.useRemote();
  expect(await slot.delete()).toBe(true);
  expect(server.remove.mock.calls[1]?.[0]?.expectedRevision).toBe(initial.revision);
  expect(slot.confirmed?.data).toBeNull();
  connection.disconnect();
  const disconnected = new RecordSlot(
    connection,
    { storeId, kind: "draft", id: "new" },
    { text: "keep" }
  );
  expect(await disconnected.flush()).toBe(false);
  expect(await disconnected.delete()).toBe(false);
  records.stop();
});

it("lists bounded pages without replacing local slots or reviving deleted records", async () => {
  const server = storage([
    { ...initial, data: { statement: "saved" } },
    { ...initial, id: "deleted", deleted: true, data: null }
  ]);
  const { connection, records, slot } = await windowRecords(server);
  slot.edit({ statement: "local" });
  server.list.mockReturnValueOnce(
    Response.json({
      items: [{ ...initial, id: "new" }, initial, { ...initial, id: "deleted", deleted: true }],
      cursor: "opaque-next"
    })
  );
  server.values.set("new", { ...initial, id: "new", data: { statement: "next" } });
  expect(await records.load("editor")).toHaveLength(1);
  expect(slot.data).toEqual({ statement: "local" });
  expect(records.cursors.get("editor")).toBe("opaque-next");
  expect(await records.load("editor", true)).toEqual([]);
  expect(server.fetcher.mock.calls.at(-1)?.[1]?.body).toContain('"cursor":"opaque-next"');
  expect(records.cursors.has("editor")).toBe(false);
  server.list.mockReturnValueOnce(failure("RESOURCE_ERROR"));
  expect(await records.load("frame")).toEqual([]);
  expect(records.error).toContain("RESOURCE_ERROR");
  connection.disconnect();
  expect(await records.load("draft")).toEqual([]);
  records.stop();
});

function restorationPages() {
  const kinds: WebRecordKind[] = ["workspace", "editor", "frame", "draft", "query"];
  const saved = kinds.flatMap((kind) =>
    Array.from({ length: 51 }, (_, index): WebRecord => ({
      ...initial,
      kind,
      id: `${kind}-${String(index)}`,
      data: {
        version: 1,
        statement: `RETURN ${String(index)}`,
        paramsText: "{",
        inputRef: "branch/main",
        state: "commit/original",
        readState: "commit/original",
        params: {},
        mode: "query",
        status: "complete",
        rowCount: index,
        subtype: "object",
        editText: "invalid: ["
      }
    }))
  );
  const fetcher = vi.fn<typeof fetch>((input, init) => {
    const path = input instanceof Request ? input.url : input.toString();
    if (path.endsWith("/info"))
      return Promise.resolve(
        Response.json({ daemonBootId: "boot", storeId, storageStatus: "ready" })
      );
    if (path.endsWith("/get")) return Promise.resolve(Response.json({ state: "commit/original" }));
    if (path.endsWith("/branch/list"))
      return Promise.resolve(
        Response.json({ items: [{ name: "main", state: "commit/original" }] })
      );
    if (path.endsWith("/tag/list")) return Promise.resolve(Response.json({ items: [] }));
    const body = init?.body;
    if (typeof body !== "string") throw new Error("Expected restoration request");
    const request = JSON.parse(body) as { kind: WebRecordKind; id: string; cursor?: string };
    if (path.endsWith("/data/read"))
      return Promise.resolve(Response.json(saved.find((record) => record.id === request.id)));
    if (!path.endsWith("/data/list")) throw new Error(`Unexpected restoration action ${path}`);
    const candidates = saved.filter((record) => record.kind === request.kind);
    const offset = request.cursor === undefined ? 0 : 50;
    if (offset !== 0) expect(request.cursor).toBe(`${request.kind}/opaque-after-50`);
    return Promise.resolve(
      Response.json({
        items: candidates.slice(offset, offset + 50),
        ...(offset === 0 ? { cursor: `${request.kind}/opaque-after-50` } : {})
      })
    );
  });
  return { fetcher, saved };
}

it("restores every durable record page, retains incomplete drafts, and pages query favorites on demand", async () => {
  const { fetcher, saved } = restorationPages();
  const workspace = new Workspace(endpoint, fetcher);
  try {
    await workspace.connect("opaque");
    const records = workspace.records;
    expect(records?.slots.filter((slot) => slot.kind === "draft")).toHaveLength(51);
    expect(records?.slots.filter((slot) => slot.kind === "frame")).toHaveLength(50);
    expect(records?.slots.filter((slot) => slot.kind === "editor")).toHaveLength(51);
    expect(records?.slots.filter((slot) => slot.kind === "workspace")).toHaveLength(51);
    expect(records?.slots.filter((slot) => slot.kind === "query")).toHaveLength(50);
    expect(records?.cursors.get("query")).toBe("query/opaque-after-50");
    expect(records?.cursors.get("frame")).toBe("frame/opaque-after-50");
    expect(records?.slots.find((slot) => slot.id === "draft-50")?.data).toEqual(
      saved.find((record) => record.id === "draft-50")?.data
    );
    expect(workspace.engine.frames).toHaveLength(50);
    expect(workspace.engine.frames[0]?.request.paramsText).toBe("{");
    expect(workspace.engine.frames[0]?.request.params).toEqual({});
    await records?.load("frame", true);
    workspace.engine.restore();
    expect(workspace.engine.frames).toHaveLength(51);
    expect(workspace.engine.active).toBe(0);
    expect(
      fetcher.mock.calls.some(([input]) =>
        (input instanceof Request ? input.url : input.toString()).includes("/graph/")
      )
    ).toBe(false);
  } finally {
    workspace.records?.stop();
    workspace.disconnect();
  }
});

it("retries the same page after a transient body-read failure without skipping its remaining records", async () => {
  const first: WebRecord = { ...initial, kind: "draft", id: "A", data: { editText: "{" } };
  const second: WebRecord = { ...first, id: "B", data: { editText: "invalid: [" } };
  const server = storage([first, second]);
  const { records } = await windowRecords(server);
  server.list.mockImplementation(() => Response.json({ items: [first, second], cursor: "next" }));
  server.read.mockReturnValueOnce(
    Response.json({ code: "RESOURCE_ERROR", message: "temporary read failure" }, { status: 500 })
  );
  expect(await records.load("draft")).toEqual([]);
  expect(records.error).toContain("temporary read failure");
  expect(records.cursors.has("draft")).toBe(false);
  const loaded = await records.load("draft", true);
  expect(loaded.map((slot) => slot.id)).toEqual(["A", "B"]);
  expect(loaded[0]?.data).toEqual(first.data);
  expect(loaded[1]?.data).toEqual(second.data);
  expect(records.cursors.get("draft")).toBe("next");
  expect(records.error).toBe("");
  expect(server.read.mock.calls.map(([request]) => request.id)).toEqual(["A", "A", "B"]);
  const listed = server.fetcher.mock.calls.filter(([input]) =>
    (input instanceof Request ? input.url : input.toString()).endsWith("/data/list")
  );
  expect(listed.map(([, init]) => init?.body)).toEqual([
    '{"storeId":"store","kind":"draft","limit":50}',
    '{"storeId":"store","kind":"draft","limit":50}'
  ]);
  records.stop();
});

it("shares a pending page per kind across double clicks while another kind can load independently", async () => {
  const draft: WebRecord = { ...initial, kind: "draft", id: "draft", data: { editText: "{" } };
  const frame: WebRecord = { ...initial, kind: "frame", id: "frame" };
  const server = storage([draft, frame]);
  const { records } = await windowRecords(server);
  const response = Promise.withResolvers<Response>();
  server.list
    .mockReturnValueOnce(Response.json({ items: [draft] }))
    .mockReturnValueOnce(Response.json({ items: [frame] }));
  server.read.mockReturnValueOnce(response.promise);
  const first = records.load("draft", true);
  await vi.waitFor(() => {
    expect(server.read).toHaveBeenCalledOnce();
  });
  const duplicate = records.load("draft", true);
  expect((await records.load("frame", true)).map((slot) => slot.id)).toEqual(["frame"]);
  expect(server.list).toHaveBeenCalledTimes(2);
  expect(server.read).toHaveBeenCalledTimes(2);
  response.resolve(Response.json(draft));
  const [original, repeated] = await Promise.all([first, duplicate]);
  expect(repeated).toBe(original);
  expect(original.map((slot) => slot.id)).toEqual(["draft"]);
  expect(records.slots.filter((slot) => slot.kind === "draft")).toHaveLength(1);
  expect(server.list).toHaveBeenCalledTimes(2);
  records.stop();
});
