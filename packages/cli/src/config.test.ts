import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  encodeConfig,
  loadConfig,
  parentWritable,
  parseConfig,
  validateRequiredEnvironment,
  validateRootShape,
  type InstanceConfig
} from "./config.js";
import { CLIError } from "./errors.js";

const BASE: InstanceConfig = {
  cache: { path: "cache/openai-compatible.db", max_size_mb: 4096 },
  fulltext: { analyzer: "unicode61" },
  embedding: {
    base_url: "https://example.test/v1/",
    model: "fixture",
    dimensions: 3,
    similarity: "cosine",
    api_key_env: ""
  }
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Instance config", () => {
  it("round-trips and normalizes the complete explicit config", async () => {
    const root = await mkdtemp(join(tmpdir(), "kgos-config-"));
    const parsed = parseConfig(root, encodeConfig(BASE));
    expect(parsed.cache.path).toBe(join(root, "cache/openai-compatible.db"));
    expect(parsed.embedding.base_url).toBe("https://example.test/v1");
    await writeFile(join(root, "config.toml"), encodeConfig(BASE));
    await expect(loadConfig(root)).resolves.toMatchObject({
      fulltext: { analyzer: "unicode61" }
    });
  });

  it("accepts a caller extension but rejects official and malformed extensions", async () => {
    const root = await mkdtemp(join(tmpdir(), "kgos-config-"));
    const extension = join(root, "custom.dylib");
    const valid = {
      ...BASE,
      sqlite: { extensions: [{ source: extension, entrypoint: "sqlite3_custom_init" }] }
    };
    expect(parseConfig(root, encodeConfig(valid)).sqlite?.extensions).toHaveLength(1);

    const official = {
      ...BASE,
      sqlite: { extensions: [{ source: extension, entrypoint: "sqlite3_lithograph_init" }] }
    };
    expect(() => parseConfig(root, encodeConfig(official))).toThrow(CLIError);

    const remote = {
      ...BASE,
      sqlite: { extensions: [{ source: "https://example.test/plugin.zip", entrypoint: "x" }] }
    };
    expect(() => parseConfig(root, encodeConfig(remote))).toThrow(CLIError);
  });

  it("rejects incomplete, unknown, and invalid configuration", async () => {
    const root = await mkdtemp(join(tmpdir(), "kgos-config-"));
    expect(() => parseConfig(root, "[cache]\npath='x'\n")).toThrow(CLIError);
    expect(() => parseConfig(root, encodeConfig({ ...BASE, extra: true } as never))).toThrow(
      CLIError
    );
    expect(() =>
      parseConfig(root, encodeConfig({ ...BASE, cache: { path: "kgos.db", max_size_mb: 1 } }))
    ).toThrow(CLIError);
    expect(() =>
      parseConfig(
        root,
        encodeConfig({
          ...BASE,
          embedding: { ...BASE.embedding, base_url: "file:///tmp/x" }
        })
      )
    ).toThrow(CLIError);
  });

  it("validates the configured credential environment", () => {
    const config = { ...BASE, embedding: { ...BASE.embedding, api_key_env: "FIXTURE_KEY" } };
    expect(() => {
      validateRequiredEnvironment(config);
    }).toThrow(CLIError);
    vi.stubEnv("FIXTURE_KEY", "secret");
    expect(() => {
      validateRequiredEnvironment(config);
    }).not.toThrow();
    expect(() => {
      validateRequiredEnvironment(BASE);
    }).not.toThrow();
  });

  it("classifies root shape and writable parents", async () => {
    const root = await mkdtemp(join(tmpdir(), "kgos-root-"));
    const file = join(root, "file");
    await writeFile(file, "x");
    await expect(validateRootShape(root)).resolves.toBe("directory");
    await expect(validateRootShape(join(root, "missing"))).resolves.toBe("missing");
    await expect(validateRootShape(file)).rejects.toBeInstanceOf(CLIError);
    await expect(parentWritable(join(root, "a", "b", "c"))).resolves.toBe(true);
  });
});
