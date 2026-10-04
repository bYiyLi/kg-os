import { describe, expect, it, vi } from "vitest";
import { createWebFetch, RESPONSE_LIMITS, ResponseBudgetError } from "./transport.js";

function adapter(response: Response, boot?: string) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
  const abort = vi.fn();
  const onUnauthorized = vi.fn();
  return {
    fetcher,
    abort,
    onUnauthorized,
    fetch: createWebFetch({ boot: () => boot, fetch: fetcher, abort, onUnauthorized })
  };
}

describe("bounded Web fetch", () => {
  it("preserves the original signal, guard and bytes while slicing chunks", async () => {
    const bytes = new TextEncoder().encode("x".repeat(RESPONSE_LIMITS.chunk * 2 + 7));
    const { fetch, fetcher } = adapter(new Response(bytes), "boot");
    const signal = new AbortController().signal;
    const response = await fetch("http://local/api", {
      headers: { Authorization: "Bearer opaque" },
      signal
    });
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(signal);
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("X-KGOS-Expected-Daemon-Boot")
    ).toBe("boot");
    const reader = response.body?.getReader();
    expect((await reader?.read())?.value?.byteLength).toBe(RESPONSE_LIMITS.chunk);
    expect((await reader?.read())?.value?.byteLength).toBe(RESPONSE_LIMITS.chunk);
    expect((await reader?.read())?.value?.byteLength).toBe(7);
    expect((await reader?.read())?.done).toBe(true);
  });

  it("fails whole JSON responses before decoding when bytes exceed budget", async () => {
    const { fetch, abort } = adapter(new Response(new Uint8Array(RESPONSE_LIMITS.json + 1)));
    const signal = new AbortController().signal;
    const response = await fetch("http://local/api", { signal });
    await expect(response.arrayBuffer()).rejects.toBeInstanceOf(ResponseBudgetError);
    expect(abort).toHaveBeenCalledWith(signal, expect.any(ResponseBudgetError));
  });

  it("bounds an NDJSON event independently of upstream chunk size and line splits", async () => {
    const { fetch, abort } = adapter(
      new Response("x".repeat(RESPONSE_LIMITS.event + 1), {
        headers: { "Content-Type": "application/x-ndjson" }
      })
    );
    const response = await fetch("http://local/api");
    await expect(response.text()).rejects.toBeInstanceOf(ResponseBudgetError);
    expect(abort).toHaveBeenCalledOnce();
    const lines = adapter(
      new Response(("x".repeat(600_000) + "\n").repeat(2), {
        headers: { "Content-Type": "application/x-ndjson" }
      })
    );
    expect((await (await lines.fetch("http://local/api")).text()).length).toBe(1_200_002);
  });

  it("isolates downloads, unauthorized feedback and cancellation", async () => {
    const original = new Response("SQLite", { status: 401 });
    const download = adapter(original);
    expect(
      await download.fetch("http://local/api", { headers: { Accept: "application/vnd.sqlite3" } })
    ).toBe(original);
    expect(download.onUnauthorized).toHaveBeenCalledOnce();
    const cancel = vi.fn();
    const stream = adapter(new Response(new ReadableStream<Uint8Array>({ cancel })));
    await (await stream.fetch("http://local/api")).body?.cancel("closed");
    expect(cancel).toHaveBeenCalledWith("closed");
    const empty = adapter(new Response(null));
    expect((await empty.fetch("http://local/api")).body).toBeNull();
  });
});

it("enforces event budgets in UTF-8 bytes even when a line spans multiple upstream chunks", async () => {
  const bytes = new TextEncoder().encode("汉".repeat(Math.ceil(RESPONSE_LIMITS.event / 3)));
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.subarray(0, bytes.length / 2));
      controller.enqueue(bytes.subarray(bytes.length / 2));
      controller.close();
    }
  });
  const { fetch, abort } = adapter(
    new Response(source, { headers: { "Content-Type": "application/x-ndjson" } })
  );
  const response = await fetch("http://local/api");
  await expect(response.text()).rejects.toBeInstanceOf(ResponseBudgetError);
  expect(abort).toHaveBeenCalledOnce();
  const safe = adapter(
    new Response(("汉".repeat(300000) + "\n").repeat(2), {
      headers: { "Content-Type": "application/x-ndjson" }
    })
  );
  expect((await (await safe.fetch("http://local/api")).text()).length).toBe(600002);
});

it("retains upstream failure diagnostics and uses default fetch without inventing a budget error", async () => {
  const error = new Error("reader failed");
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(error);
    }
  });
  const { fetch, abort } = adapter(new Response(source));
  await expect((await fetch("http://local/api")).text()).rejects.toBe(error);
  expect(abort).not.toHaveBeenCalled();
  const original = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("fallback"));
  const fallback = createWebFetch({ boot: () => undefined, abort, onUnauthorized: vi.fn() });
  expect(await (await fallback("http://local/api")).text()).toBe("fallback");
  original.mockRestore();
});

it("preserves the budget failure when upstream cancellation also fails", async () => {
  const cancel = vi.fn(() => Promise.reject(new Error("source cancel failed")));
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(RESPONSE_LIMITS.json + 1));
    },
    cancel
  });
  const { fetch, abort } = adapter(new Response(source));
  const response = await fetch("http://local/api");
  await expect(response.arrayBuffer()).rejects.toBeInstanceOf(ResponseBudgetError);
  expect(cancel).toHaveBeenCalledOnce();
  expect(abort).toHaveBeenCalledOnce();
});

it("refuses a stale response even when cancelling its body fails", async () => {
  const cancel = vi.fn(() => Promise.reject(new Error("source cancel failed")));
  const source = new ReadableStream<Uint8Array>({ cancel });
  const valid = vi.fn<() => boolean>().mockReturnValueOnce(true).mockReturnValue(false);
  const onUnauthorized = vi.fn();
  const fetcher = createWebFetch({
    boot: () => "boot",
    valid,
    fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(source, { status: 401 })),
    abort: vi.fn(),
    onUnauthorized
  });
  await expect(fetcher("http://local/api")).rejects.toThrow("已停止读取旧响应");
  expect(cancel).toHaveBeenCalledOnce();
  expect(onUnauthorized).not.toHaveBeenCalled();
});
