import { access } from "node:fs/promises";

import {
  endpointReachable,
  isInitializationComplete,
  readLocator,
  readToken,
  resolveNativeRuntime
} from "@kgos/cli/connection";
import { KGOSClient } from "@kgos/sdk";

import { readMCPToken } from "./auth.js";
import type { MCPConfiguration } from "./config.js";

interface DoctorCheck {
  status: "ready" | "unavailable";
  message: string;
}

export interface MCPDoctorReport {
  root: string;
  ready: boolean;
  checks: {
    config: DoctorCheck;
    instance: DoctorCheck;
    runtime: DoctorCheck;
    mcp: DoctorCheck;
    remote: { status: "unverified"; message: string };
  };
}

async function instanceCheck(root: string): Promise<DoctorCheck> {
  try {
    if (!(await isInitializationComplete(root))) throw new Error("Instance is not initialized");
    const locator = await readLocator(root);
    if (locator?.endpoint === undefined || !(await endpointReachable(locator.endpoint))) {
      return { status: "unavailable", message: "Initialized Instance has no running daemon" };
    }
    const token = await readToken(root);
    const client = new KGOSClient({ endpoint: locator.endpoint, token });
    await client.evolution.overview();
    return { status: "ready", message: "Initialized Instance and authenticated daemon reachable" };
  } catch {
    return {
      status: "unavailable",
      message: "Instance configuration, daemon or authorization unavailable"
    };
  }
}

async function runtimeCheck(): Promise<DoctorCheck> {
  try {
    await resolveNativeRuntime();
    return { status: "ready", message: "Native Runtime package and required files verified" };
  } catch {
    return { status: "unavailable", message: "Native Runtime package unavailable or invalid" };
  }
}

async function mcpCheck(config: MCPConfiguration): Promise<DoctorCheck> {
  try {
    await readMCPToken(config.tokenSource);
    if (config.tls !== undefined) {
      await Promise.all([access(config.tls.cert), access(config.tls.key)]);
    }
    return {
      status: "ready",
      message: "MCP credential and local listener settings are configured"
    };
  } catch {
    return { status: "unavailable", message: "MCP credential or TLS files unavailable or invalid" };
  }
}

export async function diagnoseMCP(config: MCPConfiguration): Promise<MCPDoctorReport> {
  const [instance, runtime, mcp] = await Promise.all([
    instanceCheck(config.root),
    runtimeCheck(),
    mcpCheck(config)
  ]);
  const result: MCPDoctorReport = {
    root: config.root,
    ready: instance.status === "ready" && runtime.status === "ready" && mcp.status === "ready",
    checks: {
      config: { status: "ready", message: "MCP CLI and environment settings validated" },
      instance,
      runtime,
      mcp,
      remote: {
        status: "unverified",
        message: "Remote HTTPS/Tunnel and ChatGPT access require external verification"
      }
    }
  };
  return result;
}
