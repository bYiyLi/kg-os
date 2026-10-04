import { type JsonValue, type WebSaveRequest } from "@kgos/sdk";
import { afterEach, expect, it, vi } from "vitest";

import { Connection } from "./connection.js";
import { Frame, FrameBudgetError, FRAME_LIMITS, type FrameSnapshot } from "./frame.js";
import { FrameEngine } from "./frame-engine.js";
import { Records } from "./records.js";

const state = "commit/original";
const snapshot: FrameSnapshot = {
  mode: "query",
  statement: "RETURN values",
  params: {},
  inputRef: "branch/main",
  readState: state
};
const sources = [
  '[ 1.0, 1, -0.0, {"nested":[9007199254740993,1e400],"typed":{"$type":"Integer","value":"9007199254740993"},"text":"\\"row\\":[9] · 界"} ]',
  '[2.0,2,-0.0,{"row":{"float":1.0},"list":[-0.0,{"$type":"Integer","value":"9223372036854775807"}]}]'
];
const columns = '{"type":"columns","columns":["float","integer","zero","nested"]}';
const summary = `{"type":"summary","state":"${state}"}`;
const detailSource =
  '{ "labels":[], "properties":{"float":1.0,"integer":1,"zero":-0.0,"big":{"$type":"Integer","value":"9007199254740993"}} }';
const fixtures: { connection: Connection; records: Records; engine: FrameEngine }[] = [];

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Missing source fixture");
  return value;
}
function requestBody(init: RequestInit | undefined): string {
  if (typeof init?.body !== "string") throw new Error("Expected JSON body");
  return init.body;
}
function parsedRow(source: string): JsonValue[] {
  return JSON.parse(source) as JsonValue[];
}
function graphResponse(rows = sources) {
  return new Response(
    `${columns}\r\n${rows.map((row) => ` {"type":"row","row":${row}} `).join("\r\n")}\r\n${summary}\r\n`,
    { headers: { "Content-Type": "application/x-ndjson" } }
  );
}
function cacheResponse(rows = sources) {
  return new Response(
    `{"hit":true,"result":{"state":"${state}","columns":["float","integer","zero","nested"],"rows":[${rows.join(",")}],"valueEncoding":"lithograph-json-v1"}}`,
    { headers: { "Content-Type": "application/json" } }
  );
}
function objectResponse(source = detailSource, at = state, ref = "n:0") {
  return new Response(
    `{"state":"${at}","results":[{"kind":"knowledge-node","ref":"${ref}","value":${source}}]}`,
    { headers: { "Content-Type": "application/json" } }
  );
}
async function setup(persist = true) {
  const fetcher = vi.fn<typeof fetch>((input, init) => {
    const path = input instanceof Request ? input.url : input.toString();
    if (path.endsWith("/info"))
      return Promise.resolve(
        Response.json({ daemonBootId: "boot", storageStatus: "ready", storeId: "store" })
      );
    if (path.endsWith("/data/save")) {
      const request = JSON.parse(requestBody(init)) as WebSaveRequest;
      return Promise.resolve(
        Response.json({
          ...request,
          revision: String(BigInt(request.expectedRevision ?? "0") + 1n),
          deleted: false,
          lastMutationId: request.mutationId
        })
      );
    }
    if (path.endsWith("/graph/query")) return Promise.resolve(graphResponse());
    if (path.endsWith("/cache/write")) return Promise.resolve(Response.json({ stored: true }));
    if (path.endsWith("/cache/read")) return Promise.resolve(cacheResponse());
    if (path.endsWith("/object/read")) return Promise.resolve(objectResponse());
    throw new Error(`Unexpected source request ${path}`);
  });
  const connection = new Connection("http://127.0.0.1:42", fetcher);
  await connection.connect("opaque");
  const records = new Records(connection, "store");
  const engine = new FrameEngine(connection, () => (persist ? records : undefined));
  fixtures.push({ connection, records, engine });
  return { connection, records, engine, fetcher };
}
afterEach(() => {
  for (const { connection, records, engine } of fixtures.splice(0)) {
    for (const frame of engine.frames) frame.invalidate();
    records.stop();
    connection.disconnect();
  }
});

it("keeps validated NDJSON row sources exact through cache write and explicit restored-cache loading", async () => {
  const { connection, records, engine, fetcher } = await setup();
  const frame = engine.run(snapshot);
  await vi.waitFor(() => {
    expect(engine.active).toBe(0);
  });
  expect(frame.status).toBe("complete");
  expect(frame.rowSources).toEqual(sources);
  expect(frame.rows).toEqual(sources.map(parsedRow));
  expect(Object.is(frame.rows[0]?.[2], -0)).toBe(true);
  const write = required(
    fetcher.mock.calls.find(([input]) =>
      (input instanceof Request ? input.url : input.toString()).endsWith("/cache/write")
    )
  );
  expect(requestBody(write[1])).toContain(`"rows":[${sources.join(",")}]`);
  expect(frame.byteCount).toBe(new TextEncoder().encode(`[${sources.join(",")}]`).byteLength);
  const restoredEngine = new FrameEngine(connection, () => records);
  restoredEngine.restore();
  const restored = required(restoredEngine.frames[0]);
  expect(restored.rowSources).toEqual([]);
  expect(restored.evicted).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(4);
  frame.releaseRows();
  expect(frame.rowSources).toEqual([]);
  expect(frame.byteCount).toBe(0);
  await restoredEngine.loadCache(restored);
  expect(restored.rowSources).toEqual(sources);
  expect(restored.rows).toEqual(sources.map(parsedRow));
  expect(Object.is(restored.rows[1]?.[2], -0)).toBe(true);
  expect(restored.byteCount).toBe(new TextEncoder().encode(`[${sources.join(",")}]`).byteLength);
  expect(restored.evicted).toBe(false);
  expect(restored.error).toBe("");
  expect(fetcher).toHaveBeenCalledTimes(5);
});

it("does not expose an invalid Graph event to the original-source callback", async () => {
  const { connection, fetcher } = await setup(false);
  const invalid = '{"type":"row","row":{"float":1.0}}';
  fetcher.mockResolvedValueOnce(
    new Response(`${columns}\n${invalid}\n${summary}\n`, {
      headers: { "Content-Type": "application/x-ndjson" }
    })
  );
  const observed = vi.fn();
  const collect = async () => {
    for await (const event of required(connection.client).graph.streamQuery(
      { at: state, cypher: "RETURN values", params: {} },
      { onGraphJSON: observed }
    ))
      expect(event.type).toBe("columns");
  };
  await expect(collect()).rejects.toThrow();
  expect(observed).toHaveBeenCalledExactlyOnceWith(columns, {
    type: "columns",
    columns: ["float", "integer", "zero", "nested"]
  });
});

it("counts retained source UTF-8 bytes and refuses oversized raw rows before changing the frame", () => {
  const frame = new Frame(snapshot);
  const source = required(sources[0]);
  const reserve = vi.fn(() => true);
  frame.append(parsedRow(source), reserve, false, source);
  const bytes = new TextEncoder().encode(source).byteLength + 2;
  expect(frame.byteCount).toBe(bytes);
  expect(reserve).toHaveBeenCalledExactlyOnceWith(bytes);
  expect(bytes).toBeGreaterThan(JSON.stringify(parsedRow(source)).length + 2);
  const oversized = `[${" ".repeat(FRAME_LIMITS.bytes)}1.0]`;
  expect(() => {
    frame.append([1], reserve, false, oversized);
  }).toThrow(FrameBudgetError);
  expect(frame.rowSources).toEqual([source]);
  expect(frame.rows).toHaveLength(1);
  expect(frame.byteCount).toBe(bytes);
  frame.detailSource = detailSource;
  frame.detail = JSON.parse(detailSource) as JsonValue;
  frame.releaseRows();
  expect(frame.rowSources).toEqual([]);
  expect(frame.rows).toEqual([]);
  expect(frame.detailSource).toBeUndefined();
  expect(frame.detail).toBeUndefined();
  expect(frame.byteCount).toBe(0);
  expect(frame.rowCount).toBe(1);
  frame.invalidate();
});

it("enforces the page source budget and releases a collapsed completed frame before retaining new raw rows", async () => {
  const { engine } = await setup(false);
  const fullSource = `[${" ".repeat(FRAME_LIMITS.bytes - 7)}1.0]`;
  const retained = Array.from({ length: 4 }, () => {
    const frame = new Frame(snapshot);
    frame.status = "complete";
    frame.append([1], () => true, false, fullSource);
    engine.frames.push(frame);
    return frame;
  });
  expect(retained.reduce((sum, frame) => sum + frame.byteCount, 0)).toBe(FRAME_LIMITS.pageBytes);
  const blocked = engine.run(snapshot);
  await vi.waitFor(() => {
    expect(engine.active).toBe(0);
  });
  expect(blocked.status).toBe("partial");
  expect(blocked.rowSources).toEqual([]);
  expect(blocked.error).toContain("预算");
  const evicted = required(retained[0]);
  evicted.collapsed = true;
  const received = engine.run(snapshot);
  await vi.waitFor(() => {
    expect(engine.active).toBe(0);
  });
  expect(received.status).toBe("complete");
  expect(received.rowSources).toEqual(sources);
  expect(evicted.rowSources).toEqual([]);
  expect(evicted.byteCount).toBe(0);
  expect(evicted.rowCount).toBe(1);
  expect(evicted.evicted).toBe(true);
  expect(engine.frames.reduce((sum, frame) => sum + frame.byteCount, 0)).toBeLessThanOrEqual(
    FRAME_LIMITS.pageBytes
  );
});

it("rejects buffered row-source callbacks after close and does not repopulate released rows", async () => {
  const { engine, fetcher } = await setup(false);
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
  fetcher.mockResolvedValueOnce(
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          stream = controller;
        }
      }),
      { headers: { "Content-Type": "application/x-ndjson" } }
    )
  );
  const frame = engine.run(snapshot);
  required(stream).enqueue(
    new TextEncoder().encode(`${columns}\n{"type":"row","row":${required(sources[0])}}\n`)
  );
  await vi.waitFor(() => {
    expect(frame.rowSources).toEqual([sources[0]]);
  });
  frame.cancel(true);
  frame.releaseRows();
  required(stream).enqueue(
    new TextEncoder().encode(`{"type":"row","row":${required(sources[1])}}\n${summary}\n`)
  );
  required(stream).close();
  await vi.waitFor(() => {
    expect(engine.active).toBe(0);
  });
  expect(frame.closed).toBe(true);
  expect(frame.status).toBe("cancelled");
  expect(frame.rowSources).toEqual([]);
  expect(frame.rows).toEqual([]);
  expect(frame.byteCount).toBe(0);
  expect(frame.rowCount).toBe(1);
});

it("does not adopt late original cache JSON after its frame closes", async () => {
  const { engine, fetcher } = await setup();
  const frame = engine.run(snapshot);
  await vi.waitFor(() => {
    expect(engine.active).toBe(0);
  });
  frame.releaseRows();
  const late = Promise.withResolvers<Response>();
  fetcher.mockReturnValueOnce(late.promise);
  const loading = engine.loadCache(frame);
  frame.cancel(true);
  late.resolve(cacheResponse());
  await loading;
  expect(frame.rowSources).toEqual([]);
  expect(frame.rows).toEqual([]);
  expect(frame.byteCount).toBe(0);
  expect(frame.evicted).toBe(true);
  expect(frame.error).toBe("");
});

it("keeps same-State object detail source and clears it on selection while rejecting stale and wrong-State responses", async () => {
  const { connection, engine, fetcher } = await setup(false);
  const frame = new Frame(snapshot);
  frame.status = "complete";
  engine.frames.push(frame);
  frame.select("n:0", connection);
  await vi.waitFor(() => {
    expect(frame.detailSource).toBe(detailSource);
  });
  expect(frame.detail).toEqual(JSON.parse(detailSource));
  const late = Promise.withResolvers<Response>();
  fetcher.mockReturnValueOnce(late.promise);
  frame.select("n:1", connection);
  expect(frame.detailSource).toBeUndefined();
  expect(frame.detail).toBeUndefined();
  const replacement = '{"labels":[],"properties":{"current":2.0,"zero":-0.0}}';
  fetcher.mockResolvedValueOnce(objectResponse(replacement, state, "n:2"));
  frame.select("n:2", connection);
  await vi.waitFor(() => {
    expect(frame.detailSource).toBe(replacement);
  });
  const changed = vi.fn();
  frame.subscribe(changed);
  late.resolve(objectResponse(detailSource, state, "n:1"));
  await vi.waitFor(() => {
    expect(changed).toHaveBeenCalled();
  });
  expect(frame.selected).toBe("n:2");
  expect(frame.detailSource).toBe(replacement);
  fetcher.mockResolvedValueOnce(objectResponse(detailSource, "commit/wrong", "n:3"));
  frame.select("n:3", connection);
  await vi.waitFor(() => {
    expect(frame.detailError).toContain("State 不匹配");
  });
  expect(frame.detailSource).toBeUndefined();
  expect(frame.detail).toBeUndefined();
});
