import type { App as McpApp } from "@modelcontextprotocol/ext-apps";
import type {
  EvolutionAncestryRequest,
  EvolutionAncestryResult,
  EvolutionGetRequest,
  EvolutionGetResult,
  EvolutionRefListResult,
  RequestOptions,
  OntologyReadResult,
  ObjectReadResult,
  GraphQueryResult
} from "@kgos/sdk";

import { McpReadError, readMcpResult } from "../../core/client/mcp-read.js";
import type { DomainReader } from "../domain/domain-data.js";
import type { VersionReader } from "./version-data.js";
import type { GraphReader } from "../graph/graph-search.js";

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
): VersionReader & DomainReader & { graph: GraphReader } {
  async function read<T>(code: string, options?: RequestOptions): Promise<T> {
    options?.signal?.throwIfAborted();
    let result: unknown;
    try {
      result = await app.callServerTool(
        { name: "kgos_query", arguments: { code } },
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
    graph: {
      query: (request, options) =>
        read<GraphQueryResult>(`return await graph.query(${JSON.stringify(request)})`, options)
    },
    ontology: {
      read: (request, options) =>
        read<OntologyReadResult>(`return await ontology.read(${JSON.stringify(request)})`, options)
    },
    object: {
      read: (request, options) =>
        read<ObjectReadResult>(`return await object.read(${JSON.stringify(request)})`, options)
    },
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
      read<Pick<EvolutionGetResult, "state">>(
        `const item = await evolution.get(${JSON.stringify(request)}); return { state: item.state }`,
        options
      )
  };
}
