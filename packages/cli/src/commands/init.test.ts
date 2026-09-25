import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runInit } from "./init.js";
import { CLIError } from "../errors.js";

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
  ""
] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("kg init", () => {
  it("writes a complete config without creating auth/database or starting Runtime", async () => {
    const parent = await mkdtemp(join(tmpdir(), "kgos-init-"));
    const root = join(parent, "instance");
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runInit(root, FULL_ARGS);

    expect(await readFile(join(root, "config.toml"), "utf8")).toContain("[embedding]");
    await expect(access(join(root, "cache"))).resolves.toBeUndefined();
    await expect(access(join(root, "extensions"))).resolves.toBeUndefined();
    await expect(access(join(root, "logs"))).resolves.toBeUndefined();
    await expect(access(join(root, "auth.json"))).rejects.toThrow();
    await expect(access(join(root, "kgos.db"))).rejects.toThrow();
    expect(String(write.mock.calls.at(-1)?.[0])).toContain('"status":"initialized"');
  });

  it("returns already_initialized for an existing valid config", async () => {
    const parent = await mkdtemp(join(tmpdir(), "kgos-init-"));
    const root = join(parent, "instance");
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInit(root, FULL_ARGS);
    write.mockClear();

    await runInit(root, []);
    expect(String(write.mock.calls.at(-1)?.[0])).toContain('"status":"already_initialized"');
    await expect(runInit(root, ["--cache-path", "other"])).rejects.toBeInstanceOf(CLIError);
  });

  it("reports every missing field in non-interactive mode", async () => {
    const parent = await mkdtemp(join(tmpdir(), "kgos-init-"));
    const root = join(parent, "instance");
    const error = await runInit(root, []).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CLIError);
    expect(error).toMatchObject({
      code: "INIT_CONFIGURATION_INCOMPLETE",
      exitCode: 2
    });
    expect((error as CLIError).details?.["missing"]).toHaveLength(8);
  });
});
