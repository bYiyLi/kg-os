import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseMCPOptions } from "./config.js";
import { diagnoseMCP } from "./doctor.js";

const native = vi.hoisted(() => ({
  complete: vi.fn(),
  locator: vi.fn(),
  reachable: vi.fn(),
  token: vi.fn(),
  runtime: vi.fn()
}));

vi.mock("@kgos/cli/connection", () => ({
  isInitializationComplete: native.complete,
  readLocator: native.locator,
  endpointReachable: native.reachable,
  readToken: native.token,
  resolveNativeRuntime: native.runtime
}));

function config(extra: string[] = []) {
  const parsed = parseMCPOptions(["doctor", "--root", "/test-workspace", ...extra]);
  if (parsed.action !== "run") throw new Error("Expected parsed doctor configuration");
  return parsed.config;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("KGOS_MCP_TOKEN", "z".repeat(64));
  native.complete.mockResolvedValue(true);
  native.locator.mockResolvedValue({
    endpoint: "http://127.0.0.1:4100",
    pid: 123,
    version: "0.2.1"
  });
  native.reachable.mockResolvedValue(true);
  native.token.mockResolvedValue("local-daemon-token");
  native.runtime.mockResolvedValue({ version: "0.2.1" });
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ state: "commit/a", defaultBranch: "main" })))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Phase 15 read-only deployment diagnostics", () => {
  it("recognizes ready local components without claiming ChatGPT connectivity", async () => {
    const report = await diagnoseMCP(config());
    expect(report.ready).toBe(true);
    expect(report.checks.config.status).toBe("ready");
    expect(report.checks.instance.status).toBe("ready");
    expect(report.checks.runtime.status).toBe("ready");
    expect(report.checks.mcp.status).toBe("ready");
    expect(report.checks.remote.status).toBe("unverified");
    expect(native.runtime).toHaveBeenCalledOnce();
    expect(native.token).toHaveBeenCalledOnce();
    expect(native.locator).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(["uninitialized", "no-locator", "unreachable", "invalid-auth", "unresponsive-daemon"])(
    "reports unavailable Instance without a mutating recovery: %s",
    async (cause) => {
      switch (cause) {
        case "uninitialized":
          native.complete.mockResolvedValue(false);
          break;
        case "no-locator":
          native.locator.mockResolvedValue(undefined);
          break;
        case "unreachable":
          native.reachable.mockResolvedValue(false);
          break;
        case "invalid-auth":
          native.token.mockRejectedValue(new Error("No credential"));
          break;
        case "unresponsive-daemon":
          vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")));
          break;
      }
      const report = await diagnoseMCP(config());
      expect(report.ready).toBe(false);
      expect(report.checks.instance.status).toBe("unavailable");
      expect(report.checks.runtime.status).toBe("ready");
      expect(report.checks.mcp.status).toBe("ready");
    }
  );

  it("distinguishes missing native Runtime and missing external MCP credential", async () => {
    native.runtime.mockRejectedValue(new Error("package missing"));
    vi.stubEnv("KGOS_MCP_TOKEN", "");
    const report = await diagnoseMCP(config());
    expect(report.ready).toBe(false);
    expect(report.checks.runtime.status).toBe("unavailable");
    expect(report.checks.mcp.status).toBe("unavailable");
    expect(report.checks.instance.status).toBe("ready");
  });

  it("validates a configured TLS file pair without opening a public network listener", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kgos-mcp-tls-doctor-"));
    const cert = join(directory, "cert.pem");
    const key = join(directory, "key.pem");
    try {
      await writeFile(cert, "placeholder certificate for file access test");
      await writeFile(key, "placeholder private key for file access test");
      const ok = await diagnoseMCP(config(["--tls-cert", cert, "--tls-key", key]));
      expect(ok.checks.mcp.status).toBe("ready");
      await rm(key);
      const missing = await diagnoseMCP(config(["--tls-cert", cert, "--tls-key", key]));
      expect(missing.checks.mcp.status).toBe("unavailable");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
