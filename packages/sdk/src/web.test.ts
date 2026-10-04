import { describe, expect, it, vi } from "vitest";
import { KGOSClient, KGOSDaemonError, KGOSTransportError } from "./index.js";
import type { WebCacheWriteRequest } from "./web-types.js";

describe("Web SDK", () => {
  it("maps all controlled routes and keeps revisions as strings", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ revision: "9007199254740993" })))
      );
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:1",
      token: "opaque",
      fetch: fetcher
    });
    const target = { storeId: "store", kind: "editor" as const, id: crypto.randomUUID() };
    const signal = new AbortController().signal;
    await client.web.data.info({ signal });
    await client.web.data.list({ storeId: "store", kind: "editor", cursor: "opaque", limit: 2 });
    const record = await client.web.data.read(target);
    await client.web.data.save({
      ...target,
      expectedRevision: null,
      mutationId: crypto.randomUUID(),
      data: { version: 1, text: "unfinished {" }
    });
    await client.web.data.delete({
      ...target,
      expectedRevision: record.revision,
      mutationId: crypto.randomUUID()
    });
    await client.web.cache.read({ storeId: "store", frameId: target.id });
    await client.web.cache.write({
      storeId: "store",
      frameId: target.id,
      frameRevision: record.revision,
      result: { state: "commit/a", rows: [], columns: [], valueEncoding: "lithograph-json-v1" }
    });
    await client.web.cache.clear({ storeId: "store" });
    expect(record.revision).toBe("9007199254740993");
    expect(
      fetcher.mock.calls.map(([url]) =>
        (url instanceof Request ? url.url : url.toString()).replace("http://127.0.0.1:1", "")
      )
    ).toEqual([
      "/api/v1/web/data/info",
      "/api/v1/web/data/list",
      "/api/v1/web/data/read",
      "/api/v1/web/data/save",
      "/api/v1/web/data/delete",
      "/api/v1/web/cache/read",
      "/api/v1/web/cache/write",
      "/api/v1/web/cache/clear"
    ]);
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(signal);
  });

  it("returns a Web Platform Blob and retains shared error decoding", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("SQLite format 3\0", {
          headers: { "Content-Type": "application/vnd.sqlite3" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "IO_ERROR", message: "backup failed" }), {
          status: 500
        })
      );
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:1",
      token: "opaque",
      fetch: fetcher
    });
    const blob = await client.web.data.export();
    expect(blob).toBeInstanceOf(Blob);
    expect(await blob.text()).toBe("SQLite format 3\0");
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      Accept: "application/vnd.sqlite3"
    });
    await expect(client.web.data.export()).rejects.toBeInstanceOf(KGOSDaemonError);
  });

  it("preserves integral Float and negative zero when caching parsed Graph results", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"stored":true}'));
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:1",
      token: "opaque",
      fetch: fetcher
    });
    await client.web.cache.write({
      storeId: "store",
      frameId: crypto.randomUUID(),
      frameRevision: "1",
      result: {
        state: "commit/a",
        columns: ["values"],
        valueEncoding: "lithograph-json-v1",
        rows: [
          [
            9007199254740992,
            -0,
            1.25,
            true,
            null,
            '"unsafe":false',
            [],
            {
              $type: "Map",
              entries: {
                $type: "business",
                integer: { $type: "Integer", value: "9223372036854775807" },
                floating: { $type: "Float", value: "NaN" }
              }
            }
          ]
        ]
      }
    });
    const body = fetcher.mock.calls[0]?.[1]?.body;
    expect(body).toContain("9.007199254740992e+15,-0.0");
    expect(typeof body).toBe("string");
    const parsed = JSON.parse(body as string) as { result: { rows: unknown[][] } };
    expect(Object.is(parsed.result.rows[0]?.[1], -0)).toBe(true);
    expect(parsed.result.rows[0]?.[5]).toBe('"unsafe":false');
  });

  it("rejects untagged non-finite cache values before HTTP", () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:1",
      token: "opaque",
      fetch: fetcher
    });
    expect(() =>
      client.web.cache.write({
        storeId: "store",
        frameId: crypto.randomUUID(),
        frameRevision: "1",
        result: {
          state: "commit/a",
          columns: ["value"],
          rows: [[Infinity]],
          valueEncoding: "lithograph-json-v1"
        }
      })
    ).toThrow("Float tag");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses validated original cache JSON before attempting ordinary numeric encoding", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(new Response('{"stored":true}')));
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:1",
      token: "opaque",
      fetch: fetcher
    });
    const encodedJSON = `{"storeId":"store","frameId":${JSON.stringify(crypto.randomUUID())},"frameRevision":"1","result":{"state":"commit/a","columns":["numbers"],"rows":[[1.0,-0.0,{"nested":[9007199254740993,1e400]}]],"valueEncoding":"lithograph-json-v1"}}`;
    const request = JSON.parse(encodedJSON) as WebCacheWriteRequest;
    await expect(client.web.cache.write(request, { encodedJSON })).resolves.toEqual({
      stored: true
    });
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(encodedJSON);
    await expect(
      client.web.cache.write(request, { encodedJSON: encodedJSON.replace("1e400", "null") })
    ).rejects.toBeInstanceOf(KGOSTransportError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("classifies interrupted exports as transport failures", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(stream) {
            stream.error(new DOMException("Stopped", "AbortError"));
          }
        })
      )
    );
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:1",
      token: "opaque",
      fetch: fetcher
    });
    await expect(client.web.data.export({ signal: controller.signal })).rejects.toMatchObject({
      name: "KGOSTransportError",
      aborted: true
    });
    await expect(client.web.data.export()).rejects.toBeInstanceOf(KGOSTransportError);
  });
});

describe("exact request and response JSON sources", () => {
  it("sends exact numeric JSON only when it represents the same typed request", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(new Response("{}")));
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:1",
      token: "opaque",
      fetch: fetcher
    });
    const session = crypto.randomUUID();
    const request = {
      session,
      expectedRevision: 1,
      resolutions: [
        {
          conflictId: "opaque",
          choice: "value" as const,
          value: { score: 1, negative: -0, items: [true, null, "a"] }
        }
      ]
    };
    const encodedJSON = `{"resolutions":[{"value":{"score":1.0,"negative":-0.0,"items":[true,null,"a"]},"choice":"value","conflictId":"opaque"}],"expectedRevision":1,"session":${JSON.stringify(session)}}`;
    await client.evolution.merge.resolve(request, { encodedJSON });
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(encodedJSON);
    await expect(
      client.evolution.merge.resolve(request, {
        encodedJSON: encodedJSON.replace('"expectedRevision":1', '"expectedRevision":2')
      })
    ).rejects.toBeInstanceOf(KGOSTransportError);
    await expect(
      client.evolution.merge.resolve(request, { encodedJSON: "{unfinished" })
    ).rejects.toBeInstanceOf(KGOSTransportError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retains large annotation numbers and rejects non-equivalent exact encodings", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(new Response("{}")));
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:1",
      token: "opaque",
      fetch: fetcher
    });
    const state = "commit/source";
    const data = JSON.parse('{"big":9007199254740993,"huge":1e400,"items":[-0.0]}') as {
      big: number;
      huge: number;
      items: number[];
    };
    const encodedJSON = `{"state":${JSON.stringify(state)},"data":{"big":9007199254740993,"huge":1e400,"items":[-0.0]}}`;
    await client.evolution.state.setData({ state, data }, { encodedJSON });
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(encodedJSON);
    for (const invalid of [
      encodedJSON.replace("1e400", "null"),
      encodedJSON.replace("[-0.0]", "[]"),
      encodedJSON.replace("[-0.0]", "{}"),
      encodedJSON.replace("[-0.0]", "[0]"),
      encodedJSON.replace('"state":"commit/source"', '"other":"commit/source"')
    ])
      await expect(
        client.evolution.state.setData({ state, data }, { encodedJSON: invalid })
      ).rejects.toBeInstanceOf(KGOSTransportError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("provides the exact successful JSON response source without changing existing result types", async () => {
    const source = '{"hasData":true,"data":{"big":9007199254740993,"huge":1e400,"float":1.0}}';
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(source))
      .mockResolvedValueOnce(new Response("{unfinished"));
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:1",
      token: "opaque",
      fetch: fetcher
    });
    const onJSONResponse = vi.fn<(source: string) => void>();
    const result = await client.evolution.get({ state: "commit/source" }, { onJSONResponse });
    expect(result.hasData).toBe(true);
    expect(onJSONResponse).toHaveBeenCalledExactlyOnceWith(source);
    await expect(
      client.evolution.get({ state: "commit/source" }, { onJSONResponse })
    ).rejects.toBeInstanceOf(KGOSTransportError);
    expect(onJSONResponse).toHaveBeenCalledTimes(1);
  });

  it("provides validated Graph event sources while leaving event objects unchanged", async () => {
    const row = '{"type":"row","row":[1.0,1,-0.0,{"nested":[2.0]}]}';
    const source = `{"type":"columns","columns":["float","integer","negative","map"]}\n${row}\n{"type":"summary","state":"commit/source"}\n`;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(source))
      .mockResolvedValueOnce(new Response('{"type":"row","row":null}\n'));
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:1",
      token: "opaque",
      fetch: fetcher
    });
    const onGraphJSON = vi.fn();
    const events = [];
    for await (const event of client.graph.streamQuery(
      { at: "commit/source", cypher: "RETURN 1.0" },
      { onGraphJSON }
    ))
      events.push(event);
    expect(events[1]).toEqual({ type: "row", row: [1, 1, -0, { nested: [2] }] });
    expect(onGraphJSON.mock.calls[1]).toEqual([row, events[1]]);
    expect(onGraphJSON).toHaveBeenCalledTimes(3);
    await expect(async () => {
      for await (const event of client.graph.streamQuery(
        { at: "commit/source", cypher: "RETURN 1.0" },
        { onGraphJSON }
      ))
        events.push(event);
    }).rejects.toBeInstanceOf(KGOSTransportError);
    expect(onGraphJSON).toHaveBeenCalledTimes(3);
  });
});
