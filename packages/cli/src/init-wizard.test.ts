import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readlineMocks = vi.hoisted(() => ({
  createInterface: vi.fn(),
  question: vi.fn(),
  close: vi.fn()
}));

vi.mock("node:readline/promises", () => ({
  createInterface: readlineMocks.createInterface
}));

import { initWizardSuccessMessage, runInitWizard, type InitWizardOptions } from "./init-wizard.js";

const RUNTIME = {
  name: "@kgos/runtime-darwin-arm64",
  root: "/runtime",
  daemon: "/runtime/kgosd",
  version: "0.2.0",
  extensions: []
};

beforeEach(() => {
  readlineMocks.createInterface.mockReturnValue({
    question: readlineMocks.question,
    close: readlineMocks.close
  });
  readlineMocks.question.mockReset();
  readlineMocks.close.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  readlineMocks.createInterface.mockReset();
});

describe("init wizard", () => {
  it("distinguishes Instance auth readiness from the late-bound Provider credential", () => {
    vi.stubEnv("LC_ALL", "en_US.UTF-8");
    const message = initWizardSuccessMessage("/tmp/phase13-wizard");
    expect(message).toContain("Instance auth");
    expect(message).not.toContain("Extensions / Credential /");
  });

  it("retries recoverable scalar, yes/no, and custom extension input in place", async () => {
    vi.stubEnv("LC_ALL", "en_US.UTF-8");
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const options = baseOptions();
    readlineMocks.question
      .mockResolvedValueOnce("kgos.db")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("0")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("maybe")
      .mockResolvedValueOnce("yes")
      .mockResolvedValueOnce("relative-extension.zip")
      .mockResolvedValueOnce("/tmp/custom-extension.zip")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("sqlite3_custom_init")
      .mockResolvedValueOnce("../unsafe.dylib")
      .mockResolvedValueOnce("lib/custom.dylib")
      .mockResolvedValueOnce("no")
      .mockResolvedValueOnce("ftp://example.test/v1")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("0")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("dot")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce(" ")
      .mockResolvedValueOnce('""')
      .mockResolvedValueOnce("yes");

    const extensions = await runInitWizard(options);

    expect(extensions).toEqual([
      {
        source: "/tmp/custom-extension.zip",
        entrypoint: "sqlite3_custom_init",
        library: "lib/custom.dylib"
      }
    ]);
    expect(options.values.get("--cache-path")).toBe("cache/openai-compatible.db");
    expect(options.values.get("--cache-max-size-mb")).toBe("4096");
    expect(options.values.get("--embedding-api-key-env")).toBe("");
    const output = write.mock.calls.map((call) => String(call[0])).join("");
    expect(output).toContain("Custom SQLite extensions");
    expect(output).toContain(
      "Lithograph, the OpenAI-compatible Provider, and Jieba are provided automatically by the Runtime."
    );
    const prompts = readlineMocks.question.mock.calls.map((call) => String(call[0]));
    expect(prompts).toContain("  Path [cache/openai-compatible.db]: ");
    expect(prompts).toContain("  API key environment variable [OPENAI_API_KEY]: ");
    expect(output).toContain("Invalid input:");
    expect(output).toContain("Credential env name: no authentication");
    expect(output).toContain("/tmp/custom-extension.zip");
    expect(readlineMocks.close).toHaveBeenCalledOnce();
  });

  it("asks remote-only SHA-256 without asking for an archive library", async () => {
    vi.stubEnv("LC_ALL", "en_US.UTF-8");
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const options = completeOptions();
    const validSHA = "a".repeat(64);
    readlineMocks.question
      .mockResolvedValueOnce("yes")
      .mockResolvedValueOnce("https://example.test/custom.dylib")
      .mockResolvedValueOnce("sqlite3_custom_init")
      .mockResolvedValueOnce("bad")
      .mockResolvedValueOnce(validSHA)
      .mockResolvedValueOnce("no")
      .mockResolvedValueOnce("yes");

    const extensions = await runInitWizard(options);

    expect(extensions).toEqual([
      {
        source: "https://example.test/custom.dylib",
        entrypoint: "sqlite3_custom_init",
        sha256: validSHA
      }
    ]);
    const prompts = readlineMocks.question.mock.calls.map((call) => String(call[0]));
    expect(prompts.some((prompt) => prompt.includes("SHA-256"))).toBe(true);
    expect(prompts.some((prompt) => prompt.includes("Library"))).toBe(false);
  });

  it("keeps the Chinese custom-extension and review semantics aligned", async () => {
    vi.stubEnv("LC_ALL", "zh_CN.UTF-8");
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const options = completeOptions();
    readlineMocks.question.mockResolvedValueOnce("no").mockResolvedValueOnce("yes");

    await runInitWizard(options);

    const output = write.mock.calls.map((call) => String(call[0])).join("");
    const prompts = readlineMocks.question.mock.calls.map((call) => String(call[0]));
    expect(output).toContain("自定义 SQLite 扩展");
    expect(output).toContain(
      "Lithograph、OpenAI-compatible Provider 与 Jieba 已由 Runtime 自动提供。"
    );
    expect(
      prompts.some((prompt) => prompt.startsWith("添加额外的第三方/自定义 SQLite 扩展？"))
    ).toBe(true);
    expect(output).toContain("凭证环境变量名: OPENAI_API_KEY");
  });
});

function baseOptions(): InitWizardOptions {
  return {
    root: "/tmp/phase13-wizard",
    values: new Map([["--fulltext-analyzer", "jieba"]]),
    initialExtensions: [],
    extensionsResolved: false,
    runtime: RUNTIME
  };
}

function completeOptions(): InitWizardOptions {
  return {
    ...baseOptions(),
    values: new Map([
      ["--cache-path", "cache/openai-compatible.db"],
      ["--cache-max-size-mb", "4096"],
      ["--fulltext-analyzer", "jieba"],
      ["--embedding-base-url", "https://api.openai.com/v1"],
      ["--embedding-model", "text-embedding-3-small"],
      ["--embedding-dimensions", "1536"],
      ["--embedding-similarity", "cosine"],
      ["--embedding-api-key-env", "OPENAI_API_KEY"]
    ])
  };
}
