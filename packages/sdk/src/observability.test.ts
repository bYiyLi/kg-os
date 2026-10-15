import { describe, expect, it, vi } from "vitest";

import { KGOSClient, KGOSDaemonError, KGOSTransportError } from "./index.js";

// cspell:words goroutines

describe("KG OS observability SDK", () => {
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
