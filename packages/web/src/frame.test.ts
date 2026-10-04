import { describe, expect, it, vi } from "vitest";

import { Connection } from "./connection.js";
import { Frame, FRAME_LIMITS, restoredFrame } from "./frame.js";
import { FrameEngine, frameStatus, selectedProperties } from "./frame-engine.js";
import { Records } from "./records.js";

const state = `commit/${"a".repeat(64)}`;
const snapshot = {
  mode: "query" as const,
  statement: "RETURN 1",
  params: { limit: 1 },
  inputRef: "branch/main",
  readState: state
};
const encode = (events: unknown[]) =>
  events.map((event) => JSON.stringify(event)).join("\n") + "\n";
const columns = { type: "columns" as const, columns: ["n"] };
const summary = { type: "summary", state };

async function connected(graph: (request: RequestInit | undefined) => Response) {
  const fetcher = vi.fn<typeof fetch>().mockImplementation((input, init) => {
    const path = input instanceof Request ? input.url : input.toString();
    if (path.endsWith("/info"))
      return Promise.resolve(
        Response.json({ daemonBootId: "boot", storageStatus: "ready", storeId: "store" })
      );
    return Promise.resolve(graph(init));
  });
  const connection = new Connection("http://127.0.0.1:42", fetcher);
  await connection.connect("opaque");
  return { connection, fetcher };
}

function response(events: unknown[]) {
  return new Response(encode(events), { headers: { "Content-Type": "application/x-ndjson" } });
}

describe("independent result frames", () => {
  it("freezes input, requires summary and EOF, and creates distinct reruns", async () => {
    const { connection, fetcher } = await connected(() =>
      response([columns, { type: "row", row: [1] }, summary])
    );
    const engine = new FrameEngine(connection, () => undefined);
    const input = structuredClone(snapshot);
    const frame = engine.run(input);
    input.statement = "RETURN 2";
    input.params.limit = 2;
    await vi.waitFor(() => {
      expect(engine.active).toBe(0);
    });
    expect(frame.status).toBe("complete");
    expect(frame.rows).toEqual([[1]]);
    expect(frame.request).toEqual(snapshot);
    const body = fetcher.mock.calls[1]?.[1]?.body;
    expect(typeof body).toBe("string");
    expect(JSON.parse(body as string)).toMatchObject({
      at: state,
      cypher: "RETURN 1",
      params: { limit: 1 }
    });
    expect(frameStatus(frame)).toBe("已完成");
    expect(engine.run(frame.request).id).not.toBe(frame.id);
    await vi.waitFor(() => {
      expect(engine.active).toBe(0);
    });
  });

  it("retains rows on truncated and inconsistent streams without claiming completion", async () => {
    for (const tail of [
      [],
      [{ type: "summary", state: "commit/wrong" }],
      [summary, { type: "row", row: [2] }]
    ]) {
      const { connection } = await connected(() =>
        response([columns, { type: "row", row: [1] }, ...tail])
      );
      const engine = new FrameEngine(connection, () => undefined);
      const frame = engine.run(snapshot);
      await vi.waitFor(() => {
        expect(engine.active).toBe(0);
      });
      expect(frame.status).toBe("partial");
      expect(frame.rows).toEqual([[1]]);
      expect(frame.error).not.toBe("");
      expect(frame.resultState).toBe("");
    }
  });

  it("cancels the original HTTP signal and rejects buffered late completion on close", async () => {
    let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
    const { connection, fetcher } = await connected(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              stream = controller;
            }
          }),
          { headers: { "Content-Type": "application/x-ndjson" } }
        )
    );
    const engine = new FrameEngine(connection, () => undefined);
    const frame = engine.run(snapshot);
    await vi.waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
    frame.cancel(true);
    stream?.enqueue(
      new TextEncoder().encode(encode([columns, { type: "row", row: [1] }, summary]))
    );
    stream?.close();
    await vi.waitFor(() => {
      expect(engine.active).toBe(0);
    });
    expect(fetcher.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
    expect(frame.closed).toBe(true);
    expect(frame.status).toBe("cancelled");
    expect(frame.rows).toEqual([]);
  });

  it("limits active streams and cancels queued requests without sending", async () => {
    const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
    const { connection, fetcher } = await connected(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              streams.push(controller);
            }
          }),
          { headers: { "Content-Type": "application/x-ndjson" } }
        )
    );
    const engine = new FrameEngine(connection, () => undefined);
    const frames = Array.from({ length: 5 }, () => engine.run(snapshot));
    await vi.waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(5);
    });
    expect(frames[4]?.status).toBe("queued");
    frames[4]?.cancel();
    for (const stream of streams) {
      stream.enqueue(new TextEncoder().encode(encode([columns, summary])));
      stream.close();
    }
    await vi.waitFor(() => {
      expect(engine.active).toBe(0);
    });
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(frames[4]?.status).toBe("cancelled");
  });

  it("preserves completed status when closing and reports interrupted writes as unknown", async () => {
    const { connection } = await connected(() => response([columns, summary]));
    const engine = new FrameEngine(connection, () => undefined);
    const frame = engine.run(snapshot);
    await vi.waitFor(() => {
      expect(engine.active).toBe(0);
    });
    frame.cancel(true);
    expect(frame.status).toBe("complete");
    const broken = await connected(() => response([columns]));
    const writes = new FrameEngine(broken.connection, () => undefined);
    const execution = writes.run({
      mode: "execute",
      statement: "CREATE (n)",
      params: {},
      inputRef: "branch/main",
      branch: "main"
    });
    await vi.waitFor(() => {
      expect(writes.active).toBe(0);
    });
    expect(execution.status).toBe("unknown");
    expect(frameStatus(execution)).toContain("待核对");
    expect(writes.explore(execution)).toBeUndefined();
  });

  it("retains restored metadata without resuming execution or assuming cache", () => {
    const connection = new Connection("http://127.0.0.1:42");
    const records = new Records(connection, "store");
    const slot = records.add("frame", {
      version: 1,
      ...snapshot,
      status: "running",
      closed: false,
      rowCount: 15,
      selected: "n:0",
      positions: { "n:0": { x: 10, y: 20 } },
      camera: { x: 4, y: 5, zoom: 2 }
    });
    const frame = restoredFrame(slot);
    expect(frame.active).toBe(false);
    expect(frame.request).not.toHaveProperty("paramsText");
    expect(frameStatus(frame)).toContain("不能续跑");
    expect(frame.rowCount).toBe(15);
    expect(frame.evicted).toBe(true);
    expect(frame.camera).toEqual({ x: 4, y: 5, zoom: 2 });
    const engine = new FrameEngine(connection, () => records);
    engine.restore();
    engine.restore();
    expect(engine.frames).toHaveLength(1);
    records.stop();
  });

  it("enforces row/byte bounds and keeps the displayed graph separate from expanded rows", () => {
    const frame = new Frame(snapshot);
    frame.consume(columns, () => true);
    frame.consume(
      {
        type: "row",
        row: [
          {
            $type: "Node",
            elementId: "n:0",
            labels: [],
            properties: { big: { $type: "Integer", value: "9007199254740993" } }
          }
        ]
      },
      () => true
    );
    expect(frame.projection.nodes[0]?.ref).toBe("n:0");
    frame.selected = "n:0";
    expect(selectedProperties(frame)).toMatchObject({ big: { value: "9007199254740993" } });
    frame.append([2], () => true, true);
    expect(frame.rowCount).toBe(1);
    expect(frame.expandedRows).toEqual([[2]]);
    frame.byteCount = FRAME_LIMITS.bytes;
    expect(() => {
      frame.append([3], () => true);
    }).toThrow("预算");
    frame.releaseRows();
    expect(frame.rowCount).toBe(1);
    expect(frame.rows).toEqual([]);
    expect(frame.projection.nodes).toEqual([]);
    expect(() => {
      frame.consume(columns, () => true);
    }).toThrow("columns");
    expect(() => {
      new Frame(snapshot).consume({ type: "row", row: [] }, () => true);
    }).toThrow("早于");
    const mismatch = new Frame(snapshot);
    mismatch.consume(columns, () => true);
    expect(() => {
      mismatch.consume({ type: "row", row: [] }, () => true);
    }).toThrow("数量");
  });
});

describe("frame generations and budgets", () => {
  it("keeps summary provisional until EOF and prevents a cancelled stream completing", async () => {
    const deferred = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>();
    const { connection } = await connected(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              deferred.resolve(controller);
            }
          }),
          { headers: { "Content-Type": "application/x-ndjson" } }
        )
    );
    const engine = new FrameEngine(connection, () => undefined);
    const frame = engine.run(snapshot);
    const stream = await deferred.promise;
    stream.enqueue(new TextEncoder().encode(encode([columns, { type: "row", row: [1] }, summary])));
    await vi.waitFor(() => {
      expect(frame.rows).toEqual([[1]]);
    });
    expect(frame.status).toBe("running");
    expect(frame.resultState).toBe("");
    frame.cancel();
    stream.close();
    await vi.waitFor(() => {
      expect(engine.active).toBe(0);
    });
    expect(frame.status).toBe("cancelled");
    expect(frame.rows).toEqual([[1]]);
    expect(frame.resultState).toBe("");
  });

  it("aborts at the row budget and distinguishes terminal errors and offline requests", async () => {
    const events = [
      columns,
      ...Array.from({ length: FRAME_LIMITS.rows + 1 }, (_, index) => ({
        type: "row",
        row: [index]
      })),
      summary
    ];
    const { connection, fetcher } = await connected(() => response(events));
    const engine = new FrameEngine(connection, () => undefined);
    const frame = engine.run(snapshot);
    await vi.waitFor(() => {
      expect(engine.active).toBe(0);
    });
    expect(frame.rowCount).toBe(FRAME_LIMITS.rows);
    expect(frame.status).toBe("partial");
    expect(frame.error).toContain("预算");
    expect(fetcher.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
    const errors = await connected(() =>
      response([
        columns,
        { type: "error", error: { code: "RESOURCE_ERROR", message: "kernel failed" } }
      ])
    );
    const errorEngine = new FrameEngine(errors.connection, () => undefined);
    const failed = errorEngine.run(snapshot);
    await vi.waitFor(() => {
      expect(errorEngine.active).toBe(0);
    });
    expect(failed.status).toBe("failed");
    expect(failed.error).toContain("RESOURCE_ERROR");
    connection.disconnect();
    const offline = engine.run(snapshot);
    await vi.waitFor(() => {
      expect(engine.active).toBe(0);
    });
    expect(offline.status).toBe("failed");
    expect(offline.error).toContain("未发送请求");
  });

  it("releases collapsed and offscreen complete rows before rejecting visible-page overflow", async () => {
    const { connection } = await connected(() =>
      response([columns, { type: "row", row: [1] }, summary])
    );
    const engine = new FrameEngine(connection, () => undefined);
    const released = new Frame(snapshot);
    released.status = "complete";
    released.rowCount = 7;
    released.rows = [[7]];
    released.byteCount = FRAME_LIMITS.pageBytes;
    released.collapsed = true;
    const offscreen = new Frame(snapshot);
    offscreen.status = "complete";
    offscreen.rowCount = 8;
    offscreen.rows = [[8]];
    offscreen.byteCount = FRAME_LIMITS.pageBytes;
    offscreen.visible = false;
    engine.frames.push(offscreen, released);
    const frame = engine.run(snapshot);
    await vi.waitFor(() => {
      expect(engine.active).toBe(0);
    });
    expect(frame.status).toBe("complete");
    expect(released.rows).toEqual([]);
    expect(offscreen.rows).toEqual([]);
    expect(released.rowCount).toBe(7);
    expect(offscreen.evicted).toBe(true);
    released.byteCount = FRAME_LIMITS.pageBytes;
    released.collapsed = false;
    released.visible = true;
    const blocked = engine.run(snapshot);
    await vi.waitFor(() => {
      expect(engine.active).toBe(0);
    });
    expect(blocked.status).toBe("partial");
    expect(blocked.error).toContain("预算");
  });

  it("selects details using frame State and discards older and closed requests", async () => {
    const { connection, fetcher } = await connected(() => Response.json({ state, results: [] }));
    const frame = new Frame(snapshot);
    const first = Promise.withResolvers<Response>();
    const second = Promise.withResolvers<Response>();
    fetcher.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    frame.select("n:0", connection);
    frame.select("n:1", connection);
    expect(fetcher.mock.calls[1]?.[1]?.body).toContain(`"at":"${state}"`);
    expect(fetcher.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
    second.resolve(Response.json({ state, results: [{ ref: "n:1", value: { name: "second" } }] }));
    await vi.waitFor(() => {
      expect(frame.detail).toEqual({ name: "second" });
    });
    first.resolve(Response.json({ state, results: [{ ref: "n:0", value: { name: "first" } }] }));
    await vi.waitFor(() => {
      expect(frame.detail).toEqual({ name: "second" });
    });
    fetcher.mockResolvedValueOnce(Response.json({ state: "commit/wrong", results: [] }));
    frame.select("n:2", connection);
    await vi.waitFor(() => {
      expect(frame.detailError).toContain("State 不匹配");
    });
    const late = Promise.withResolvers<Response>();
    fetcher.mockReturnValueOnce(late.promise);
    frame.select("n:3", connection);
    frame.cancel(true);
    late.resolve(Response.json({ state, results: [{ value: { name: "closed" } }] }));
    await vi.waitFor(() => {
      expect(frame.detailController?.signal.aborted).toBe(true);
    });
    expect(frame.detail).toBeUndefined();
  });

  it("expands parameterized bounded neighbors and leaves original completion and camera intact", async () => {
    const { connection, fetcher } = await connected(() =>
      response([columns, { type: "row", row: [2] }, summary])
    );
    const engine = new FrameEngine(connection, () => undefined);
    const frame = new Frame(snapshot);
    frame.status = "complete";
    frame.rowCount = 9;
    frame.selected = "n:0";
    frame.camera = { x: 3, y: 4, zoom: 2 };
    frame.positions.set("n:0", { x: 5, y: 6 });
    await engine.neighbors(frame);
    const body = fetcher.mock.calls[1]?.[1]?.body;
    expect(body).toContain('"ref":"n:0"');
    expect(body).toContain("LIMIT 50");
    expect(frame.rowCount).toBe(9);
    expect(frame.expandedRows).toEqual([[2]]);
    expect(frame.status).toBe("complete");
    expect(frame.camera).toEqual({ x: 3, y: 4, zoom: 2 });
    expect(frame.positions.get("n:0")).toEqual({ x: 5, y: 6 });
    frame.byteCount = FRAME_LIMITS.bytes;
    await engine.neighbors(frame);
    expect(frame.neighborError).toContain("预算");
    expect(frame.status).toBe("complete");
    expect(frame.neighborController?.signal.aborted).toBe(true);
    await engine.neighbors(frame, "r:0");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("invalidates neighbor generations on selection and isolates wrong-State expansion failures", async () => {
    const { connection, fetcher } = await connected(() =>
      response([columns, { type: "summary", state: "commit/wrong" }])
    );
    const engine = new FrameEngine(connection, () => undefined);
    const frame = new Frame(snapshot);
    frame.status = "complete";
    frame.selected = "n:0";
    await engine.neighbors(frame);
    expect(frame.neighborError).toContain("State 不匹配");
    const delayed = Promise.withResolvers<Response>();
    fetcher
      .mockReturnValueOnce(delayed.promise)
      .mockResolvedValueOnce(Response.json({ state, results: [] }));
    const pending = engine.neighbors(frame);
    frame.select("n:1", connection);
    delayed.resolve(response([columns, { type: "row", row: [2] }, summary]));
    await pending;
    expect(frame.expandedRows).toEqual([]);
    expect(frame.selected).toBe("n:1");
    expect(frame.neighborLoading).toBe(false);
    expect(frame.neighborError).toBe("");
    expect(frame.status).toBe("complete");
  });
});

it("restores bounded legacy metadata without guessing a runnable request or valid camera", () => {
  const connection = new Connection("http://127.0.0.1:42");
  const records = new Records(connection, "store");
  const slot = records.add("frame", {
    mode: "execute",
    statement: "CREATE(n)",
    params: [],
    branch: "main",
    observedHead: state,
    resultState: "commit/result",
    inputRef: "branch/main",
    status: "unrecognized",
    closed: true,
    collapsed: true,
    view: "json",
    rowCount: 0,
    camera: { x: "invalid", y: 1, zoom: 99 },
    positions: { invalid: null, "n:0": { x: 1 } }
  });
  const frame = restoredFrame(slot);
  expect(frame.request.params).toEqual({});
  expect(frame.state).toBe("commit/result");
  expect(frame.active).toBe(false);
  expect(frame.camera).toEqual({ x: 0, y: 1, zoom: 4 });
  expect(frame.positions.get("n:0")).toEqual({ x: 1, y: 0 });
  expect(frame.positions.has("invalid")).toBe(false);
  expect(frame.closed).toBe(true);
  expect(frame.collapsed).toBe(true);
  const minimal = restoredFrame(records.add("frame", {}));
  expect(minimal.request).toEqual({ mode: "query", statement: "", params: {}, inputRef: "" });
  expect(minimal.state).toBe("");
  expect(minimal.evicted).toBe(false);
  records.stop();
});

it("does not request public object details from execute rows or an unresolved State", async () => {
  const { connection, fetcher } = await connected(() => Response.json({ state, results: [] }));
  const execution = new Frame({
    mode: "execute",
    statement: "CREATE(n)",
    params: {},
    inputRef: "branch/main",
    branch: "main"
  });
  execution.resultState = state;
  execution.select("n:0", connection);
  const unresolved = new Frame({
    mode: "query",
    statement: "RETURN n",
    params: {},
    inputRef: "branch/main"
  });
  unresolved.select("n:0", connection);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(execution.detail).toBeUndefined();
  expect(unresolved.detail).toBeUndefined();
  expect(selectedProperties(unresolved)).toBeUndefined();
});
