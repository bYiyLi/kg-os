import { describe, expect, it, vi } from "vitest";

import {
  KGOSClient,
  KGOSDaemonError,
  KGOSTransportError,
  KGOS_VERSION,
  PRODUCT_NAME,
  type GraphStreamEvent,
  type JsonValue
} from "./index.js";

describe("KG OS SDK", () => {
  it("exports package metadata and JSON types", () => {
    const value: JsonValue = { product: PRODUCT_NAME, version: KGOS_VERSION };

    expect(value).toEqual({ product: "KG OS", version: "0.1.1" });
  });

  it("maps JSON requests through the authenticated public API", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ state: "commit/a", results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:5000/",
      token: "secret",
      fetch: request
    });

    await expect(client.object.read({ at: "branch/main", refs: ["node:Person"] })).resolves.toEqual(
      {
        state: "commit/a",
        results: []
      }
    );
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[0]).toBe("http://127.0.0.1:5000/api/v1/object/read");
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer secret",
        "Content-Type": "application/json"
      }
    });
  });

  it("preserves daemon public errors without guessing from messages", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "STATE_NOT_FOUND",
          message: "missing",
          details: { state: "commit/nope" }
        }),
        { status: 404 }
      )
    );
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:5000",
      token: "secret",
      fetch: request
    });

    const error = await client.evolution
      .get({ state: "commit/nope" })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(KGOSDaemonError);
    expect(error).toMatchObject({
      code: "STATE_NOT_FOUND",
      message: "missing",
      details: { state: "commit/nope" },
      status: 404
    });
  });

  it("keeps transport failures distinct from daemon errors", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("socket closed"));
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:5000",
      token: "secret",
      fetch: request
    });

    await expect(client.evolution.overview()).rejects.toBeInstanceOf(KGOSTransportError);
  });

  it("streams Graph events incrementally and accepts a terminal summary", async () => {
    const chunks = [
      '{"type":"columns","columns":["n"]}\n{"type":"row","row":',
      '[1]}\n{"type":"summary","state":"commit/a"}\n'
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      }
    });
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream, { status: 200 }));
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:5000",
      token: "secret",
      fetch: request
    });
    const events: GraphStreamEvent[] = [];

    for await (const event of client.graph.streamQuery({ at: "branch/main", cypher: "RETURN 1" })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "columns", columns: ["n"] },
      { type: "row", row: [1] },
      { type: "summary", state: "commit/a" }
    ]);
  });

  it("turns terminal Graph daemon errors into exceptions after partial events", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            '{"type":"columns","columns":["n"]}\n' +
              '{"type":"row","row":[1]}\n' +
              '{"type":"error","error":{"code":"IO_ERROR","message":"failed"}}\n'
          )
        );
        controller.close();
      }
    });
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream, { status: 200 }));
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:5000",
      token: "secret",
      fetch: request
    });
    const events: GraphStreamEvent[] = [];
    let failure: unknown;

    try {
      for await (const event of client.graph.streamQuery({
        at: "branch/main",
        cypher: "RETURN 1"
      })) {
        events.push(event);
      }
    } catch (error) {
      failure = error;
    }

    expect(events).toHaveLength(2);
    expect(failure).toBeInstanceOf(KGOSDaemonError);
    expect(failure).toMatchObject({ code: "IO_ERROR", status: 200 });
  });

  it("rejects an incomplete Graph stream as a transport failure", async () => {
    const response = new Response('{"type":"columns","columns":["n"]}\n', { status: 200 });
    const request = vi.fn<typeof fetch>().mockResolvedValue(response);
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:5000",
      token: "secret",
      fetch: request
    });

    const consume = async () => {
      for await (const event of client.graph.streamQuery({
        at: "branch/main",
        cypher: "RETURN 1"
      })) {
        expect(event.type).toBe("columns");
      }
    };
    await expect(consume()).rejects.toBeInstanceOf(KGOSTransportError);
  });
});

describe("KG OS SDK validation", () => {
  it("validates constructor inputs and supports the global fetch default", () => {
    expect(() => new KGOSClient({ endpoint: "not-a-url", token: "secret" })).toThrow(TypeError);
    expect(() => new KGOSClient({ endpoint: "file:///tmp/kgos", token: "secret" })).toThrow(
      TypeError
    );
    expect(() => new KGOSClient({ endpoint: "http://127.0.0.1:5000", token: "" })).toThrow(
      TypeError
    );
    expect(new KGOSClient({ endpoint: "http://127.0.0.1:5000", token: "secret" })).toBeInstanceOf(
      KGOSClient
    );
  });

  it("rejects construction when no Web-compatible fetch exists", () => {
    const original = globalThis.fetch;
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: undefined });
    try {
      expect(() => new KGOSClient({ endpoint: "http://127.0.0.1:5000", token: "secret" })).toThrow(
        TypeError
      );
    } finally {
      Object.defineProperty(globalThis, "fetch", { configurable: true, value: original });
    }
  });

  it("rejects malformed daemon error envelopes and success JSON", async () => {
    const invalidErrorJSON = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("{", { status: 400 }))
      .mockResolvedValueOnce(new Response('{"message":"missing code"}', { status: 400 }))
      .mockResolvedValueOnce(new Response("{", { status: 200 }));
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:5000",
      token: "secret",
      fetch: invalidErrorJSON
    });

    await expect(client.evolution.overview()).rejects.toBeInstanceOf(KGOSTransportError);
    await expect(client.evolution.overview()).rejects.toBeInstanceOf(KGOSTransportError);
    await expect(client.evolution.overview()).rejects.toBeInstanceOf(KGOSTransportError);
  });

  it.each([
    '{"noType":true}\n',
    '{"type":"columns","columns":[1]}\n',
    '{"type":"row","row":"bad"}\n',
    '{"type":"summary","state":1}\n',
    '{"type":"error","error":{"message":"missing code"}}\n',
    '{"type":"unknown"}\n',
    "{not-json}\n"
  ])("rejects malformed Graph event %s", async (line) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(line, { status: 200 }));
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:5000",
      token: "secret",
      fetch: request
    });

    const consume = async () => {
      for await (const event of client.graph.streamQuery({
        at: "branch/main",
        cypher: "RETURN 1"
      })) {
        expect(event).toBeDefined();
      }
    };
    await expect(consume()).rejects.toBeInstanceOf(KGOSTransportError);
  });

  it("accepts a terminal summary without a trailing newline and skips blank lines", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          '\n{"type":"columns","columns":["n"]}\r\n\n{"type":"summary","state":"commit/a"}',
          { status: 200 }
        )
      );
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:5000",
      token: "secret",
      fetch: request
    });
    const events: GraphStreamEvent[] = [];
    for await (const event of client.graph.streamQuery({ at: "branch/main", cypher: "RETURN 1" })) {
      events.push(event);
    }
    expect(events).toHaveLength(2);
  });

  it("rejects data after a terminal summary", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"type":"summary","state":"commit/a"}\n{"type":"row","row":[1]}\n', {
        status: 200
      })
    );
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:5000",
      token: "secret",
      fetch: request
    });
    const consume = async () => {
      for await (const event of client.graph.streamQuery({
        at: "branch/main",
        cypher: "RETURN 1"
      })) {
        expect(event.type).toBe("summary");
      }
    };
    await expect(consume()).rejects.toBeInstanceOf(KGOSTransportError);
  });

  it("wraps stream decoding failures and preserves abort state", async () => {
    const controller = new AbortController();
    controller.abort();
    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(new Uint8Array([0xff]));
        streamController.close();
      }
    });
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream, { status: 200 }));
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:5000",
      token: "secret",
      fetch: request
    });
    const consume = async () => {
      for await (const event of client.graph.streamQuery(
        { at: "branch/main", cypher: "RETURN 1" },
        { signal: controller.signal }
      )) {
        expect(event).toBeDefined();
      }
    };
    const error = await consume().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(KGOSTransportError);
    expect(error).toMatchObject({ aborted: true });
  });

  it("maps stream fetch failure, non-2xx, and empty-body responses", async () => {
    const aborted = new AbortController();
    aborted.abort();
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new DOMException("aborted", "AbortError"))
      .mockResolvedValueOnce(
        new Response('{"code":"IO_ERROR","message":"failed"}', { status: 500 })
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:5000",
      token: "secret",
      fetch: request
    });
    const consume = async (signal?: AbortSignal) => {
      for await (const event of client.graph.streamQuery(
        { at: "branch/main", cypher: "RETURN 1" },
        signal === undefined ? undefined : { signal }
      )) {
        expect(event).toBeDefined();
      }
    };

    const transport = await consume(aborted.signal).catch((caught: unknown) => caught);
    expect(transport).toMatchObject({ aborted: true });
    await expect(consume()).rejects.toBeInstanceOf(KGOSDaemonError);
    await expect(consume()).rejects.toBeInstanceOf(KGOSTransportError);
  });
});
