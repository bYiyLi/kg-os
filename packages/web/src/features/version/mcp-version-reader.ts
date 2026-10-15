import type { App as McpApp } from "@modelcontextprotocol/ext-apps";
import type {
  EvolutionAncestryRequest,
  EvolutionAncestryResult,
  EvolutionGetRequest,
  EvolutionRefListResult,
  RequestOptions
} from "@kgos/sdk";

import { McpReadError, readMcpResult } from "../../core/client/mcp-read.js";
import type { VersionReader } from "./version-data.js";

const revokedCodes = new Set([
  "AUTHENTICATION_FAILED",
  "UNAUTHENTICATED",
  "UNAUTHORIZED",
  "PERMISSION_DENIED",
  "FORBIDDEN",
  "ACCESS_DENIED"
]);

// No HTTP fallback or OAuth token access in the embedded app. All methods are
// fixed read-only SDK calls executed by the existing authorized MCP tool.
export function createMcpVersionReader(
  app: Pick<McpApp, "callServerTool">,
  onTransportFailure: () => void
): VersionReader {
  async function read<T>(code: string, options?: RequestOptions): Promise<T> {
    options?.signal?.throwIfAborted();
    let result: unknown;
    try {
      result = await app.callServerTool(
        { name: "kgos_read", arguments: { code } },
        options?.signal === undefined ? undefined : { signal: options.signal }
      );
    } catch (error) {
      if (options?.signal?.aborted !== true) onTransportFailure();
      throw error;
    }
    options?.signal?.throwIfAborted();
    try {
      return readMcpResult(result) as T;
    } catch (error) {
      if (
        options?.signal?.aborted !== true &&
        error instanceof McpReadError &&
        error.code !== null &&
        revokedCodes.has(error.code)
      ) {
        onTransportFailure();
      }
      throw error;
    }
  }

  return {
    branch: {
      list: (options) =>
        read<EvolutionRefListResult>("return await evolution.branch.list()", options)
    },
    tag: {
      list: (options) => read<EvolutionRefListResult>("return await evolution.tag.list()", options)
    },
    ancestry: (request: EvolutionAncestryRequest, options) =>
      read<EvolutionAncestryResult>(
        `return await evolution.ancestry(${JSON.stringify(request)})`,
        options
      ),
    get: (request: EvolutionGetRequest, options) =>
      // Version selection only needs the resolved ID. Do not transfer full
      // Snapshot data through the MCP sandbox or into the embedded UI.
      read<{ state: string }>(
        `const item = await evolution.get(${JSON.stringify(request)}); return { state: item.state }`,
        options
      )
  };
}
