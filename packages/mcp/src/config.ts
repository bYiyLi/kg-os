import { isIP } from "node:net";
import { resolve } from "node:path";

import type { SandboxLimits } from "./sandbox.js";
import { validateOAuthIssuer } from "./oauth.js";

type Command = "serve" | "doctor";
type Env = Record<string, string | undefined>;

interface Field {
  env: string;
  default?: string;
}

const FIELDS: Record<string, Field> = {
  root: { env: "KGOS_ROOT" },
  host: { env: "KGOS_MCP_HOST", default: "127.0.0.1" },
  port: { env: "KGOS_MCP_PORT", default: "3777" },
  path: { env: "KGOS_MCP_PATH", default: "/mcp" },
  "token-env": { env: "KGOS_MCP_TOKEN_ENV" },
  "token-file": { env: "KGOS_MCP_TOKEN_FILE" },
  "oauth-issuer": { env: "KGOS_MCP_OAUTH_ISSUER" },
  "tls-cert": { env: "KGOS_MCP_TLS_CERT" },
  "tls-key": { env: "KGOS_MCP_TLS_KEY" },
  "startup-timeout-ms": { env: "KGOS_MCP_STARTUP_TIMEOUT_MS", default: "10000" },
  "shutdown-timeout-ms": { env: "KGOS_MCP_SHUTDOWN_TIMEOUT_MS", default: "10000" },
  "request-timeout-ms": { env: "KGOS_MCP_REQUEST_TIMEOUT_MS", default: "30000" },
  "max-concurrency": { env: "KGOS_MCP_MAX_CONCURRENCY", default: "16" },
  "max-request-bytes": { env: "KGOS_MCP_MAX_REQUEST_BYTES", default: "1048576" },
  "script-timeout-ms": { env: "KGOS_MCP_SCRIPT_TIMEOUT_MS", default: "15000" },
  "script-memory-mb": { env: "KGOS_MCP_SCRIPT_MEMORY_MB", default: "64" },
  "script-max-code-bytes": { env: "KGOS_MCP_SCRIPT_MAX_CODE_BYTES", default: "65536" },
  "script-max-calls": { env: "KGOS_MCP_SCRIPT_MAX_CALLS", default: "2048" },
  "script-max-streams": { env: "KGOS_MCP_SCRIPT_MAX_STREAMS", default: "32" },
  "script-max-output-bytes": { env: "KGOS_MCP_SCRIPT_MAX_OUTPUT_BYTES", default: "4194304" },
  "preview-max-items": { env: "KGOS_MCP_PREVIEW_MAX_ITEMS", default: "50000" },
  "preview-cache-entries": { env: "KGOS_MCP_PREVIEW_CACHE_ENTRIES", default: "8" },
  "preview-cache-ttl-ms": { env: "KGOS_MCP_PREVIEW_CACHE_TTL_MS", default: "600000" },
  "log-level": { env: "KGOS_MCP_LOG_LEVEL", default: "info" },
  "log-format": { env: "KGOS_MCP_LOG_FORMAT", default: "text" }
};

const RANGES: Record<string, readonly [number, number]> = {
  port: [0, 65535],
  "startup-timeout-ms": [100, 120_000],
  "shutdown-timeout-ms": [100, 120_000],
  "request-timeout-ms": [100, 120_000],
  "max-concurrency": [1, 1024],
  "max-request-bytes": [1024, 16_777_216],
  "script-timeout-ms": [100, 120_000],
  "script-memory-mb": [8, 1024],
  "script-max-code-bytes": [1024, 1_048_576],
  "script-max-calls": [1, 65_536],
  "script-max-streams": [1, 128],
  "script-max-output-bytes": [1024, 16_777_216],
  "preview-max-items": [1, 1_000_000],
  "preview-cache-entries": [1, 64],
  "preview-cache-ttl-ms": [1000, 86_400_000]
};

export interface MCPConfiguration {
  command: Command;
  json: boolean;
  root: string;
  host: string;
  port: number;
  path: string;
  tokenSource: { kind: "env"; name: string } | { kind: "file"; path: string };
  oauthIssuer?: string;
  tls?: { cert: string; key: string };
  startupTimeoutMs: number;
  shutdownTimeoutMs: number;
  requestTimeoutMs: number;
  maxConcurrency: number;
  maxRequestBytes: number;
  sandbox: SandboxLimits;
  preview: { maxItems: number; entries: number; ttlMs: number };
  logLevel: "error" | "warn" | "info" | "debug";
  logFormat: "text" | "json";
}

export type MCPCLIAction =
  | { action: "help"; command?: Command }
  | { action: "version" }
  | { action: "run"; config: MCPConfiguration };

function parseFlags(argv: string[]): {
  command: Command;
  json: boolean;
  fields: Record<string, string>;
} {
  const command = argv[0];
  if (command !== "serve" && command !== "doctor") {
    throw new Error("Expected 'serve' or 'doctor'; use --help");
  }
  const fields: Record<string, string> = {};
  let json = false;
  for (let index = 1; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === "--json" && command === "doctor" && !json) {
      json = true;
      continue;
    }
    if (flag === undefined || !flag.startsWith("--") || !Object.hasOwn(FIELDS, flag.slice(2))) {
      throw new Error("Unknown MCP option: " + String(flag));
    }
    const name = flag.slice(2);
    const value = argv[++index];
    if (
      value === undefined ||
      value.startsWith("--") ||
      value.length === 0 ||
      Object.hasOwn(fields, name)
    ) {
      throw new Error("Missing, empty or repeated MCP option: " + flag);
    }
    fields[name] = value;
  }
  return { command, json, fields };
}

function getValue(name: string, flags: Record<string, string>, env: Env): string {
  const field = FIELDS[name];
  if (field === undefined) throw new Error("Unknown MCP option");
  const value = flags[name] ?? env[field.env] ?? field.default;
  if (value === undefined || value.length === 0)
    throw new Error("Missing or empty MCP option: " + name);
  return value;
}

function optionalValue(name: string, flags: Record<string, string>, env: Env): string | undefined {
  const field = FIELDS[name];
  if (field === undefined) throw new Error("Unknown MCP option");
  const value = flags[name] ?? env[field.env];
  if (value === "") throw new Error("Empty MCP option: " + name);
  return value;
}

function numberValue(name: string, flags: Record<string, string>, env: Env): number {
  const raw = getValue(name, flags, env);
  const range = RANGES[name];
  if (range === undefined || !/^\d+$/.test(raw)) throw new Error("Invalid MCP integer: " + name);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < range[0] || value > range[1]) {
    throw new Error("MCP integer out of range: " + name);
  }
  return value;
}

function tokenSource(flags: Record<string, string>, env: Env): MCPConfiguration["tokenSource"] {
  if (flags["token-file"] !== undefined && flags["token-env"] !== undefined) {
    throw new Error("Choose either --token-file or --token-env");
  }
  const usingFlag = flags["token-file"] !== undefined || flags["token-env"] !== undefined;
  const file = usingFlag ? flags["token-file"] : optionalValue("token-file", flags, env);
  const name = usingFlag ? flags["token-env"] : optionalValue("token-env", flags, env);
  if (file !== undefined && name !== undefined) throw new Error("Choose one MCP token source");
  if (file !== undefined) return { kind: "file", path: resolve(file) };
  const selected = name ?? "KGOS_MCP_TOKEN";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(selected)) {
    throw new Error("Invalid MCP credential environment variable name");
  }
  return { kind: "env", name: selected };
}

function tlsPair(flags: Record<string, string>, env: Env): MCPConfiguration["tls"] {
  const cert = optionalValue("tls-cert", flags, env);
  const key = optionalValue("tls-key", flags, env);
  if ((cert === undefined) !== (key === undefined))
    throw new Error("TLS certificate and key must be provided together");
  return cert === undefined || key === undefined
    ? undefined
    : { cert: resolve(cert), key: resolve(key) };
}

function enumValue<T extends string>(
  name: string,
  flags: Record<string, string>,
  env: Env,
  allowed: readonly T[]
): T {
  const value = getValue(name, flags, env);
  if (!allowed.includes(value as T)) throw new Error("Invalid MCP option: " + name);
  return value as T;
}

export function parseMCPOptions(argv: string[], env: Env = process.env): MCPCLIAction {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === "--help")) {
    return { action: "help" };
  }
  if (argv.length === 1 && argv[0] === "--version") return { action: "version" };
  if (argv.length === 2 && argv[1] === "--help" && (argv[0] === "serve" || argv[0] === "doctor")) {
    return { action: "help", command: argv[0] };
  }
  const { command, json, fields } = parseFlags(argv);
  const root = resolve(getValue("root", fields, env));
  const host = getValue("host", fields, env);
  if (isIP(host) === 0) throw new Error("MCP host must be a concrete IP address");
  const path = getValue("path", fields, env);
  if (!/^\/(?!\/)[^?#\s]*$/.test(path)) throw new Error("Invalid MCP URL path");
  if (
    path === "/.well-known/oauth-protected-resource" ||
    path === "/.well-known/oauth-authorization-server" ||
    path === "/oauth/authorize" ||
    path === "/oauth/token"
  ) {
    throw new Error("MCP URL path collides with an OAuth endpoint");
  }
  const config: MCPConfiguration = {
    command,
    json,
    root,
    host,
    path,
    port: numberValue("port", fields, env),
    tokenSource: tokenSource(fields, env),
    startupTimeoutMs: numberValue("startup-timeout-ms", fields, env),
    shutdownTimeoutMs: numberValue("shutdown-timeout-ms", fields, env),
    requestTimeoutMs: numberValue("request-timeout-ms", fields, env),
    maxConcurrency: numberValue("max-concurrency", fields, env),
    maxRequestBytes: numberValue("max-request-bytes", fields, env),
    sandbox: {
      scriptTimeoutMs: numberValue("script-timeout-ms", fields, env),
      scriptMemoryMb: numberValue("script-memory-mb", fields, env),
      scriptMaxCodeBytes: numberValue("script-max-code-bytes", fields, env),
      scriptMaxCalls: numberValue("script-max-calls", fields, env),
      scriptMaxStreams: numberValue("script-max-streams", fields, env),
      scriptMaxOutputBytes: numberValue("script-max-output-bytes", fields, env)
    },
    preview: {
      maxItems: numberValue("preview-max-items", fields, env),
      entries: numberValue("preview-cache-entries", fields, env),
      ttlMs: numberValue("preview-cache-ttl-ms", fields, env)
    },
    logLevel: enumValue("log-level", fields, env, ["error", "warn", "info", "debug"]),
    logFormat: enumValue("log-format", fields, env, ["text", "json"])
  };
  const tls = tlsPair(fields, env);
  if (tls !== undefined) config.tls = tls;
  const issuer = optionalValue("oauth-issuer", fields, env);
  if (issuer !== undefined) config.oauthIssuer = validateOAuthIssuer(issuer);
  return { action: "run", config };
}
