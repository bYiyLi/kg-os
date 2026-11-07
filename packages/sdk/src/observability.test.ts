import { describe, expect, it, vi } from "vitest";

import { KGOSClient, KGOSDaemonError, KGOSTransportError } from "./index.js";

// cspell:words goroutines

describe("KG OS observability SDK", () => {
  it("uses existing authenticated transport for all bounded historical diagnostic routes", async () => {
    const overview = {
      availability: "available",
      coverage: { dropped: 0, truncated: false },
      total: 0,
      success: 0,
      errors: 0,
      slow: 0,
      incomplete: 0,
      trend: [],
      resources: [],
      events: [],
      snapshot: {}
    };
    const list = {
      availability: "available",
      coverage: overview.coverage,
      items: [],
      next_cursor: ""
    };
    const detail = {
      availability: "available",
      coverage: overview.coverage,
      request: {},
      spans: [],
      logs: []
    };
    const logs = {
      availability: "available",
      coverage: overview.coverage,
      items: [{ id: 1, request_id: "req_" + "b".repeat(32), event: "http.request.finished" }]
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(overview)))
      .mockResolvedValueOnce(new Response(JSON.stringify(list)))
      .mockResolvedValueOnce(new Response(JSON.stringify(detail)))
      .mockResolvedValueOnce(new Response(JSON.stringify(logs)));
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:5000",
      token: "web-access",
      fetch: fetcher
    });
    const controller = new AbortController();
    await expect(
      client.system.observability.overview({}, { signal: controller.signal })
    ).resolves.toEqual(overview);
    await expect(
      client.system.observability.requests.list({ limit: 50, route: "mcp" })
    ).resolves.toEqual(list);
    await expect(
      client.system.observability.requests.get({
        request_id: "req_12345678901234567890123456789012",
        limit: 10
      })
    ).resolves.toEqual(detail);
    await expect(
      client.system.observability.logs.list({ limit: 25, level: "WARN" })
    ).resolves.toEqual(logs);
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      "http://127.0.0.1:5000/api/v1/system/observability/overview",
      "http://127.0.0.1:5000/api/v1/system/observability/requests/list",
      "http://127.0.0.1:5000/api/v1/system/observability/requests/get",
      "http://127.0.0.1:5000/api/v1/system/observability/logs/list"
    ]);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: "{}",
      signal: controller.signal,
      headers: { Authorization: "Bearer web-access", Accept: "application/json" }
    });
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      body: JSON.stringify({ limit: 50, route: "mcp" })
    });
    expect(fetcher.mock.calls[2]?.[1]).toMatchObject({
      body: JSON.stringify({ request_id: "req_12345678901234567890123456789012", limit: 10 })
    });
    expect(fetcher.mock.calls[3]?.[1]).toMatchObject({
      body: JSON.stringify({ limit: 25, level: "WARN" })
    });
  });
  it("retrieves process-local diagnostics without changing the authentication contract", async () => {
    const diagnostics = {
      uptime_seconds: 8,
      process: { heap_alloc_bytes: 128, goroutines: 2 },
      http: {
        requests_total: 2,
        non_2xx_total: 1,
        in_flight: 1,
        latency_ms_buckets: { le_50: 1, le_250: 1, le_1000: 0, over_1000: 0 }
      },
      mcp: { tool_calls_total: 1, tool_errors_total: 0, tool_timeouts_total: 0, in_flight: 0 },
      business: { operations_total: 1, outcomes: { applied: 1 } },
      sandbox: { resource_limits_total: 0 }
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(diagnostics), { status: 200 }));
    const client = new KGOSClient({
      endpoint: "http://127.0.0.1:5000",
      token: "secret",
      fetch: fetcher
    });
    await expect(client.system.diagnostics()).resolves.toEqual(diagnostics);
    expect(fetcher.mock.calls[0]?.[0]).toBe("http://127.0.0.1:5000/api/v1/system/diagnostics");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { Authorization: "Bearer secret" },
      body: "{}"
    });
  });

  it("preserves the server request ID for daemon and invalid transport responses", async () => {
    const id = "req_12345678901234567890123456789012";
    const daemon = new KGOSClient({
      endpoint: "http://127.0.0.1:5000",
      token: "secret",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ code: "IO_ERROR", message: "failed" }), {
          status: 500,
          headers: { "X-KGOS-Request-ID": id }
        })
      )
    });
    const failure = await daemon.evolution.overview().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(KGOSDaemonError);
    expect(failure).toMatchObject({ code: "IO_ERROR", requestId: id });

    const invalid = new KGOSClient({
      endpoint: "http://127.0.0.1:5000",
      token: "secret",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response("not JSON", {
          headers: { "X-KGOS-Request-ID": id }
        })
      )
    });
    const bad = await invalid.evolution.overview().catch((error: unknown) => error);
    expect(bad).toBeInstanceOf(KGOSTransportError);
    expect(bad).toMatchObject({ requestId: id });
  });
});
