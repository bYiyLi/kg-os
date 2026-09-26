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
    expect((error as CLIError).details?.["missing"]).toHaveLength(7);
    expect((error as CLIError).details?.["missing"]).not.toContain("--fulltext-analyzer");
  });

  it("accepts pretty for non-interactive JSON init", async () => {
    const parent = await mkdtemp(join(tmpdir(), "kgos-init-"));
    const root = join(parent, "instance");
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInit(root, [...FULL_ARGS, "--pretty"]);
    const output = String(write.mock.calls.at(-1)?.[0]);
    expect(output).toContain('\n  "status"');
    expect(JSON.parse(output)).toEqual({ status: "initialized", root });
  });

  it("defaults new Instances to Jieba and preserves an explicit analyzer override", async () => {
    const parent = await mkdtemp(join(tmpdir(), "kgos-init-"));
    const defaultRoot = join(parent, "default");
    const overrideRoot = join(parent, "override");
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const withoutAnalyzer = [...FULL_ARGS];
    withoutAnalyzer.splice(withoutAnalyzer.indexOf("--fulltext-analyzer"), 2);
    await runInit(defaultRoot, withoutAnalyzer);
    expect(await readFile(join(defaultRoot, "config.toml"), "utf8")).toContain(
      'analyzer = "jieba"'
    );
    await runInit(overrideRoot, FULL_ARGS);
    expect(await readFile(join(overrideRoot, "config.toml"), "utf8")).toContain(
      'analyzer = "unicode61"'
    );
    await runInit(overrideRoot, []);
    expect(await readFile(join(overrideRoot, "config.toml"), "utf8")).toContain(
      'analyzer = "unicode61"'
    );
  });

  it("does not prompt for the default analyzer on a TTY", async () => {
    const parent = await mkdtemp(join(tmpdir(), "kgos-init-"));
    const root = join(parent, "tty-default");
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
      expect(await readFile(join(root, "config.toml"), "utf8")).toContain('analyzer = "jieba"');
    } finally {
      if (stdinTTY === undefined) Reflect.deleteProperty(process.stdin, "isTTY");
      else Object.defineProperty(process.stdin, "isTTY", stdinTTY);
      if (stdoutTTY === undefined) Reflect.deleteProperty(process.stdout, "isTTY");
      else Object.defineProperty(process.stdout, "isTTY", stdoutTTY);
    }
  });
});
