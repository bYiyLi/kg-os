import { describe, expect, it, vi } from "vitest";
import { KGOSDaemonError } from "@kgos/sdk";
import { Connection } from "./connection.js";
import { Context } from "./context.js";

describe("connection and pinned context", () => {
  it("bootstraps only by explicit connection and guards subsequent requests", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ daemonBootId: "boot", storageStatus: "unavailable" }))
        )
      );
    const connection = new Connection("http://127.0.0.1:1", fetcher);
    const client = await connection.connect("opaque");
    await client?.evolution.overview();
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).has("X-KGOS-Expected-Daemon-Boot")
    ).toBe(false);
    expect(
      new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("X-KGOS-Expected-Daemon-Boot")
    ).toBe("boot");
    expect(connection.writableStore).toBe(false);
    const controller = connection.controller();
    connection.failure(
      new KGOSDaemonError({ code: "WEB_CONNECTION_CHANGED", message: "changed" }, 409)
    );
    expect(connection.client).toBeUndefined();
    expect(controller.signal.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("clears invalid credentials, retains diagnostics, and discards late bootstrap", async () => {
    const unauthorized = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ code: "AUTHENTICATION_FAILED", message: "unavailable" }), {
        status: 401
      })
    );
    const connection = new Connection("http://127.0.0.1:1", unauthorized);
    expect(await connection.connect("opaque")).toBeUndefined();
    expect(connection.status).toContain("凭证不可用");
    const response = Promise.withResolvers<Response>();
    const late = new Connection(
      "http://127.0.0.1:1",
      vi.fn<typeof fetch>().mockReturnValue(response.promise)
    );
    const pending = late.connect("opaque");
    late.disconnect();
    response.resolve(new Response(JSON.stringify({ daemonBootId: "old", storageStatus: "ready" })));
    expect(await pending).toBeUndefined();
    expect(late.client).toBeUndefined();
  });

  it("keeps old State until resolution succeeds and observes ref changes without following", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((url) => {
      const path = url instanceof Request ? url.url : url.toString();
      if (path.endsWith("/info"))
        return Promise.resolve(
          new Response(JSON.stringify({ daemonBootId: "boot", storageStatus: "ready" }))
        );
      if (path.endsWith("/get"))
        return Promise.resolve(new Response(JSON.stringify({ state: "commit/a" })));
      return Promise.resolve(
        new Response(JSON.stringify({ items: [{ name: "main", state: "commit/b" }] }))
      );
    });
    const connection = new Connection("http://127.0.0.1:1", fetcher);
    await connection.connect("opaque");
    const context = new Context(connection);
    expect(await context.select("branch/main")).toBe(true);
    await context.observe();
    expect(context.state).toBe("commit/a");
    expect(context.headChanged).toBe(true);
    expect(context.editable).toBe(false);
    const response = Promise.withResolvers<Response>();
    fetcher.mockReturnValueOnce(response.promise);
    const pending = context.select("branch/side");
    expect(context.resolving).toBe(true);
    expect(context.state).toBe("commit/a");
    response.resolve(
      new Response(JSON.stringify({ code: "STATE_NOT_FOUND", message: "missing" }), { status: 404 })
    );
    expect(await pending).toBe(false);
    expect(context.inputRef).toBe("branch/main");
    expect(context.runnable).toBe(false);
    context.resumeCurrent();
    expect(context.runnable).toBe(true);
  });
});

it("aborts only tracked response-budget signals and retains ordinary failure diagnostics", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ daemonBootId: "boot", storageStatus: "ready", storeId: "store" })
    );
  const connection = new Connection("http://127.0.0.1:42", fetcher);
  const client = await connection.connect("opaque");
  expect(connection.writableStore).toBe(true);
  const tracked = connection.controller();
  const unrelated = connection.controller();
  fetcher.mockResolvedValueOnce(
    new Response("汉".repeat(400000), { headers: { "Content-Type": "application/x-ndjson" } })
  );
  const consume = async () => {
    for await (const event of client?.graph.streamQuery(
      { at: "commit/original", cypher: "RETURN 1" },
      { signal: tracked.signal }
    ) ?? [])
      expect(event.type).not.toBe("");
  };
  await expect(consume()).rejects.toThrow("stream failed");
  expect(tracked.signal.aborted).toBe(true);
  expect(unrelated.signal.aborted).toBe(false);
  expect(connection.failure(new Error("offline"))).toBe("offline");
  expect(connection.failure(null)).toContain("请求失败");
  expect(
    connection.failure(
      new KGOSDaemonError({ code: "AUTHENTICATION_FAILED", message: "invalid" }, 401)
    )
  ).toContain("AUTHENTICATION_FAILED");
  expect(unrelated.signal.aborted).toBe(true);
  expect(connection.client).toBeUndefined();
});

it("reports failed bootstrap without retaining a client or leaving the connector busy", async () => {
  const connection = new Connection(
    "http://127.0.0.1:42",
    vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"))
  );
  expect(await connection.connect("opaque")).toBeUndefined();
  expect(connection.status).toContain("daemon request failed");
  expect(connection.connecting).toBe(false);
  expect(connection.info).toBeUndefined();
});

it("refuses an old client that tries to mutate only after an awaited UI save finishes", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(() =>
      Promise.resolve(
        Response.json({ daemonBootId: "boot", storageStatus: "ready", storeId: "store" })
      )
    );
  const connection = new Connection("http://127.0.0.1:42", fetcher);
  const old = await connection.connect("original-token");
  const save = Promise.withResolvers<boolean>();
  const delayedWrite = save.promise.then(() =>
    old?.graph.execute({ branch: "main", cypher: "CREATE (n)" })
  );
  connection.disconnect();
  await connection.connect("new-token");
  save.resolve(true);
  await expect(delayedWrite).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(connection.status).toBe("已连接");
  expect(connection.client).not.toBe(old);
});

it("discards an older 401 after reconnect and leaves the newly authenticated connection usable", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ daemonBootId: "old-boot", storeId: "store", storageStatus: "ready" })
    );
  const connection = new Connection("http://127.0.0.1:42", fetcher);
  const old = await connection.connect("old-token");
  const response = Promise.withResolvers<Response>();
  fetcher.mockReturnValueOnce(response.promise);
  const pending = old?.evolution.get({ state: "commit/original" });
  fetcher.mockResolvedValueOnce(
    Response.json({ daemonBootId: "new-boot", storeId: "store", storageStatus: "ready" })
  );
  const current = await connection.connect("new-token");
  const active = connection.controller();
  const cancel = vi.fn();
  response.resolve(new Response(new ReadableStream<Uint8Array>({ cancel }), { status: 401 }));
  await expect(pending).rejects.toThrow();
  expect(cancel).toHaveBeenCalledOnce();
  expect(connection.client).toBe(current);
  expect(connection.status).toBe("已连接");
  expect(connection.info?.daemonBootId).toBe("new-boot");
  expect(active.signal.aborted).toBe(false);
  fetcher.mockResolvedValueOnce(Response.json({ state: "commit/new" }));
  expect(await current?.evolution.get({ state: "branch/main" })).toMatchObject({
    state: "commit/new"
  });
  expect(new Headers(fetcher.mock.calls[3]?.[1]?.headers).get("X-KGOS-Expected-Daemon-Boot")).toBe(
    "new-boot"
  );
});
