import { expect, it, vi } from "vitest";

import {
  isSettingsSnapshot,
  readDiagnostics,
  readSettings,
  SettingsRequestError,
  testEmbedding,
  updateEmbeddingKey,
  updateSettings
} from "./settings-api.js";
import type { SettingsSnapshot } from "./settings-types.js";

function snapshot(): SettingsSnapshot {
  const config = {
    server: { public_origin: "https://kg.example.com" },
    cache: { path: "cache/vectors.db", max_size_mb: 4096 },
    sqlite: { extensions: [] },
    fulltext: { analyzer: "jieba" },
    embedding: {
      base_url: "https://api.example.com/v1",
      model: "example-model",
      dimensions: 1536,
      similarity: "cosine",
      api_key_env: "KGOS_WEB_EMBEDDING_API_KEY"
    }
  };
  return {
    revision: "opaque-revision-1",
    effective: config,
    saved: structuredClone(config),
    pendingRestart: false,
    credential: {
      source: "private_file",
      configured: true,
      canUpdate: true,
      pendingRestart: false
    },
    runtime: {
      version: "test-version",
      platform: "Linux amd64",
      endpoint: "http://127.0.0.1:8787",
      mcpPath: "/mcp",
      parameters: [{ key: "port", value: "8787", source: "--port" }]
    },
    databasePath: "/workspace/.kgos/kgos.db"
  };
}

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

it("reads the authenticated snapshot without sending credential material", async () => {
  const value = snapshot();
  const fetcher = vi.fn().mockResolvedValue(response(value));
  const controller = new AbortController();
  await expect(readSettings(fetcher, controller.signal)).resolves.toEqual(value);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/v1/web/settings/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: controller.signal
  });
});

it.each([
  null,
  {},
  { ...snapshot(), revision: "" },
  { ...snapshot(), saved: { ...snapshot().saved, server: undefined } },
  {
    ...snapshot(),
    effective: { ...snapshot().effective, cache: { path: "cache/db", max_size_mb: "4096" } }
  },
  { ...snapshot(), saved: { ...snapshot().saved, sqlite: { extensions: [{}] } } },
  {
    ...snapshot(),
    credential: { source: "unknown", configured: true, canUpdate: false, pendingRestart: false }
  },
  {
    ...snapshot(),
    runtime: { ...snapshot().runtime, parameters: [{ key: "port", value: 8787, source: "--port" }] }
  }
])("rejects malformed configuration projections", async (value) => {
  expect(isSettingsSnapshot(value)).toBe(false);
  await expect(readSettings(vi.fn().mockResolvedValue(response(value)))).rejects.toThrow(
    "Invalid settings response"
  );
});

it("accepts old configurations without a public origin and well formed optional extension fields", () => {
  const value = snapshot();
  value.effective.server = null;
  value.saved.server = null;
  value.saved.sqlite.extensions = [
    { source: "/tmp/extension.so", entrypoint: "sqlite3_example_init", library: "", sha256: "" }
  ];
  expect(isSettingsSnapshot(value)).toBe(true);
});

it("sends only the requested group and expected revision when saving", async () => {
  const value = snapshot();
  const patch = { server: { public_origin: "https://new.example.com" } };
  const fetcher = vi.fn().mockResolvedValue(response(value));
  await expect(updateSettings(fetcher, value.revision, patch)).resolves.toEqual(value);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/v1/web/settings/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision: value.revision, ...patch })
  });
});

it("reports a revision conflict without replaying a write or exposing server text", async () => {
  const fetcher = vi.fn().mockResolvedValue(response({ message: "private-server-detail" }, 409));
  const result = updateSettings(fetcher, "old-revision", {
    cache: { path: "cache/new.db", max_size_mb: 512 }
  });
  await expect(result).rejects.toMatchObject({ status: 409, message: "Settings request failed" });
  expect(fetcher).toHaveBeenCalledOnce();
});

it("sends a replacement credential only to its separate maintenance endpoint", async () => {
  const value = snapshot();
  const fetcher = vi.fn().mockResolvedValue(response(value));
  await expect(updateEmbeddingKey(fetcher, "key-revision", "new-test-credential")).resolves.toEqual(
    value
  );
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/v1/web/settings/embedding-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision: "key-revision", apiKey: "new-test-credential" })
  });
  expect(JSON.stringify(value)).not.toContain("new-test-credential");
});

it.each([
  { status: 200, body: { ok: true, dimensions: 1536 } },
  { status: 422, body: { ok: false, reason: "connection_failed" } },
  { status: 429, body: { ok: false, reason: "busy" } }
])(
  "preserves structured connection verification results for HTTP $status",
  async ({ status, body }) => {
    const controller = new AbortController();
    const fetcher = vi.fn().mockResolvedValue(response(body, status));
    await expect(testEmbedding(fetcher, controller.signal)).resolves.toEqual(body);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/v1/web/settings/test-embedding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: controller.signal
    });
  }
);

it("does not mistake an authentication error for a failed provider test", async () => {
  const fetcher = vi.fn().mockResolvedValue(response({ ok: false, reason: "private-detail" }, 401));
  await expect(testEmbedding(fetcher, new AbortController().signal)).rejects.toBeInstanceOf(
    SettingsRequestError
  );
});

it.each([undefined, Number.NaN, 0, -1, 1.5, 4097])(
  "rejects verification success without a supported whole-number dimension: %s",
  async (dimensions) => {
    const fetcher = vi.fn().mockResolvedValue(response({ ok: true, dimensions }));
    await expect(testEmbedding(fetcher, new AbortController().signal)).rejects.toThrow(
      "Invalid verification success"
    );
  }
);

it.each([422, 429])("rejects a contradictory success payload for HTTP %s", async (status) => {
  const fetcher = vi.fn().mockResolvedValue(response({ ok: true, dimensions: 1536 }, status));
  await expect(testEmbedding(fetcher, new AbortController().signal)).rejects.toThrow(
    "Invalid verification success"
  );
});

it.each([1, 4096])("accepts the supported dimension boundary %s", async (dimensions) => {
  const body = { ok: true, dimensions };
  const fetcher = vi.fn().mockResolvedValue(response(body));
  await expect(testEmbedding(fetcher, new AbortController().signal)).resolves.toEqual(body);
});

it("rejects a failure without its stable reason", async () => {
  const fetcher = vi.fn().mockResolvedValue(response({ ok: false }, 422));
  await expect(testEmbedding(fetcher, new AbortController().signal)).rejects.toThrow(
    "Invalid verification failure"
  );
});

it("rejects malformed verification and diagnostics responses", async () => {
  await expect(
    testEmbedding(vi.fn().mockResolvedValue(response({ ok: "true" })), new AbortController().signal)
  ).rejects.toThrow("Invalid verification response");
  await expect(
    readDiagnostics(vi.fn().mockResolvedValue(response(null)), new AbortController().signal)
  ).rejects.toThrow("Invalid diagnostics response");
});

it("reads existing process diagnostics without broadening the endpoint", async () => {
  const value = { runId: "run-example", http: { requestsTotal: 2 } };
  const fetcher = vi.fn().mockResolvedValue(response(value));
  await expect(readDiagnostics(fetcher, new AbortController().signal)).resolves.toEqual(value);
  expect(fetcher.mock.calls[0]?.[0]).toBe("/api/v1/system/diagnostics");
});
