import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({
  initializeClient: vi.fn(),
  resolveNativeRuntime: vi.fn()
}));

vi.mock("../runtime.js", () => runtimeMocks);

import { configPath, encodeConfig, type InstanceConfig } from "../config.js";
import { CLIError } from "../errors.js";
import { runInit } from "./init.js";

const FULL_ARGS = [
  "--cache-path",
  "cache/openai-compatible.db",
  "--cache-max-size-mb",
  "4096",
  "--fulltext-analyzer",
  "unicode61",
  "--embedding-base-url",
  "https://example.test/v1",
  "--embedding-model",
  "fixture",
  "--embedding-dimensions",
  "3",
  "--embedding-similarity",
  "cosine",
  "--embedding-api-key-env",
  "",
  "--no-additional-extensions"
] as const;

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
    version: "0.1.1",
    extensions: []
  });
  runtimeMocks.initializeClient.mockImplementation(async (root: string) => {
    const instance = join(root, ".kgos");
    await mkdir(instance, { recursive: true });
    await writeFile(join(instance, "auth.json"), '{"token":"secret"}\n');
    await writeFile(join(instance, "kgos.db"), "");
    return {};
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  runtimeMocks.initializeClient.mockReset();
  runtimeMocks.resolveNativeRuntime.mockReset();
});

describe("kg init", () => {
  it("completes first initialization under .kgos before reporting success", async () => {
    const parent = await mkdtemp(join(tmpdir(), "kgos-init-"));
    const root = join(parent, "workspace");
    const instance = join(root, ".kgos");
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runInit(root, FULL_ARGS);

    expect(await readFile(configPath(root), "utf8")).toContain("[embedding]");
    for (const path of [
      join(instance, "cache"),
      join(instance, "extensions"),
      join(instance, "logs"),
      join(instance, "auth.json"),
      join(instance, "kgos.db"),
      join(instance, "initialized.json")
    ]) {
      await expect(access(path)).resolves.toBeUndefined();
    }
    expect(runtimeMocks.initializeClient).toHaveBeenCalledWith(
      root,
      expect.objectContaining({ daemon: "/runtime/kgosd" })
    );
    expect(JSON.parse(String(write.mock.calls.at(-1)?.[0]))).toEqual({
      status: "initialized",
      root,
      instance
    });
  });

  it("resumes a published config and only returns already_initialized after completion", async () => {
    const root = await mkdtemp(join(tmpdir(), "kgos-init-"));
    const instance = join(root, ".kgos");
    await mkdir(instance);
    await writeFile(configPath(root), encodeConfig(CONFIG));
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runInit(root, []);
    expect(parseInitOutput(write.mock.calls.at(-1)?.[0]).status).toBe("initialized");
    await expect(access(join(instance, "initialized.json"))).resolves.toBeUndefined();

    write.mockClear();
    await runInit(root, []);
    expect(parseInitOutput(write.mock.calls.at(-1)?.[0]).status).toBe("already_initialized");
    await expect(runInit(root, ["--cache-path", "other"])).rejects.toBeInstanceOf(CLIError);
    await expect(runInit(root, ["--no-additional-extensions"])).rejects.toBeInstanceOf(CLIError);
  });

  it("reports stable config keys for every unresolved non-interactive setting", async () => {
    const root = join(await mkdtemp(join(tmpdir(), "kgos-init-")), "workspace");
    const error = await runInit(root, []).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: "INIT_CONFIGURATION_INCOMPLETE",
      exitCode: 2
    });
    expect((error as CLIError).details?.["missing"]).toEqual([
      "cache.max_size_mb",
      "cache.path",
      "embedding.api_key_env",
      "embedding.base_url",
      "embedding.dimensions",
      "embedding.model",
      "embedding.similarity",
      "sqlite.extensions"
    ]);
  });

  it("accepts pretty for zero-prompt JSON init", async () => {
    const root = join(await mkdtemp(join(tmpdir(), "kgos-init-")), "workspace");
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInit(root, [...FULL_ARGS, "--pretty"]);
    const output = String(write.mock.calls.at(-1)?.[0]);
    expect(output).toContain('\n  "status"');
    expect(JSON.parse(output)).toEqual({
      status: "initialized",
      root,
      instance: join(root, ".kgos")
    });
  });

  it("defaults new Instances to Jieba and preserves an explicit analyzer override", async () => {
    const parent = await mkdtemp(join(tmpdir(), "kgos-init-"));
    const defaultRoot = join(parent, "default");
    const overrideRoot = join(parent, "override");
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const withoutAnalyzer = [...FULL_ARGS];
    withoutAnalyzer.splice(withoutAnalyzer.indexOf("--fulltext-analyzer"), 2);

    await runInit(defaultRoot, withoutAnalyzer);
    expect(await readFile(configPath(defaultRoot), "utf8")).toContain('analyzer = "jieba"');

    await runInit(overrideRoot, FULL_ARGS);
    expect(await readFile(configPath(overrideRoot), "utf8")).toContain('analyzer = "unicode61"');
    await runInit(overrideRoot, []);
    expect(await readFile(configPath(overrideRoot), "utf8")).toContain('analyzer = "unicode61"');
  });

  it("keeps a fully parameterized TTY invocation zero-prompt", async () => {
    const root = join(await mkdtemp(join(tmpdir(), "kgos-init-")), "tty-default");
    const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const args = [...FULL_ARGS];
      args.splice(args.indexOf("--fulltext-analyzer"), 2);
      await runInit(root, args);
      expect(write.mock.calls).toHaveLength(1);
      expect(String(write.mock.calls[0]?.[0])).toContain('"status":"initialized"');
      expect(await readFile(configPath(root), "utf8")).toContain('analyzer = "jieba"');
    } finally {
      if (stdinTTY === undefined) Reflect.deleteProperty(process.stdin, "isTTY");
      else Object.defineProperty(process.stdin, "isTTY", stdinTTY);
      if (stdoutTTY === undefined) Reflect.deleteProperty(process.stdout, "isTTY");
      else Object.defineProperty(process.stdout, "isTTY", stdoutTTY);
    }
  });

  it("loads caller extensions from JSON and rejects legacy root-is-Instance layout", async () => {
    const parent = await mkdtemp(join(tmpdir(), "kgos-init-"));
    const root = join(parent, "workspace");
    const extension = join(parent, "custom.dylib");
    const extensionsFile = join(parent, "extensions.json");
    await writeFile(extension, "fixture");
    await writeFile(
      extensionsFile,
      JSON.stringify([{ source: extension, entrypoint: "sqlite3_custom_init" }])
    );
    const args: string[] = [...FULL_ARGS];
    args.splice(args.indexOf("--no-additional-extensions"), 1);
    args.push("--extensions-file", extensionsFile);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runInit(root, args);
    expect(await readFile(configPath(root), "utf8")).toContain("sqlite3_custom_init");

    const legacy = join(parent, "legacy");
    await mkdir(legacy);
    await mkdir(join(legacy, ".kgos", "cache"), { recursive: true });
    await writeFile(join(legacy, "config.toml"), encodeConfig(CONFIG));
    await writeFile(join(legacy, "auth.json"), '{"token":"secret"}\n');
    await writeFile(join(legacy, "kgos.db"), "");
    const legacyError = await runInit(legacy, FULL_ARGS).catch((caught: unknown) => caught);
    expect(legacyError).toBeInstanceOf(CLIError);
    expect((legacyError as CLIError).code).toBe("INVALID_ARGUMENT");
    expect((legacyError as CLIError).message).toContain("legacy");
    await expect(access(configPath(legacy))).rejects.toThrow();
  });

  it("validates required credential environment before publishing config", async () => {
    const root = join(await mkdtemp(join(tmpdir(), "kgos-init-")), "workspace");
    const args: string[] = [...FULL_ARGS];
    const index = args.indexOf("--embedding-api-key-env");
    args[index + 1] = "MISSING_INIT_KEY";
    await expect(runInit(root, args)).rejects.toMatchObject({ code: "IO_ERROR" });
    await expect(access(configPath(root))).rejects.toThrow();
  });
});

function parseInitOutput(value: unknown): { status: string } {
  const parsed = JSON.parse(String(value)) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("invalid init output");
  }
  const status = (parsed as Record<string, unknown>)["status"];
  if (typeof status !== "string") throw new Error("invalid init output");
  return { status };
}
