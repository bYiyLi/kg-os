import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({
  endpointReachable: vi.fn(),
  readLocator: vi.fn(),
  readToken: vi.fn(),
  resolveNativeRuntime: vi.fn()
}));

vi.mock("../runtime.js", () => runtimeMocks);

import { encodeConfig, type InstanceConfig } from "../config.js";
import { diagnose, runDoctor } from "./doctor.js";

const CONFIG: InstanceConfig = {
  cache: { path: "cache/openai-compatible.db", max_size_mb: 4096 },
  fulltext: { analyzer: "unicode61" },
  embedding: {
    base_url: "https://example.test/v1",
    model: "fixture",
    dimensions: 3,
    similarity: "cosine",
    api_key_env: ""
  }
};

afterEach(() => {
  vi.restoreAllMocks();
  runtimeMocks.endpointReachable.mockReset();
  runtimeMocks.readLocator.mockReset();
  runtimeMocks.readToken.mockReset();
  runtimeMocks.resolveNativeRuntime.mockReset();
});

describe("kg doctor", () => {
  it("is side-effect-free for a missing root and reports blockers", async () => {
    const parent = await mkdtemp(join(tmpdir(), "kgos-doctor-"));
    const root = join(parent, "missing");
    runtimeMocks.resolveNativeRuntime.mockResolvedValue({
      name: "@kgos/runtime-darwin-arm64",
      root: "/runtime",
      daemon: "/runtime/kgosd",
      version: "0.0.0"
    });

    const result = await diagnose(root);
    expect(result.ready).toBe(false);
    expect(result.checks.find((item) => item.id === "root")).toMatchObject({
      status: "error",
      blocking: true
    });
  });

  it("reports an initialized stopped Instance as ready", async () => {
    const root = await mkdtemp(join(tmpdir(), "kgos-doctor-"));
    await writeFile(join(root, "config.toml"), encodeConfig(CONFIG));
    runtimeMocks.resolveNativeRuntime.mockResolvedValue({
      name: "@kgos/runtime-darwin-arm64",
      root: "/runtime",
      daemon: "/runtime/kgosd",
      version: "0.0.0"
    });
    runtimeMocks.readLocator.mockResolvedValue(undefined);

    const result = await diagnose(root);
    expect(result.ready).toBe(true);
    expect(result.checks.find((item) => item.id === "daemon")?.details).toEqual({
      state: "stopped"
    });
    expect(result.checks.find((item) => item.id === "credential")?.status).toBe("info");
  });

  it("surfaces Runtime/config/environment failures", async () => {
    const root = await mkdtemp(join(tmpdir(), "kgos-doctor-"));
    await writeFile(
      join(root, "config.toml"),
      encodeConfig({
        ...CONFIG,
        embedding: { ...CONFIG.embedding, api_key_env: "MISSING_KEY" }
      })
    );
    runtimeMocks.resolveNativeRuntime.mockRejectedValue(new Error("runtime missing"));
    runtimeMocks.readLocator.mockResolvedValue(undefined);

    const result = await diagnose(root);
    expect(result.ready).toBe(false);
    expect(result.checks.find((item) => item.id === "runtime")?.status).toBe("error");
    expect(result.checks.find((item) => item.id === "environment")?.status).toBe("error");
  });

  it("formats JSON and human output without starting the daemon", async () => {
    const root = await mkdtemp(join(tmpdir(), "kgos-doctor-"));
    await writeFile(join(root, "config.toml"), encodeConfig(CONFIG));
    runtimeMocks.resolveNativeRuntime.mockResolvedValue({
      name: "@kgos/runtime-darwin-arm64",
      root: "/runtime",
      daemon: "/runtime/kgosd",
      version: "0.0.0"
    });
    runtimeMocks.readLocator.mockResolvedValue(undefined);
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runDoctor(root, ["--json"]);
    expect(String(write.mock.calls.at(-1)?.[0])).toContain('"ready":true');
    write.mockClear();
    await runDoctor(root, []);
    expect(write.mock.calls.map((call) => String(call[0])).join("")).toContain("ready");
  });
});
