import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({
  endpointReachable: vi.fn(),
  readLocator: vi.fn(),
  readToken: vi.fn(),
  resolveNativeRuntime: vi.fn()
}));

vi.mock("../runtime.js", () => runtimeMocks);

import { configPath, encodeConfig, type InstanceConfig } from "../config.js";
import { diagnose, runDoctor } from "./doctor.js";

const CONFIG: InstanceConfig = {
  cache: { path: "cache/openai-compatible.db", max_size_mb: 4096 },
  fulltext: { analyzer: "jieba" },
  embedding: {
    base_url: "https://example.test/v1",
    model: "fixture",
    dimensions: 3,
    similarity: "cosine",
    api_key_env: ""
  }
};

beforeEach(() => {
  runtimeMocks.resolveNativeRuntime.mockResolvedValue({
    name: "@kgos/runtime-darwin-arm64",
    root: "/runtime",
    daemon: "/runtime/kgosd",
    version: "0.2.0",
    extensions: []
  });
  runtimeMocks.readLocator.mockResolvedValue(undefined);
  runtimeMocks.readToken.mockResolvedValue("secret");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  runtimeMocks.endpointReachable.mockReset();
  runtimeMocks.readLocator.mockReset();
  runtimeMocks.readToken.mockReset();
  runtimeMocks.resolveNativeRuntime.mockReset();
});

describe("kg doctor", () => {
  it("is side-effect-free for a missing Workspace Root and reports blockers", async () => {
    const parent = await mkdtemp(join(tmpdir(), "kgos-doctor-"));
    const root = join(parent, "missing");

    const result = await diagnose(root);
    expect(result.ready).toBe(false);
    expect(result.checks.find((item) => item.id === "workspace")).toMatchObject({
      status: "error",
      blocking: true
    });
    await expect(access(root)).rejects.toThrow();
  });

  it("reports a completed stopped Instance as ready", async () => {
    const root = await readyInstance();
    const result = await diagnose(root);

    expect(result.ready).toBe(true);
    expect(result.instance).toBe(join(root, ".kgos"));
    expect(result.checks.find((item) => item.id === "daemon")?.details).toEqual({
      state: "stopped"
    });
    expect(result.checks.find((item) => item.id === "initialization")?.status).toBe("ok");
    expect(result.checks.find((item) => item.id === "credential")?.status).toBe("ok");
  });

  it("does not treat config-only recovery state as ready", async () => {
    const root = await mkdtemp(join(tmpdir(), "kgos-doctor-"));
    await mkdir(join(root, ".kgos", "extensions"), { recursive: true });
    await writeFile(configPath(root), encodeConfig(CONFIG));

    const result = await diagnose(root);
    expect(result.ready).toBe(false);
    expect(result.checks.find((item) => item.id === "initialization")).toMatchObject({
      status: "error",
      blocking: true
    });
  });

  it("surfaces Runtime, config, and environment failures", async () => {
    const root = await mkdtemp(join(tmpdir(), "kgos-doctor-"));
    await mkdir(join(root, ".kgos"), { recursive: true });
    await writeFile(
      configPath(root),
      encodeConfig({
        ...CONFIG,
        embedding: { ...CONFIG.embedding, api_key_env: "MISSING_KEY" }
      })
    );
    runtimeMocks.resolveNativeRuntime.mockRejectedValue(new Error("runtime missing"));

    const result = await diagnose(root);
    expect(result.ready).toBe(false);
    expect(result.checks.find((item) => item.id === "runtime")?.status).toBe("error");
    expect(result.checks.find((item) => item.id === "environment")?.status).toBe("error");
  });

  it("fails closed when a local additional extension violates its configured SHA-256", async () => {
    const root = await mkdtemp(join(tmpdir(), "kgos-doctor-"));
    const instance = join(root, ".kgos");
    const source = join(root, "custom.dylib");
    await mkdir(join(instance, "extensions"), { recursive: true });
    await writeFile(source, "fixture");
    await writeFile(
      configPath(root),
      encodeConfig({
        ...CONFIG,
        sqlite: {
          extensions: [
            {
              source,
              entrypoint: "sqlite3_custom_init",
              sha256: "0".repeat(64)
            }
          ]
        }
      })
    );
    await writeFile(join(instance, "auth.json"), '{"token":"secret"}\n');
    await writeFile(join(instance, "kgos.db"), "");
    await writeFile(join(instance, "initialized.json"), '{"version":1}\n');

    const result = await diagnose(root);
    expect(result.ready).toBe(false);
    expect(result.checks.find((item) => item.id === "extensions")).toMatchObject({
      status: "error",
      blocking: true,
      message: "additional extension source failed configured SHA-256"
    });
  });

  it("detects a corrupted cached Runtime artifact", async () => {
    const root = await readyInstance();
    const expected = Buffer.from("official extension");
    const sha256 = createHash("sha256").update(expected).digest("hex");
    const cacheRoot = join(root, ".kgos", "extensions", sha256);
    await mkdir(cacheRoot, { recursive: true });
    await writeFile(join(cacheRoot, "manifest.json"), JSON.stringify({ sha256, files: {} }) + "\n");
    await writeFile(join(cacheRoot, "artifact"), "corrupt");
    runtimeMocks.resolveNativeRuntime.mockResolvedValue({
      name: "@kgos/runtime-darwin-arm64",
      root: "/runtime",
      daemon: "/runtime/kgosd",
      version: "0.2.0",
      extensions: [{ file: "extensions/lithograph.dylib", sha256 }]
    });

    const result = await diagnose(root);
    expect(result.ready).toBe(false);
    expect(result.checks.find((item) => item.id === "extensions")).toMatchObject({
      status: "error",
      blocking: true
    });
  });

  it("diagnoses legacy root-is-Instance layout without mutating it", async () => {
    const root = await mkdtemp(join(tmpdir(), "kgos-doctor-"));
    await mkdir(join(root, ".kgos", "cache"), { recursive: true });
    await writeFile(join(root, "config.toml"), encodeConfig(CONFIG));
    await writeFile(join(root, "auth.json"), '{"token":"secret"}\n');
    await writeFile(join(root, "kgos.db"), "");

    const result = await diagnose(root);
    expect(result.checks.find((item) => item.id === "legacy")).toMatchObject({
      status: "error",
      blocking: true
    });
    await expect(access(configPath(root))).rejects.toThrow();
  });

  it("formats JSON and human output without starting the daemon", async () => {
    const root = await readyInstance();
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runDoctor(root, ["--json"]);
    expect(String(write.mock.calls.at(-1)?.[0])).toContain('"ready":true');
    write.mockClear();

    await runDoctor(root, ["--json", "--pretty"]);
    expect(String(write.mock.calls.at(-1)?.[0])).toContain('\n  "ready"');
    write.mockClear();

    await runDoctor(root, []);
    const output = write.mock.calls.map((call) => String(call[0])).join("");
    expect(output).toContain("Workspace:");
    expect(output).toContain("Instance:");
    expect(output).toContain("ready");
    await expect(runDoctor(root, ["--pretty"])).rejects.toMatchObject({ exitCode: 2 });
  });
});

async function readyInstance(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "kgos-doctor-"));
  const instance = join(root, ".kgos");
  await mkdir(join(instance, "extensions"), { recursive: true });
  await writeFile(configPath(root), encodeConfig(CONFIG));
  await writeFile(join(instance, "auth.json"), '{"token":"secret"}\n');
  await writeFile(join(instance, "kgos.db"), "");
  await writeFile(join(instance, "initialized.json"), '{"version":1}\n');
  return root;
}
