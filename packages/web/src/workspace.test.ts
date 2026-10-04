import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type JsonObject,
  type WebRecord,
  type WebRecordKind,
  type WebStoreInfo,
  type WebSaveRequest
} from "@kgos/sdk";

import { Connection } from "./connection.js";
import { Frame, FRAME_LIMITS, type FrameSnapshot } from "./frame.js";
import { FrameEngine } from "./frame-engine.js";

import { Records } from "./records.js";
import { Workspace } from "./workspace.js";

const state = "commit/original";
const record = (kind: WebRecordKind, data: JsonObject): WebRecord => ({
  kind,
  data,
  id: `${kind}-id`,
  revision: "9007199254740993",
  deleted: false,
  lastMutationId: "saved"
});

function server(seed: WebRecord[] = []) {
  const records = new Map(seed.map((item) => [item.id, item]));
  const info: WebStoreInfo = { daemonBootId: "boot", storageStatus: "ready", storeId: "store" };
  const resolved = vi.fn<() => Response>(() => Response.json({ state }));
  const fetcher = vi.fn<typeof fetch>((input, init) => {
    const path = input instanceof Request ? input.url : input.toString();
    if (path.endsWith("/info")) return Promise.resolve(Response.json(info));
    if (path.endsWith("/get")) return Promise.resolve(resolved());
    if (path.endsWith("/branch/list"))
      return Promise.resolve(
        Response.json({ items: [{ name: "main", state: "commit/new-head" }] })
      );
    if (path.endsWith("/tag/list")) return Promise.resolve(Response.json({ items: [] }));
    const body = init?.body;
    if (typeof body !== "string") throw new Error("Expected SDK request body");
    const request = JSON.parse(body) as {
      kind: WebRecordKind;
      id: string;
      data: JsonObject;
      mutationId: string;
    };
    if (path.endsWith("/data/list"))
      return Promise.resolve(
        Response.json({ items: [...records.values()].filter((item) => item.kind === request.kind) })
      );
    if (path.endsWith("/data/read")) return Promise.resolve(Response.json(records.get(request.id)));
    if (path.endsWith("/data/save")) {
      const saved = {
        ...record(request.kind, request.data),
        id: request.id,
        lastMutationId: request.mutationId
      };
      records.set(request.id, saved);
      return Promise.resolve(Response.json(saved));
    }
    throw new Error(`Unexpected route ${path}`);
  });
  return {
    records,
    info,
    resolved,
    fetcher,
    workspace: new Workspace("http://127.0.0.1:42", fetcher)
  };
}

const open: Workspace[] = [];
afterEach(() => {
  for (const workspace of open.splice(0)) workspace.records?.stop();
});

describe("workspace restoration and connection loss", () => {
  it("restores saved input, pinned State, active frame metadata and camera without running", async () => {
    const setup = server([
      record("workspace", { inputRef: "branch/main", state, tab: "ontology" }),
      record("editor", { statement: "CREATE (", paramsText: "{", mode: "execute" }),
      record("frame", {
        mode: "query",
        statement: "RETURN n",
        params: {},
        readState: state,
        inputRef: "branch/main",
        status: "running",
        rowCount: 12,
        camera: { x: 12, y: 34, zoom: 2 },
        selected: "n:0"
      }),
      record("draft", { subtype: "object", editText: "invalid: [" })
    ]);
    const { workspace, fetcher } = setup;
    open.push(workspace);
    await workspace.connect("opaque");
    expect(workspace.statement).toBe("CREATE (");
    expect(workspace.paramsText).toBe("{");
    expect(workspace.mode).toBe("execute");
    expect(workspace.tab).toBe("ontology");
    expect(workspace.context.state).toBe(state);
    expect(workspace.context.headChanged).toBe(true);
    expect(workspace.engine.frames[0]).toMatchObject({
      status: "running",
      restored: true,
      rowCount: 12,
      selected: "n:0",
      camera: { x: 12, y: 34, zoom: 2 }
    });
    expect(workspace.engine.active).toBe(0);
    expect(workspace.editor?.dirty).toBe(false);
    expect(workspace.engine.frames[0]?.slot?.dirty).toBe(false);
    expect(
      fetcher.mock.calls.some(([input]) =>
        (input instanceof Request ? input.url : input.toString()).includes("/graph/")
      )
    ).toBe(false);
    expect(setup.records.get("frame-id")?.data?.["status"]).toBe("running");
  });

  it("preserves an unavailable original State and does not silently select the current head", async () => {
    const { workspace, resolved, fetcher } = server([
      record("workspace", { inputRef: "branch/main", state }),
      record("editor", { statement: "RETURN old", paramsText: "{}" })
    ]);
    open.push(workspace);
    resolved.mockReturnValue(
      Response.json({ code: "STATE_NOT_FOUND", message: "original missing" }, { status: 404 })
    );
    await workspace.connect("opaque");
    expect(workspace.statement).toBe("RETURN old");
    expect(workspace.context.state).toBe("");
    expect(workspace.context.switchError).toContain("STATE_NOT_FOUND");
    expect(workspace.context.runnable).toBe(false);
    expect(
      fetcher.mock.calls.filter(([input]) =>
        (input instanceof Request ? input.url : input.toString()).endsWith("/get")
      )
    ).toHaveLength(1);
  });

  it("keeps local edits and viewport when reconnect detects another window's revision", async () => {
    const setup = server([record("editor", { statement: "RETURN saved", paramsText: "{}" })]);
    const { workspace } = setup;
    open.push(workspace);
    await workspace.connect("opaque");
    workspace.edit("RETURN local", "{", "execute");
    setup.records.set("editor-id", {
      ...record("editor", { statement: "RETURN remote", paramsText: "{}" }),
      revision: "9007199254740994"
    });
    await workspace.connect("new-token");
    expect(workspace.statement).toBe("RETURN local");
    expect(workspace.paramsText).toBe("{");
    expect(workspace.mode).toBe("execute");
    expect(workspace.editor?.status).toBe("内容冲突");
    expect(workspace.editor?.remote?.data?.["statement"]).toBe("RETURN remote");
    expect(workspace.editor?.confirmed?.revision).toBe("9007199254740993");
  });

  it("halts saving across store replacement while retaining input and old records", async () => {
    const setup = server();
    const { workspace } = setup;
    open.push(workspace);
    await workspace.connect("opaque");
    workspace.edit("RETURN unsaved", "{", "execute");
    const original = workspace.records;
    setup.info.storeId = "replacement";
    await workspace.connect("opaque");
    expect(workspace.records).toBe(original);
    expect(workspace.error).toContain("保存库已变化");
    expect(workspace.statement).toBe("RETURN unsaved");
    expect(await workspace.editor?.flush()).toBe(false);
    expect(workspace.editor?.data).toMatchObject({ statement: "RETURN unsaved", paramsText: "{" });
  });

  it("allows Kernel browsing when UI storage fails and preserves editor values on 401", async () => {
    const setup = server();
    const { workspace } = setup;
    open.push(workspace);
    setup.info.storageStatus = "unavailable";
    workspace.edit("RETURN local", "{", "execute");
    await workspace.connect("opaque");
    expect(workspace.connection.client).toBeDefined();
    expect(workspace.context.runnable).toBe(true);
    expect(workspace.records).toBeUndefined();
    expect(workspace.statement).toBe("RETURN local");
    setup.fetcher.mockResolvedValueOnce(
      Response.json({ code: "AUTHENTICATION_FAILED", message: "invalid" }, { status: 401 })
    );
    await workspace.select("branch/side");
    expect(workspace.connection.client).toBeUndefined();
    expect(workspace.statement).toBe("RETURN local");
    expect(workspace.paramsText).toBe("{");
    expect(workspace.context.state).toBe(state);
    expect(workspace.context.inputRef).toBe("branch/main");
  });

  it("persists explicit tabs and successful selections, never failed selection inputs", async () => {
    const { workspace, resolved } = server();
    open.push(workspace);
    await workspace.connect("opaque");
    workspace.switchTab("ontology");
    expect(workspace.layout?.data).toMatchObject({
      tab: "ontology",
      inputRef: "branch/main",
      state
    });
    resolved.mockReturnValueOnce(Response.json({ state: "commit/tag" }));
    await workspace.select("tag/release");
    expect(workspace.layout?.data).toMatchObject({ inputRef: "tag/release", state: "commit/tag" });
    resolved.mockReturnValueOnce(
      Response.json({ code: "STATE_NOT_FOUND", message: "missing" }, { status: 404 })
    );
    await workspace.select("tag/missing");
    expect(workspace.layout?.data).toMatchObject({ inputRef: "tag/release", state: "commit/tag" });
    workspace.disconnect();
    expect(workspace.connection.status).toBe("未连接");
    expect(workspace.statement).toBe("MATCH (n) RETURN n LIMIT 50");
  });

  it("abandons superseded bootstrap and releases restoration state on errors", async () => {
    const { workspace, fetcher } = server();
    open.push(workspace);
    const pending = Promise.withResolvers<Response>();
    fetcher.mockReturnValueOnce(pending.promise);
    const attempt = workspace.connect("opaque");
    workspace.disconnect();
    pending.resolve(
      Response.json({ daemonBootId: "old", storageStatus: "ready", storeId: "store" })
    );
    await attempt;
    expect(workspace.records).toBeUndefined();
    expect(workspace.restoring).toBe(false);
    workspace.records = new Records(workspace.connection, "store");
    const slot = workspace.records.add("editor", {}, record("editor", {}));
    vi.spyOn(slot, "readRemote").mockRejectedValue(new Error("restore failed"));
    await workspace.connect("opaque");
    expect(workspace.error).toBe("restore failed");
    expect(workspace.restoring).toBe(false);
  });
});

const snapshot: FrameSnapshot = {
  mode: "query",
  statement: "RETURN n",
  params: {},
  inputRef: "branch/main",
  readState: state
};
const node = {
  $type: "Node",
  elementId: "n:0",
  labels: [],
  properties: { big: { $type: "Integer", value: "9007199254740993" } }
};
const result = { state, columns: ["n"], rows: [[node]], valueEncoding: "lithograph-json-v1" };
const stores: Records[] = [];
function metadataRequest(body: RequestInit["body"]): WebSaveRequest {
  if (typeof body !== "string") throw new Error("Expected metadata save");
  return JSON.parse(body) as WebSaveRequest;
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing frame fixture");
  return value;
}
async function restored() {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ daemonBootId: "boot", storeId: "store", storageStatus: "ready" })
    );
  const connection = new Connection("http://127.0.0.1:42", fetcher);
  await connection.connect("opaque");
  const records = new Records(connection, "store");
  stores.push(records);
  const data = { version: 1, ...snapshot, status: "complete", rowCount: 1 };
  const confirmed: WebRecord = {
    kind: "frame",
    id: "frame",
    revision: "1",
    deleted: false,
    lastMutationId: "saved",
    data
  };
  const slot = records.add("frame", data, confirmed);
  const engine = new FrameEngine(connection, () => records);
  engine.restore();
  return { fetcher, connection, records, slot, engine, frame: required(engine.frames[0]) };
}
function stream(rows: unknown[][] = [[node]]) {
  const events = [
    { type: "columns", columns: ["n"] },
    ...rows.map((row) => ({ type: "row", row })),
    { type: "summary", state }
  ];
  return new Response(events.map((event) => JSON.stringify(event)).join("\n") + "\n", {
    headers: { "Content-Type": "application/x-ndjson" }
  });
}
afterEach(() => {
  for (const records of stores.splice(0)) records.stop();
});

it("loads complete cache only by explicit request and preserves typed values on hit or metadata on miss", async () => {
  const { fetcher, engine, frame } = await restored();
  expect(fetcher).toHaveBeenCalledOnce();
  expect(frame.evicted).toBe(true);
  fetcher.mockResolvedValueOnce(Response.json({ hit: false }));
  await engine.loadCache(frame);
  expect(frame.error).toContain("按原 State");
  expect(frame.rowCount).toBe(1);
  expect(frame.status).toBe("complete");
  expect(frame.request.readState).toBe(state);
  fetcher.mockResolvedValueOnce(Response.json({ hit: true, result }));
  await engine.loadCache(frame);
  expect(frame.rows).toEqual(result.rows);
  expect(frame.evicted).toBe(false);
  expect(frame.error).toBe("");
  expect(fetcher.mock.calls[1]?.[1]?.body).toContain('"frameId":"frame"');
  expect(frame.projection.nodes[0]?.properties).toEqual(node.properties);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("rejects cache mismatch and oversized rows without discarding existing results", async () => {
  const { fetcher, engine, frame } = await restored();
  frame.append([node], () => true);
  fetcher.mockResolvedValueOnce(
    Response.json({ hit: true, result: { ...result, state: "commit/wrong" } })
  );
  await engine.loadCache(frame);
  expect(frame.error).toContain("State 不匹配");
  expect(frame.rows).toEqual([[node]]);
  fetcher.mockResolvedValueOnce(
    Response.json({
      hit: true,
      result: { ...result, rows: Array.from({ length: FRAME_LIMITS.rows + 1 }, () => [0]) }
    })
  );
  await engine.loadCache(frame);
  expect(frame.error).toContain("预算");
  expect(frame.rows).toEqual([[node]]);
  fetcher.mockResolvedValueOnce(
    Response.json({ hit: true, result: { ...result, rows: [["x".repeat(FRAME_LIMITS.bytes)]] } })
  );
  await engine.loadCache(frame);
  expect(frame.error).toContain("预算");
  expect(frame.rows).toEqual([[node]]);
});

it("discards late cache failure after a newer successful load and after close", async () => {
  const { fetcher, engine, frame } = await restored();
  const older = Promise.withResolvers<Response>();
  fetcher
    .mockReturnValueOnce(older.promise)
    .mockResolvedValueOnce(Response.json({ hit: true, result }));
  const pending = engine.loadCache(frame);
  await engine.loadCache(frame);
  older.reject(new Error("late failed cache"));
  await pending;
  expect(fetcher.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
  expect(frame.rows).toEqual(result.rows);
  expect(frame.error).toBe("");
  const closed = Promise.withResolvers<Response>();
  fetcher.mockReturnValueOnce(closed.promise);
  const closing = engine.loadCache(frame);
  frame.cancel(true);
  closed.reject(new Error("closed late error"));
  await closing;
  expect(frame.closed).toBe(true);
  expect(frame.error).toBe("");
});

it("does not load closed, execute, incomplete or unattached frames", async () => {
  const { connection, fetcher, engine, frame } = await restored();
  frame.closed = true;
  await engine.loadCache(frame);
  frame.closed = false;
  frame.status = "partial";
  await engine.loadCache(frame);
  const execute = new Frame(
    {
      mode: "execute",
      statement: "CREATE(n)",
      params: {},
      inputRef: "branch/main",
      branch: "main"
    },
    frame.slot
  );
  execute.status = "complete";
  await engine.loadCache(execute);
  const unattached = new Frame(snapshot);
  unattached.status = "complete";
  await engine.loadCache(unattached);
  connection.disconnect();
  frame.status = "complete";
  await engine.loadCache(frame);
  expect(fetcher).toHaveBeenCalledOnce();
});

it("publishes original complete rows after their metadata commits without including neighbor expansion", async () => {
  const { fetcher, engine } = await restored();
  const saved = Promise.withResolvers<Response>();
  fetcher.mockResolvedValueOnce(stream()).mockReturnValueOnce(saved.promise);
  const frame = engine.run(snapshot);
  await vi.waitFor(() => {
    expect(frame.status).toBe("complete");
  });
  expect(fetcher).toHaveBeenCalledTimes(3);
  fetcher.mockResolvedValueOnce(stream([[2]]));
  frame.selected = "n:0";
  await engine.neighbors(frame);
  expect(frame.expandedRows).toEqual([[2]]);
  const body = fetcher.mock.calls[2]?.[1]?.body;
  const request = metadataRequest(body);
  fetcher.mockResolvedValueOnce(Response.json({}));
  saved.resolve(
    Response.json({
      kind: "frame",
      id: request.id,
      revision: "2",
      data: request.data,
      deleted: false,
      lastMutationId: request.mutationId
    })
  );
  await vi.waitFor(() => {
    expect(engine.active).toBe(0);
  });
  expect(fetcher.mock.calls[4]?.[1]?.body).toContain('"frameRevision":"2"');
  expect(fetcher.mock.calls[4]?.[1]?.body).toContain('"rows":[[{"$type":"Node"');
  expect(fetcher.mock.calls[4]?.[1]?.body).not.toContain('"rows":[[2]]');
});

it("blocks late cache publication when frame closes before its metadata save responds", async () => {
  const { fetcher, engine } = await restored();
  const saved = Promise.withResolvers<Response>();
  fetcher.mockResolvedValueOnce(stream()).mockReturnValueOnce(saved.promise);
  const frame = engine.run(snapshot);
  await vi.waitFor(() => {
    expect(frame.status).toBe("complete");
  });
  const body = fetcher.mock.calls[2]?.[1]?.body;
  const request = metadataRequest(body);
  frame.cancel(true);
  saved.resolve(
    Response.json({
      kind: "frame",
      id: request.id,
      revision: "1",
      data: request.data,
      deleted: false,
      lastMutationId: request.mutationId
    })
  );
  await vi.waitFor(() => {
    expect(engine.active).toBe(0);
  });
  expect(frame.closed).toBe(true);
  expect(frame.status).toBe("complete");
  expect(frame.slot?.data["closed"]).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("replaces a frame's immutable request only after explicit remote record adoption", async () => {
  const { engine, frame, slot } = await restored();
  const originalId = frame.localId;
  slot.remote = {
    kind: "frame",
    id: slot.id,
    revision: "2",
    deleted: false,
    lastMutationId: "remote",
    data: {
      ...slot.data,
      statement: "RETURN remote",
      readState: "commit/remote",
      camera: { x: 1, y: 2, zoom: 3 }
    }
  };
  slot.status = "内容冲突";
  slot.changed();
  expect(engine.frames[0]?.request.statement).toBe("RETURN n");
  slot.useRemote();
  expect(engine.frames[0]?.localId).not.toBe(originalId);
  expect(engine.frames[0]?.request.statement).toBe("RETURN remote");
  expect(engine.frames[0]?.state).toBe("commit/remote");
  expect(engine.frames[0]?.camera).toEqual({ x: 1, y: 2, zoom: 3 });
  expect(frame.generation).toBeGreaterThan(0);
});

it("updates the editor only after explicitly adopting the remote saved record", async () => {
  const { workspace } = server([record("editor", { statement: "RETURN saved", paramsText: "{}" })]);
  open.push(workspace);
  await workspace.connect("opaque");
  workspace.edit("RETURN local", "{");
  const editor = required(workspace.editor);
  editor.remote = {
    ...record("editor", { statement: "CREATE (n)", paramsText: "[]", mode: "execute" }),
    revision: "9007199254740994"
  };
  editor.status = "内容冲突";
  editor.changed();
  expect(workspace.statement).toBe("RETURN local");
  editor.useRemote();
  expect(workspace.statement).toBe("CREATE (n)");
  expect(workspace.paramsText).toBe("[]");
  expect(workspace.mode).toBe("execute");
  expect(workspace.context.state).toBe(state);
});
