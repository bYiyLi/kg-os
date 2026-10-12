import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readMCPToken } from "./auth.js";
import { parseMCPOptions, type MCPConfiguration } from "./config.js";

const env = {
  KGOS_ROOT: "/tmp/kgos",
  KGOS_MCP_TOKEN: "credential-is-long-enough-for-unit-testing-123"
};
const directories: string[] = [];

function config(argv: string[], overrides: Record<string, string> = {}): MCPConfiguration {
  const result = parseMCPOptions(argv, { ...env, ...overrides });
  if (result.action !== "run") throw new Error("Expected a CLI command");
  return result.config;
}

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { force: true, recursive: true });
});

describe("KG OS MCP deploy configuration", () => {
  it("supports scoped help, exact versions, and explicit command selection", () => {
    expect(parseMCPOptions([]).action).toBe("help");
    expect(parseMCPOptions(["--help"]).action).toBe("help");
    expect(parseMCPOptions(["--version"]).action).toBe("version");
    expect(parseMCPOptions(["serve", "--help"])).toEqual({ action: "help", command: "serve" });
    expect(parseMCPOptions(["doctor", "--help"])).toEqual({ action: "help", command: "doctor" });
    expect(config(["doctor", "--json"])).toMatchObject({ command: "doctor", json: true });
    expect(config(["serve"])).toMatchObject({ command: "serve", json: false });
    expect(config(["serve", "--oauth-issuer", "https://kgos.example.com/"])).toMatchObject({
      oauthIssuer: "https://kgos.example.com"
    });
  });

  it("uses CLI over environment over defaults and never guesses a Workspace", () => {
    const defaults = config(["serve"]);
    expect(defaults).toMatchObject({
      root: "/tmp/kgos",
      host: "127.0.0.1",
      port: 3777,
      path: "/mcp",
      tokenSource: { kind: "env", name: "KGOS_MCP_TOKEN" },
      maxConcurrency: 16,
      maxRequestBytes: 1_048_576,
      preview: { maxItems: 50_000, entries: 8, ttlMs: 600_000 },
      sandbox: { scriptTimeoutMs: 15_000, scriptMemoryMb: 64, scriptMaxCalls: 2048 }
    });
    expect(
      config(["serve", "--root", "/alt/root", "--port", "0"], { KGOS_MCP_PORT: "5555" })
    ).toMatchObject({ root: "/alt/root", port: 0 });
    expect(config(["serve"], { KGOS_MCP_HOST: "0.0.0.0", KGOS_MCP_PATH: "/v2/mcp" })).toMatchObject(
      { host: "0.0.0.0", path: "/v2/mcp" }
    );
    expect(() => parseMCPOptions(["serve"], {})).toThrow("root");
  });

  it("rejects unknown, empty, repeated, malformed and out-of-range options", () => {
    for (const argv of [
      ["nope"],
      ["serve", "--anything", "value"],
      ["serve", "--json"],
      ["serve", "--port"],
      ["serve", "--port", ""],
      ["serve", "--port", "1", "--port", "2"],
      ["serve", "--port", "-1"],
      ["serve", "--port", "65536"],
      ["serve", "--port", "abc"],
      ["serve", "--port", "1.5"],
      ["serve", "--host", "example.org"],
      ["serve", "--path", "mcp"],
      ["serve", "--path", "//mcp"],
      ["serve", "--path", "/mcp?token=bad"],
      ["serve", "--path", "/mcp#suffix"],
      ["serve", "--path", "/oauth/token"],
      ["serve", "--oauth-issuer", "http://kgos.example.com"],
      ["serve", "--oauth-issuer", "https://kgos.example.com/mcp"],
      ["serve", "--oauth-issuer", "https://" + "admin:secret@" + "kgos.example.com"],
      ["serve", "--log-level", "trace"],
      ["serve", "--log-format", "yaml"],
      ["serve", "--max-concurrency", "0"],
      ["serve", "--script-memory-mb", "2"],
      ["serve", "--preview-cache-ttl-ms", "0"],
      ["serve", "--tls-cert", "/tmp/cert"],
      ["serve", "--tls-key", "/tmp/key"],
      ["serve", "--token-env", "A", "--token-file", "/tmp/key"],
      ["serve", "--token-env", "a b"]
    ]) {
      expect(() => config(argv)).toThrow();
    }
    expect(() => config(["serve"], { KGOS_MCP_PORT: "" })).toThrow();
    expect(config(["serve"], { KGOS_MCP_OAUTH_ISSUER: "https://kgos.example.com" })).toMatchObject({
      oauthIssuer: "https://kgos.example.com"
    });
    expect(() =>
      config(["serve"], { KGOS_MCP_TOKEN_FILE: "/tmp/a", KGOS_MCP_TOKEN_ENV: "TOKEN" })
    ).toThrow();
  });

  it("resolves configured credential sources without revealing their values", () => {
    expect(
      config(["serve", "--token-file", "/tmp/secret"], { KGOS_MCP_TOKEN_ENV: "LOWER" })
    ).toMatchObject({ tokenSource: { kind: "file", path: "/tmp/secret" } });
    expect(
      config(["serve", "--token-env", "NEW_TOKEN"], { KGOS_MCP_TOKEN_FILE: "/tmp/ignored" })
    ).toMatchObject({ tokenSource: { kind: "env", name: "NEW_TOKEN" } });
    expect(config(["serve"], { KGOS_MCP_TOKEN_ENV: "CUSTOM" })).toMatchObject({
      tokenSource: { kind: "env", name: "CUSTOM" }
    });
    expect(config(["serve", "--tls-cert", "/tmp/cert", "--tls-key", "/tmp/key"])).toMatchObject({
      tls: { cert: "/tmp/cert", key: "/tmp/key" }
    });
  });

  it("allows explicit bounded resource settings", () => {
    expect(
      config([
        "serve",
        "--startup-timeout-ms",
        "2000",
        "--shutdown-timeout-ms",
        "3500",
        "--request-timeout-ms",
        "20000",
        "--max-concurrency",
        "3",
        "--max-request-bytes",
        "2048",
        "--script-timeout-ms",
        "600",
        "--script-memory-mb",
        "16",
        "--script-max-code-bytes",
        "1024",
        "--script-max-calls",
        "25",
        "--script-max-streams",
        "2",
        "--script-max-output-bytes",
        "2048",
        "--preview-max-items",
        "35",
        "--preview-cache-entries",
        "2",
        "--preview-cache-ttl-ms",
        "3000",
        "--log-level",
        "debug",
        "--log-format",
        "json"
      ])
    ).toMatchObject({
      startupTimeoutMs: 2000,
      shutdownTimeoutMs: 3500,
      requestTimeoutMs: 20000,
      maxConcurrency: 3,
      maxRequestBytes: 2048,
      sandbox: {
        scriptTimeoutMs: 600,
        scriptMemoryMb: 16,
        scriptMaxCodeBytes: 1024,
        scriptMaxCalls: 25,
        scriptMaxStreams: 2,
        scriptMaxOutputBytes: 2048
      },
      preview: { maxItems: 35, entries: 2, ttlMs: 3000 },
      logLevel: "debug",
      logFormat: "json"
    });
  });
});

describe("KG OS MCP Bearer sources", () => {
  it("reads only a named environment value with a valid Bearer token", async () => {
    expect(await readMCPToken({ kind: "env", name: "TOKEN" }, { TOKEN: "e".repeat(64) })).toBe(
      "e".repeat(64)
    );
    await expect(readMCPToken({ kind: "env", name: "MISSING" }, {})).rejects.toThrow();
    await expect(
      readMCPToken({ kind: "env", name: "TOKEN" }, { TOKEN: "unsafe\r\nheader" })
    ).rejects.toThrow();
  });

  it("reads protected files without trimming meaningful whitespace", async () => {
    const root = await mkdtemp(join(tmpdir(), "kgos-mcp-token-"));
    directories.push(root);
    const file = join(root, "secret");
    await writeFile(file, "x".repeat(64) + "\n", { mode: 0o600 });
    expect(await readMCPToken({ kind: "file", path: file })).toBe("x".repeat(64));
    await writeFile(file, "x".repeat(64) + " ", { mode: 0o600 });
    await expect(readMCPToken({ kind: "file", path: file })).rejects.toThrow();
  });
});
