import { afterEach, expect, it, vi } from "vitest";

import { boundedGraphResponse, MAX_GRAPH_RESPONSE_BYTES } from "./bounded-graph-fetch.js";
import { connectToCurrentInstance } from "./connect.js";

const endpoint = "http://localhost/api/v1/graph/query";
const jsonRequest = { method: "POST", headers: { Accept: "application/json" } };
const signal = () => new AbortController().signal;

function oversizedResponse(headers?: HeadersInit) {
  const cancel = vi.fn();
  const chunk = new Uint8Array(64 * 1024);
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(chunk);
    },
    cancel
  });
  return { body, cancel, response: new Response(body, headers === undefined ? {} : { headers }) };
}

function pendingResponse() {
  const cancel = vi.fn();
  let markStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const body = new ReadableStream<Uint8Array>({
    pull() {
      markStarted();
    },
    cancel
  });
  return { body, cancel, started, response: new Response(body) };
}

function mockConnection(graphResponse: Response) {
  vi.stubGlobal("window", { location: { origin: "http://localhost" } });
  const boot = "e48245ac-51a4-4b6b-93ba-07bb4d0626a6";
  const fetcher = vi.fn<typeof fetch>().mockImplementation((input) => {
    const path = new URL(requestUrl(input)).pathname;
    if (path === "/api/v1/graph/query") return Promise.resolve(graphResponse);
    if (path === "/api/v1/web/auth/login") {
      return Promise.resolve(
        new Response(JSON.stringify({ accessToken: "kgws_" + "A".repeat(43), daemonBootId: boot }))
      );
    }
    if (path === "/api/v1/web/data/info") {
      return Promise.resolve(
        new Response(JSON.stringify({ daemonBootId: boot, storageStatus: "unsupported" }))
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({ defaultBranch: "main", state: "commit/a" }))
    );
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

afterEach(() => vi.unstubAllGlobals());

it("buffers complete JSON bytes without changing headers, status or decoding", async () => {
  const payload = '{"state":"commit/a","rows":[["知识图谱"]]}';
  const response = new Response(payload, {
    status: 202,
    statusText: "Accepted",
    headers: { "Content-Type": "application/json", "X-KGOS-Request-ID": "sample" }
  });
  const bounded = await boundedGraphResponse(new URL(endpoint), jsonRequest, response, signal());
  expect(response.bodyUsed).toBe(true);
  expect(response.body?.locked).toBe(false);
  expect(bounded.bodyUsed).toBe(false);
  expect(bounded.status).toBe(202);
  expect(bounded.statusText).toBe("Accepted");
  expect([...bounded.headers]).toEqual([...response.headers]);
  expect(await bounded.text()).toBe(payload);
});

it("accepts the exact byte limit and ignores malformed declared lengths", async () => {
  const response = new Response(new Uint8Array(MAX_GRAPH_RESPONSE_BYTES), {
    headers: { "Content-Length": "not-a-length" }
  });
  const bounded = await boundedGraphResponse(endpoint, jsonRequest, response, signal());
  expect((await bounded.arrayBuffer()).byteLength).toBe(MAX_GRAPH_RESPONSE_BYTES);
});

it("rejects an excessive Content-Length before reading the body and releases its reader", async () => {
  const cancel = vi.fn();
  const response = new Response(new ReadableStream<Uint8Array>({ cancel }), {
    headers: { "Content-Length": String(MAX_GRAPH_RESPONSE_BYTES + 1) }
  });
  await expect(boundedGraphResponse(endpoint, jsonRequest, response, signal())).rejects.toThrow(
    "Graph response exceeds the 16 MiB browser limit"
  );
  expect(cancel).toHaveBeenCalledOnce();
  expect(response.body?.locked).toBe(false);
});

it("counts streamed bytes even when Content-Length claims a small body", async () => {
  const { body, cancel, response } = oversizedResponse({ "Content-Length": "2" });
  await expect(boundedGraphResponse(endpoint, jsonRequest, response, signal())).rejects.toThrow(
    RangeError
  );
  expect(cancel).toHaveBeenCalledOnce();
  expect(body.locked).toBe(false);
});

it("bounds responses without Content-Length and preserves a limit failure when cancel fails", async () => {
  const response = oversizedResponse();
  response.cancel.mockImplementation(() => {
    throw new Error("Cancellation failed");
  });
  await expect(
    boundedGraphResponse(endpoint, jsonRequest, response.response, signal())
  ).rejects.toThrow("16 MiB browser limit");
  expect(response.body.locked).toBe(false);
});

it("interrupts an in-progress body read when the request is cancelled", async () => {
  const { body, cancel, response, started } = pendingResponse();
  const controller = new AbortController();
  const result = boundedGraphResponse(endpoint, jsonRequest, response, controller.signal);
  await started;
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(cancel).toHaveBeenCalledOnce();
  expect(body.locked).toBe(false);
});

it("cancels an already-aborted request without retaining its body reader", async () => {
  const { body, cancel, response } = pendingResponse();
  const controller = new AbortController();
  controller.abort();
  await expect(
    boundedGraphResponse(endpoint, jsonRequest, response, controller.signal)
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(cancel).toHaveBeenCalledOnce();
  expect(body.locked).toBe(false);
});

it("does not wait for a stalled transport cancellation before rejecting an abort", async () => {
  const source = pendingResponse();
  source.cancel.mockImplementation(() => new Promise<void>(() => undefined));
  const controller = new AbortController();
  const result = boundedGraphResponse(endpoint, jsonRequest, source.response, controller.signal);
  await source.started;
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(source.cancel).toHaveBeenCalledOnce();
  expect(source.body.locked).toBe(false);
});

it("releases the reader when the source stream fails", async () => {
  const failure = new Error("Read failed");
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(failure);
      }
    })
  );
  await expect(boundedGraphResponse(endpoint, jsonRequest, response, signal())).rejects.toBe(
    failure
  );
  expect(response.body?.locked).toBe(false);
});

it.each([
  ["/api/v1/ontology/read", jsonRequest],
  [endpoint, { ...jsonRequest, method: "GET" }],
  [endpoint, { method: "POST", headers: { Accept: "application/x-ndjson" } }],
  [endpoint, undefined]
])("leaves non-JSON graph requests untouched: %s", async (address, request) => {
  const response = new Response("original", {
    headers: { "Content-Length": String(MAX_GRAPH_RESPONSE_BYTES + 1) }
  });
  expect(await boundedGraphResponse(address, request, response, signal())).toBe(response);
  expect(response.bodyUsed).toBe(false);
  expect(await response.text()).toBe("original");
});

it.each([401, 409])("leaves HTTP %s error decoding and body untouched", async (status) => {
  const response = new Response('{"code":"AUTHENTICATION_FAILED"}', { status });
  expect(await boundedGraphResponse(endpoint, jsonRequest, response, signal())).toBe(response);
  expect(response.bodyUsed).toBe(false);
});

it("preserves null-body response semantics", async () => {
  const response = new Response(null, { status: 204 });
  expect(await boundedGraphResponse(endpoint, jsonRequest, response, signal())).toBe(response);
  expect(response.body).toBeNull();
});

it("honors Request inputs, media-type case and init header overrides", async () => {
  const input = new Request(endpoint, {
    method: "POST",
    headers: { Accept: "Application/JSON; charset=utf-8" }
  });
  const response = new Response("{}");
  const bounded = await boundedGraphResponse(input, undefined, response, signal());
  expect(bounded).not.toBe(response);
  expect(await bounded.json()).toEqual({});
  const streamResponse = new Response("original");
  expect(
    await boundedGraphResponse(
      input,
      { headers: { Accept: "application/x-ndjson" } },
      streamResponse,
      signal()
    )
  ).toBe(streamResponse);
});

it("does not mark the connection offline or retry when a graph response exceeds the limit", async () => {
  const source = oversizedResponse({ "Content-Length": String(MAX_GRAPH_RESPONSE_BYTES + 1) });
  const fetcher = mockConnection(source.response);
  const lost = vi.fn();
  const connection = await connectToCurrentInstance("secret", signal(), lost);
  await expect(
    connection.client.graph.query({ at: "commit/a", cypher: "RETURN 1" })
  ).rejects.toMatchObject({
    aborted: false,
    causeValue: { name: "RangeError", message: "Graph response exceeds the 16 MiB browser limit" }
  });
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(lost).not.toHaveBeenCalled();
  await expect(connection.client.evolution.overview()).resolves.toMatchObject({
    state: "commit/a"
  });
  connection.close();
});

it("ends a pending graph body read on connection close without emitting an offline loss", async () => {
  const source = pendingResponse();
  mockConnection(source.response);
  const lost = vi.fn();
  const connection = await connectToCurrentInstance("secret", signal(), lost);
  const result = connection.client.graph.query({ at: "commit/a", cypher: "RETURN 1" });
  await source.started;
  connection.close();
  await expect(result).rejects.toMatchObject({ aborted: true });
  expect(lost).not.toHaveBeenCalled();
  expect(source.cancel).toHaveBeenCalledOnce();
  expect(source.body.locked).toBe(false);
});
