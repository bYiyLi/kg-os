import { KGOSClient } from "@kgos/sdk";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_SANDBOX_LIMITS, executeScript, type SandboxLimits } from "./sandbox.js";

type Handler = (
  path: string,
  data: Record<string, unknown>,
  init?: RequestInit
) => Response | Promise<Response>;

function fixture(handler: Handler = () => new Response('{"state":"commit/a"}')) {
  const urls: string[] = [];
  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    let url: string;
    if (typeof input === "string") url = input;
    else if (input instanceof URL) url = input.href;
    else url = input.url;
    const path = new URL(url).pathname;
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<
      string,
      unknown
    >;
    urls.push(path);
    return Promise.resolve(handler(path, body, init));
  });
  return {
    client: new KGOSClient({
      endpoint: "http://127.0.0.1:4141",
      token: "secret",
      fetch: fetchMock
    }),
    urls
  };
}

function options(limits: Partial<SandboxLimits>) {
  return { limits: { ...DEFAULT_SANDBOX_LIMITS, ...limits } };
}

function publicError(code: string, message: string, details?: Record<string, unknown>) {
  return new Response(
    JSON.stringify({
      code,
      message,
      ...(details === undefined ? {} : { details })
    }),
    { status: 409 }
  );
}

function graphStream(body: ReadableStream<Uint8Array>): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
}

describe("QuickJS Worker host method permission boundary", () => {
  it("denies raw Bridge attempts to access write methods and arbitrary properties", async () => {
    const { client, urls } = fixture();
    for (const request of [
      { method: "evolution.tag.delete", args: [{ name: "main" }] },
      {
        method: "stream-open",
        args: ["graph.streamExecute", { branch: "main", cypher: "RETURN 1" }]
      },
      { method: "object.constructor", args: [] },
      { method: "constructor", args: [] },
      { method: "stream-open", args: ["not-a-method", {}] }
    ]) {
      const code = "return await __kgos_bridge(" + JSON.stringify(JSON.stringify(request)) + ");";
      await expect(executeScript(client, code, false)).rejects.toMatchObject({
        code: "PERMISSION_DENIED"
      });
    }
    expect(urls).toHaveLength(0);
  });

  it("denies malformed raw host requests without calling the daemon", async () => {
    const { client, urls } = fixture();
    for (const request of [
      "invalid",
      "null",
      "{}",
      '{"method":"evolution.overview","args":{}}',
      '{"method":42,"args":[]}',
      '{"method":"evolution.overview","args":[{},{}]}',
      '{"method":"stream-next","args":[]}',
      '{"method":"stream-next","args":["unknown"]}'
    ]) {
      const code = "return await __kgos_bridge(" + JSON.stringify(request) + ");";
      await expect(executeScript(client, code, false)).rejects.toMatchObject({
        code: "INVALID_ARGUMENT"
      });
    }
    expect(urls).toHaveLength(0);
  });

  it("keeps stream-return idempotent on an already closed stream", async () => {
    const { client } = fixture();
    const result = await executeScript(
      client,
      `
      const input = JSON.stringify({method:"stream-return",args:["nonexistent"]});
      return JSON.parse(await __kgos_bridge(input));
    `,
      false
    );
    expect(result).toBe(null);
  });
});

describe("Sandbox execution and resource containment", () => {
  it("rejects oversized source code before creating any Worker", async () => {
    const { client } = fixture();
    await expect(
      executeScript(
        client,
        "return " + "x".repeat(4000),
        false,
        options({ scriptMaxCodeBytes: 1024 })
      )
    ).rejects.toMatchObject({ code: "RESOURCE_ERROR" });
  });

  it("detects an already aborted invocation and can still run the next invocation", async () => {
    const { client } = fixture();
    const abort = new AbortController();
    abort.abort();
    await expect(
      executeScript(client, "return true;", false, { signal: abort.signal })
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(await executeScript(client, "return 42;", false)).toBe(42);
  });

  it("terminates CPU loops at the resource deadline and keeps read/write risk distinct", async () => {
    const { client } = fixture();
    await expect(
      executeScript(client, "while(true){}", false, options({ scriptTimeoutMs: 100 }))
    ).rejects.toMatchObject({ code: "RESOURCE_ERROR" });
    const error = await executeScript(
      client,
      "while(true){}",
      true,
      options({ scriptTimeoutMs: 100 })
    ).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "RESOURCE_ERROR" });
    expect(String(error)).toContain("writes may have completed");
  }, 10_000);

  it("blocks excessive sequential SDK calls with an explicit resource error", async () => {
    const { client, urls } = fixture();
    const code = "await evolution.overview();await evolution.overview();return true;";
    await expect(
      executeScript(client, code, false, options({ scriptMaxCalls: 1 }))
    ).rejects.toMatchObject({ code: "RESOURCE_ERROR" });
    expect(urls).toHaveLength(1);
  });

  it("caps concurrent SDK calls rather than allocating an unbounded host queue", async () => {
    const { client, urls } = fixture(
      (_path, _body, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              reject(new DOMException("aborted", "AbortError"));
            },
            { once: true }
          );
        })
    );
    await expect(
      executeScript(
        client,
        `
      await Promise.all(Array.from({length:32},()=>evolution.overview()));
      return null;
    `,
        false,
        options({ scriptTimeoutMs: 2000 })
      )
    ).rejects.toMatchObject({ code: "RESOURCE_ERROR" });
    expect(urls.length).toBeLessThanOrEqual(16);
  });

  it("rejects oversized Bridge argument and SDK response bodies", async () => {
    const { client, urls } = fixture(
      () => new Response(JSON.stringify({ body: "x".repeat(2_200_000) }))
    );
    await expect(
      executeScript(
        client,
        `
      return await graph.query({at:"commit/a",cypher:"x".repeat(2_200_000)});
    `,
        false
      )
    ).rejects.toMatchObject({ code: "RESOURCE_ERROR" });
    expect(urls).toHaveLength(0);
    await expect(
      executeScript(client, "return await evolution.overview();", false)
    ).rejects.toMatchObject({ code: "RESOURCE_ERROR" });
    expect(urls).toHaveLength(1);
  }, 12_000);

  it("retains safe public SDK code/details and redacts oversized public details", async () => {
    let publicDetails: Record<string, unknown> = { safe: "field" };
    const { client } = fixture(() => publicError("CONFLICT", "Branch moved", publicDetails));
    const caught = await executeScript(
      client,
      `
      try { await evolution.overview(); } catch(e) {
        return {code:e.code, message:e.message, details:e.details};
      }
      return null;
    `,
      false
    );
    expect(caught).toEqual({
      code: "CONFLICT",
      message: "Branch moved",
      details: { safe: "field" }
    });
    publicDetails = { large: "x".repeat(9000) };
    const error = await executeScript(client, "return await evolution.overview();", false).catch(
      (caught: unknown) => caught
    );
    expect(error).toMatchObject({ code: "CONFLICT" });
    expect(JSON.stringify(error)).not.toContain("x".repeat(100));
  });

  it("preserves transport errors and does not reinterpret them as successful reads", async () => {
    const { client } = fixture(() => Promise.reject(new Error("network unavailable")));
    await expect(
      executeScript(client, "return await evolution.overview();", false)
    ).rejects.toMatchObject({ code: "TRANSPORT_ERROR" });
  });

  it("keeps successful SDK writes durable even when a later SDK call fails", async () => {
    const writes: string[] = [];
    const { client } = fixture((path) => {
      if (path.endsWith("/branch/create")) {
        writes.push(path);
        return new Response('{"name":"experiment","state":"commit/a"}');
      }
      return publicError("CONFLICT", "Tag already exists");
    });
    await expect(
      executeScript(
        client,
        `
      await evolution.branch.create({name:"experiment",from:"commit/a"});
      await evolution.tag.create({name:"experiment",target:"commit/a"});
      return true;
    `,
        true
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(writes).toHaveLength(1);
  });
});

describe("QuickJS Graph streaming and cancellation", () => {
  it("cancels the HTTP response when the guest stops consuming events early", async () => {
    const cancelled = vi.fn();
    const encoder = new TextEncoder();
    const { client } = fixture(() =>
      graphStream(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('{"type":"columns","columns":["x"]}\n'));
            controller.enqueue(encoder.encode('{"type":"row","row":[1]}\n'));
          },
          cancel: cancelled
        })
      )
    );
    const result = await executeScript(
      client,
      `
      for await (const event of graph.streamQuery({at:"commit/a",cypher:"RETURN 1"})) {
        return event.type;
      }
      return null;
    `,
      false
    );
    expect(result).toBe("columns");
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it("rejects streams without a terminal summary instead of pretending a query succeeded", async () => {
    const { client } = fixture(
      () => new Response('{"type":"columns","columns":["x"]}\n{"type":"row","row":[1]}\n')
    );
    await expect(
      executeScript(
        client,
        `
      const rows=[];
      for await(const event of graph.streamQuery({at:"commit/a",cypher:"RETURN 1"})) {
        rows.push(event.type);
      }
      return rows;
    `,
        false
      )
    ).rejects.toMatchObject({ code: "TRANSPORT_ERROR" });
  });

  it("supports writable incremental streamExecute while forbidding it in read mode", async () => {
    const { client } = fixture(
      () =>
        new Response('{"type":"columns","columns":["x"]}\n{"type":"summary","state":"commit/a"}\n')
    );
    const code = `
      const events=[];
      for await(const event of graph.streamExecute({branch:"main",cypher:"RETURN 1"})) {
        events.push(event.type);
      }
      return events;
    `;
    await expect(executeScript(client, code, false)).rejects.toMatchObject({
      code: "PERMISSION_DENIED"
    });
    expect(await executeScript(client, code, true)).toEqual(["columns", "summary"]);
  });

  it("limits simultaneously opened SDK streams to the configured stream budget", async () => {
    const { client } = fixture(() =>
      graphStream(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"type":"columns","columns":["x"]}\n'));
          }
        })
      )
    );
    await expect(
      executeScript(
        client,
        `
      const open = async (name) => JSON.parse(await __kgos_bridge(JSON.stringify({
        method:"stream-open",args:["graph.streamQuery",{at:"commit/a",cypher:name}]
      })));
      await Promise.all([open("first"),open("second")]);
      return true;
    `,
        false,
        options({ scriptMaxStreams: 1, scriptTimeoutMs: 1000 })
      )
    ).rejects.toMatchObject({ code: "RESOURCE_ERROR" });
  });
});
