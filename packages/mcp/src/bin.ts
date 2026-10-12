#!/usr/bin/env node
import type { AddressInfo } from "node:net";

import { ensureClient } from "@kgos/cli/connection";
import { KGOS_VERSION } from "@kgos/sdk";

import { readMCPToken } from "./auth.js";
import { parseMCPOptions, type MCPConfiguration } from "./config.js";
import { diagnoseMCP } from "./doctor.js";
import { startMCPServer } from "./server.js";

const HELP = [
  "Usage: kgos-mcp <serve|doctor> [options]",
  "       kgos-mcp --help | --version",
  "",
  "Commands:",
  "  serve    Start an authenticated Streamable HTTP MCP service",
  "  doctor   Read-only check of Instance, runtime, credentials and local settings",
  "",
  "Common: --root <workspace> (or KGOS_ROOT); defaults never pick cwd",
  "See 'kgos-mcp serve --help' for networking, TLS, auth and resource options."
].join("\n");

const HELP_OPTIONS = [
  "Instance:  --root <path>                       KGOS_ROOT",
  "Network:   --host <IP> --port <0..65535> --path </mcp>",
  "           KGOS_MCP_HOST / KGOS_MCP_PORT / KGOS_MCP_PATH",
  "Auth:      --token-env <ENV_NAME> | --token-file <file>",
  "           KGOS_MCP_TOKEN_ENV / KGOS_MCP_TOKEN_FILE; default env KGOS_MCP_TOKEN",
  "OAuth:     --oauth-issuer <public HTTPS origin> (optional; ChatGPT OAuth)",
  "           KGOS_MCP_OAUTH_ISSUER",
  "TLS:       --tls-cert <path> --tls-key <path> (both required for HTTPS)",
  "           KGOS_MCP_TLS_CERT / KGOS_MCP_TLS_KEY",
  "Lifecycle: --startup-timeout-ms <n> --shutdown-timeout-ms <n>",
  "HTTP:      --request-timeout-ms <n> --max-concurrency <n> --max-request-bytes <n>",
  "Sandbox:   --script-timeout-ms <n> --script-memory-mb <n>",
  "           --script-max-code-bytes <n> --script-max-calls <n>",
  "           --script-max-streams <n> --script-max-output-bytes <n>",
  "Preview:   --preview-max-items <n> --preview-cache-entries <n>",
  "           --preview-cache-ttl-ms <n>",
  "Logging:   --log-level <error|warn|info|debug> --log-format <text|json>",
  "",
  "Except --root, options also accept KGOS_MCP_<UPPER_SNAKE_NAME>.",
  "Priority: CLI > environment > defaults. Invalid and empty values fail."
].join("\n");

function log(config: MCPConfiguration, message: string): void {
  const line = config.logFormat === "json" ? JSON.stringify({ level: "info", message }) : message;
  process.stdout.write(line + "\n");
}

async function serve(config: MCPConfiguration): Promise<void> {
  const token = await readMCPToken(config.tokenSource);
  const getClient = () => ensureClient(config.root, undefined, config.startupTimeoutMs);
  await getClient();
  const server = await startMCPServer({
    token,
    ...(config.oauthIssuer === undefined ? {} : { oauthIssuer: config.oauthIssuer }),
    port: config.port,
    host: config.host,
    path: config.path,
    getClient,
    requestTimeoutMs: config.requestTimeoutMs,
    maxConcurrency: config.maxConcurrency,
    maxRequestBytes: config.maxRequestBytes,
    sandbox: config.sandbox,
    preview: config.preview,
    ...(config.tls === undefined ? {} : { tls: config.tls })
  });
  const address = server.address() as AddressInfo | null;
  if (address === null) throw new Error("MCP listener could not start");
  const host = config.host.includes(":") ? "[" + config.host + "]" : config.host;
  log(
    config,
    (config.tls === undefined ? "http" : "https") +
      "://" +
      host +
      ":" +
      String(address.port) +
      config.path
  );
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close();
    const timeout = setTimeout(() => {
      server.closeAllConnections();
    }, config.shutdownTimeoutMs);
    server.once("close", () => {
      clearTimeout(timeout);
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

async function doctor(config: MCPConfiguration): Promise<void> {
  const report = await diagnoseMCP(config);
  if (config.json) {
    process.stdout.write(JSON.stringify(report) + "\n");
  } else {
    for (const [name, check] of Object.entries(report.checks)) {
      process.stdout.write(name + ": " + check.status + " — " + check.message + "\n");
    }
    process.stdout.write("Local readiness: " + (report.ready ? "ready" : "unavailable") + "\n");
  }
  if (!report.ready) process.exitCode = 1;
}

try {
  const action = parseMCPOptions(process.argv.slice(2));
  if (action.action === "help") {
    process.stdout.write(HELP + (action.command === undefined ? "" : "\n\n" + HELP_OPTIONS) + "\n");
  } else if (action.action === "version") {
    process.stdout.write(KGOS_VERSION + "\n");
  } else if (action.config.command === "doctor") {
    await doctor(action.config);
  } else {
    await serve(action.config);
  }
} catch {
  process.stderr.write(
    "KG OS MCP startup or configuration failed. Check command options, Instance readiness, credentials and TLS.\n"
  );
  process.exitCode = 1;
}
