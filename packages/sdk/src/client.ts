import type {
  BranchCreateRequest,
  BranchDeleteRequest,
  BranchMutationResult,
  EvolutionAncestryRequest,
  EvolutionAncestryResult,
  EvolutionDiffRequest,
  EvolutionDiffResult,
  EvolutionGetRequest,
  EvolutionGetResult,
  EvolutionHistoryRequest,
  EvolutionHistoryResult,
  EvolutionOverviewResult,
  EvolutionRefListResult,
  GraphExecuteRequest,
  GraphExecuteResult,
  GraphQueryRequest,
  GraphQueryResult,
  GraphStreamEvent,
  GraphSummaryEvent,
  JsonObject,
  JsonValue,
  MergeAbortRequest,
  MergeAbortResult,
  MergeConflictsRequest,
  MergeConflictsResult,
  MergeFinalizeRequest,
  MergeFinalizeResult,
  MergeGetRequest,
  MergeListRequest,
  MergeListResult,
  MergeResolveRequest,
  MergeSession,
  MergeStartRequest,
  ObjectReadRequest,
  ObjectReadResult,
  ObjectTextReadResult,
  OntologyReadRequest,
  OntologyReadResult,
  PatchRequest,
  PatchResult,
  PublicError,
  RequestOptions,
  StateClearDataRequest,
  StateClearDataResult,
  StateCreateRequest,
  StateCreateResult,
  StateSetDataRequest,
  StateSetDataResult,
  SystemDiagnosticsResult,
  TagCreateRequest,
  TagDeleteRequest,
  TagMoveRequest,
  TagMutationResult,
  WebDataInfoResult
} from "./types.js";

export interface KGOSClientOptions {
  endpoint: string;
  token: string;
  fetch?: typeof fetch;
}

export class KGOSDaemonError extends Error {
  readonly code: string;
  readonly details: JsonObject | undefined;
  readonly status: number;
  readonly requestId: string | undefined;

  constructor(error: PublicError, status: number, requestId?: string) {
    super(error.message);
    this.name = "KGOSDaemonError";
    this.code = error.code;
    this.details = error.details;
    this.status = status;
    this.requestId = requestId;
  }
}

export class KGOSTransportError extends Error {
  readonly aborted: boolean;
  readonly causeValue: unknown;
  readonly requestId: string | undefined;

  constructor(
    message: string,
    options?: { aborted?: boolean; cause?: unknown; requestId?: string | undefined }
  ) {
    super(message);
    this.name = "KGOSTransportError";
    this.aborted = options?.aborted ?? false;
    this.causeValue = options?.cause;
    this.requestId = options?.requestId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPublicError(value: unknown): value is PublicError {
  return (
    isRecord(value) &&
    typeof value["code"] === "string" &&
    typeof value["message"] === "string" &&
    (value["details"] === undefined || isRecord(value["details"]))
  );
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function invalidResponse(message: string, cause?: unknown, requestId?: string): KGOSTransportError {
  return new KGOSTransportError(message, { cause, requestId });
}

async function decodePublicError(response: Response): Promise<KGOSDaemonError> {
  const requestId = response.headers.get("X-KGOS-Request-ID") ?? undefined;
  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    throw invalidResponse("KG OS daemon returned an invalid error response", error, requestId);
  }
  if (!isPublicError(value)) {
    throw invalidResponse("KG OS daemon returned an invalid error response", undefined, requestId);
  }
  return new KGOSDaemonError(value, response.status, requestId);
}

function graphEvent(value: unknown, requestId?: string): GraphStreamEvent | KGOSDaemonError {
  if (!isRecord(value) || typeof value["type"] !== "string") {
    throw invalidResponse("KG OS daemon returned an invalid Graph stream event");
  }
  switch (value["type"]) {
    case "columns": {
      const columns = value["columns"];
      if (!Array.isArray(columns) || !columns.every((item) => typeof item === "string")) {
        throw invalidResponse("KG OS daemon returned an invalid Graph columns event");
      }
      return { type: "columns", columns };
    }
    case "row": {
      if (!Array.isArray(value["row"])) {
        throw invalidResponse("KG OS daemon returned an invalid Graph row event");
      }
      return { type: "row", row: value["row"] as JsonValue[] };
    }
    case "summary": {
      if (typeof value["state"] !== "string") {
        throw invalidResponse("KG OS daemon returned an invalid Graph summary event");
      }
      const counters = value["counters"] as JsonValue | undefined;
      return counters === undefined
        ? { type: "summary", state: value["state"] as GraphSummaryEvent["state"] }
        : { type: "summary", state: value["state"] as GraphSummaryEvent["state"], counters };
    }
    case "error": {
      if (!isPublicError(value["error"])) {
        throw invalidResponse("KG OS daemon returned an invalid Graph error event");
      }
      return new KGOSDaemonError(value["error"], 200, requestId);
    }
    default:
      throw invalidResponse("KG OS daemon returned an unknown Graph stream event");
  }
}

function decodeGraphLine(line: string, requestId?: string): GraphStreamEvent {
  let decoded: unknown;
  try {
    decoded = JSON.parse(line);
  } catch (error) {
    throw invalidResponse("KG OS daemon returned invalid Graph NDJSON", error);
  }
  const event = graphEvent(decoded, requestId);
  if (event instanceof KGOSDaemonError) {
    throw event;
  }
  return event;
}

async function* ndjsonLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let pending = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      pending += decoder.decode(chunk.value, { stream: !chunk.done });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.replace(/\r$/, "");
        if (line.length !== 0) {
          yield line;
        }
      }
      if (chunk.done) {
        break;
      }
    }
    const tail = pending.replace(/\r$/, "");
    if (tail.length !== 0) {
      yield tail;
    }
  } finally {
    // Early AsyncIterator.return() must close the HTTP response body, not only
    // unlock the reader while the daemon continues producing a stream.
    try {
      await reader.cancel();
    } catch {
      // Cancellation is cleanup; preserve the original stream/transport error.
    } finally {
      reader.releaseLock();
    }
  }
}

function graphStreamFailure(error: unknown, options?: RequestOptions, requestId?: string): Error {
  if (error instanceof KGOSDaemonError) {
    return error;
  }
  if (error instanceof KGOSTransportError) {
    return error.requestId === undefined && requestId !== undefined
      ? new KGOSTransportError(error.message, {
          aborted: error.aborted,
          cause: error.causeValue,
          requestId
        })
      : error;
  }
  return new KGOSTransportError("KG OS Graph stream failed", {
    aborted: isAbort(error) || options?.signal?.aborted === true,
    cause: error,
    requestId
  });
}

async function* graphEvents(
  body: ReadableStream<Uint8Array>,
  options?: RequestOptions,
  requestId?: string
): AsyncGenerator<GraphStreamEvent, void, void> {
  let terminal = false;
  try {
    for await (const line of ndjsonLines(body)) {
      if (terminal) {
        throw invalidResponse("KG OS daemon sent data after the terminal Graph event");
      }
      const event = decodeGraphLine(line, requestId);
      terminal = event.type === "summary";
      yield event;
    }
    if (!terminal) {
      throw invalidResponse("KG OS Graph stream ended without a terminal event");
    }
  } catch (error) {
    throw graphStreamFailure(error, options, requestId);
  }
}

export class KGOSClient {
  readonly system = {
    diagnostics: (options?: RequestOptions) =>
      this.post<SystemDiagnosticsResult>("/api/v1/system/diagnostics", {}, options)
  };
  readonly web = {
    data: {
      info: (options?: RequestOptions) =>
        this.post<WebDataInfoResult>("/api/v1/web/data/info", {}, options)
    }
  };

  readonly ontology = {
    /**
     * Read Ontology overview, domains, or definitions at a State.
     * @example
     * ```js
     * return await ontology.read({ at: "branch/main" });
     * ```
     */
    read: (request: OntologyReadRequest, options?: RequestOptions) =>
      this.post<OntologyReadResult>("/api/v1/ontology/read", request, options),
    /**
     * Apply an Ontology-scoped Git Extended Diff to a Branch.
     * @remarks Use the observed baseState and canonical editable Object text to construct the patch.
     * @example
     * ```js
     * const {state} = await evolution.overview(); return await ontology.patch({ branch: "<target-branch>", baseState: state, patch: "<git-extended-diff>" });
     * ```
     */
    patch: (request: PatchRequest, options?: RequestOptions) =>
      this.post<PatchResult>("/api/v1/ontology/patch", request, options)
  };

  readonly object = {
    /**
     * Read public Ontology or Knowledge Objects by Ref at a State.
     * @example
     * ```js
     * return await object.read({ at: "branch/main", refs: ["node:Person"] });
     * ```
     */
    read: (request: ObjectReadRequest, options?: RequestOptions) =>
      this.post<ObjectReadResult>("/api/v1/object/read", request, options),
    /**
     * Read canonical editable Object text by Ref at a State.
     * @example
     * ```js
     * return await object.readText({ at: "branch/main", refs: ["node:Person"] });
     * ```
     */
    readText: (request: ObjectReadRequest, options?: RequestOptions) =>
      this.post<ObjectTextReadResult>("/api/v1/object/read-text", request, options),
    /**
     * Atomically apply a Git Extended Diff spanning public Objects.
     * @remarks Use the observed baseState and canonical editable Object text to construct the patch.
     * @example
     * ```js
     * const {state} = await evolution.overview(); return await object.patch({ branch: "<target-branch>", baseState: state, patch: "<git-extended-diff>" });
     * ```
     */
    patch: (request: PatchRequest, options?: RequestOptions) =>
      this.post<PatchResult>("/api/v1/object/patch", request, options)
  };

  readonly graph = {
    /**
     * Execute a read-only Cypher query at a State.
     * @example
     * ```js
     * return await graph.query({ at: "branch/main", cypher: "MATCH (n) RETURN n LIMIT 10" });
     * ```
     */
    query: (request: GraphQueryRequest, options?: RequestOptions) =>
      this.post<GraphQueryResult>("/api/v1/graph/query", request, options),
    /**
     * Execute Cypher on a writable Branch; its effect depends on the statement.
     * @remarks Cypher is passed through unchanged. Calling execute does not guarantee that a new Commit is created.
     * @example
     * ```js
     * return await graph.execute({ branch: "<target-branch>", cypher: "MATCH (n) RETURN count(n) AS count" });
     * ```
     */
    execute: (request: GraphExecuteRequest, options?: RequestOptions) =>
      this.post<GraphExecuteResult>("/api/v1/graph/execute", request, options),
    /**
     * Stream read-only Cypher columns, rows, and final summary.
     * @example
     * ```js
     * const rows = []; for await (const event of graph.streamQuery({ at: "branch/main", cypher: "MATCH (n) RETURN n LIMIT 10" })) { if (event.type === "row") rows.push(event.row); } return rows;
     * ```
     */
    streamQuery: (request: GraphQueryRequest, options?: RequestOptions) =>
      this.stream("/api/v1/graph/query", request, options),
    /**
     * Stream Cypher execution on a writable Branch.
     * @remarks Rows or columns alone do not confirm success; inspect the terminal summary or error.
     * @example
     * ```js
     * const events = []; for await (const event of graph.streamExecute({ branch: "<target-branch>", cypher: "MATCH (n) RETURN count(n)" })) events.push(event); return events;
     * ```
     */
    streamExecute: (request: GraphExecuteRequest, options?: RequestOptions) =>
      this.stream("/api/v1/graph/execute", request, options)
  };

  readonly evolution = {
    /**
     * Resolve the default Branch and current State.
     * @example
     * ```js
     * return await evolution.overview();
     * ```
     */
    overview: (options?: RequestOptions) =>
      this.post<EvolutionOverviewResult>("/api/v1/evolution/overview", {}, options),
    /**
     * Inspect one State's metadata, consistency, and State Data.
     * @example
     * ```js
     * return await evolution.get({ state: "branch/main" });
     * ```
     */
    get: (request: EvolutionGetRequest, options?: RequestOptions) =>
      this.post<EvolutionGetResult>("/api/v1/evolution/get", request, options),
    /**
     * Read a paginated ancestor DAG from a Branch or Commit.
     * @example
     * ```js
     * return await evolution.ancestry({ root: "branch/main", limit: 20 });
     * ```
     */
    ancestry: (request: EvolutionAncestryRequest, options?: RequestOptions) =>
      this.post<EvolutionAncestryResult>("/api/v1/evolution/ancestry", request, options),
    /**
     * Read public changes reachable from a State with scope filtering.
     * @remarks scope is all, ontology, knowledge, or object. For object scope, supply an object filter with anchorState and ref.
     * @example
     * ```js
     * return await evolution.history({ root: "branch/main", scope: "all", limit: 20 });
     * ```
     */
    history: (request: EvolutionHistoryRequest, options?: RequestOptions) =>
      this.post<EvolutionHistoryResult>("/api/v1/evolution/history", request, options),
    /**
     * Compare public changes between two immutable States.
     * @remarks scope is all, ontology, knowledge, or object. For object scope, supply an object filter with anchorState and ref.
     * @example
     * ```js
     * return await evolution.diff({ before: "branch/main", after: "branch/main", scope: "all" });
     * ```
     */
    diff: (request: EvolutionDiffRequest, options?: RequestOptions) =>
      this.post<EvolutionDiffResult>("/api/v1/evolution/diff", request, options),
    state: {
      /**
       * Create a new Commit/State on an existing Branch, even without graph changes.
       * @remarks Creates a Commit even when the graph snapshot does not change.
       * @example
       * ```js
       * return await evolution.state.create({ branch: "<target-branch>", message: "Create a checkpoint" });
       * ```
       */
      create: (request: StateCreateRequest, options?: RequestOptions) =>
        this.post<StateCreateResult>("/api/v1/evolution/state/create", request, options),
      /**
       * Replace the mutable JSON State Data on an existing State; no new Commit.
       * @remarks State Data is a mutable annotation, not part of the versioned Knowledge/Ontology graph.
       * @example
       * ```js
       * return await evolution.state.setData({ state: "branch/main", data: { note: "reviewed" } });
       * ```
       */
      setData: (request: StateSetDataRequest, options?: RequestOptions) =>
        this.post<StateSetDataResult>("/api/v1/evolution/state/set-data", request, options),
      /**
       * Remove a State's mutable Data annotation; no new Commit.
       * @remarks State Data is a mutable annotation, not part of the versioned Knowledge/Ontology graph.
       * @example
       * ```js
       * return await evolution.state.clearData({ state: "branch/main" });
       * ```
       */
      clearData: (request: StateClearDataRequest, options?: RequestOptions) =>
        this.post<StateClearDataResult>("/api/v1/evolution/state/clear-data", request, options)
    },
    branch: {
      /**
       * List Branch names and their current States.
       * @example
       * ```js
       * return await evolution.branch.list();
       * ```
       */
      list: (options?: RequestOptions) =>
        this.post<EvolutionRefListResult>("/api/v1/evolution/branch/list", {}, options),
      /**
       * Create a Branch from a specified existing State.
       * @example
       * ```js
       * return await evolution.branch.create({ name: "<new-branch>", from: "branch/main" });
       * ```
       */
      create: (request: BranchCreateRequest, options?: RequestOptions) =>
        this.post<BranchMutationResult>("/api/v1/evolution/branch/create", request, options),
      /**
       * Delete a Branch reference, not its immutable Commit history.
       * @example
       * ```js
       * return await evolution.branch.delete({ name: "<target-branch>" });
       * ```
       */
      delete: (request: BranchDeleteRequest, options?: RequestOptions) =>
        this.post<BranchMutationResult>("/api/v1/evolution/branch/delete", request, options)
    },
    tag: {
      /**
       * List Tag names and their current States.
       * @example
       * ```js
       * return await evolution.tag.list();
       * ```
       */
      list: (options?: RequestOptions) =>
        this.post<EvolutionRefListResult>("/api/v1/evolution/tag/list", {}, options),
      /**
       * Create a Tag pointing at a State.
       * @example
       * ```js
       * return await evolution.tag.create({ name: "<new-tag>", target: "branch/main" });
       * ```
       */
      create: (request: TagCreateRequest, options?: RequestOptions) =>
        this.post<TagMutationResult>("/api/v1/evolution/tag/create", request, options),
      /**
       * Move an existing Tag to another State.
       * @example
       * ```js
       * return await evolution.tag.move({ name: "<existing-tag>", target: "branch/main" });
       * ```
       */
      move: (request: TagMoveRequest, options?: RequestOptions) =>
        this.post<TagMutationResult>("/api/v1/evolution/tag/move", request, options),
      /**
       * Remove a Tag reference without deleting the underlying Commit.
       * @example
       * ```js
       * return await evolution.tag.delete({ name: "<target-tag>" });
       * ```
       */
      delete: (request: TagDeleteRequest, options?: RequestOptions) =>
        this.post<TagMutationResult>("/api/v1/evolution/tag/delete", request, options)
    },
    merge: {
      /**
       * Start a Merge Session for an existing target Branch and source State.
       * @example
       * ```js
       * return await evolution.merge.start({ branch: "<target-branch>", source: "branch/main" });
       * ```
       */
      start: (request: MergeStartRequest, options?: RequestOptions) =>
        this.post<MergeSession>("/api/v1/evolution/merge/start", request, options),
      /**
       * List Merge Sessions with optional pagination.
       * @example
       * ```js
       * return await evolution.merge.list({ limit: 20 });
       * ```
       */
      list: (request: MergeListRequest = {}, options?: RequestOptions) =>
        this.post<MergeListResult>("/api/v1/evolution/merge/list", request, options),
      /**
       * Read the current status and revision of a Merge Session.
       * @example
       * ```js
       * return await evolution.merge.get({ session: "<session-id>" });
       * ```
       */
      get: (request: MergeGetRequest, options?: RequestOptions) =>
        this.post<MergeSession>("/api/v1/evolution/merge/get", request, options),
      /**
       * Read paginated Merge conflicts and the current Session revision.
       * @example
       * ```js
       * return await evolution.merge.conflicts({ session: "<session-id>", limit: 20 });
       * ```
       */
      conflicts: (request: MergeConflictsRequest, options?: RequestOptions) =>
        this.post<MergeConflictsResult>("/api/v1/evolution/merge/conflicts", request, options),
      /**
       * Apply conflict resolutions using the observed Session revision.
       * @remarks Use the current Merge Session revision, and choose resolutions based on the observed conflicts; 'ours' is only an illustrative choice.
       * @example
       * ```js
       * const s = await evolution.merge.get({ session: "<session-id>" }); return await evolution.merge.resolve({ session: s.session, expectedRevision: s.revision, resolutions: [{ conflictId: "<conflict-id>", choice: "ours" }] });
       * ```
       */
      resolve: (request: MergeResolveRequest, options?: RequestOptions) =>
        this.post<MergeSession>("/api/v1/evolution/merge/resolve", request, options),
      /**
       * Finalize a Merge Session using its current revision; may fast-forward or create a Commit.
       * @remarks Use the observed Merge Session revision. The Session may be stale after other changes.
       * @example
       * ```js
       * const s = await evolution.merge.get({ session: "<session-id>" }); return await evolution.merge.finalize({ session: s.session, expectedRevision: s.revision });
       * ```
       */
      finalize: (request: MergeFinalizeRequest, options?: RequestOptions) =>
        this.post<MergeFinalizeResult>("/api/v1/evolution/merge/finalize", request, options),
      /**
       * Abort an unfinished Merge Session at its current revision.
       * @remarks Use the observed Merge Session revision. Aborting a Session does not undo previous commits.
       * @example
       * ```js
       * const s = await evolution.merge.get({ session: "<session-id>" }); return await evolution.merge.abort({ session: s.session, expectedRevision: s.revision });
       * ```
       */
      abort: (request: MergeAbortRequest, options?: RequestOptions) =>
        this.post<MergeAbortResult>("/api/v1/evolution/merge/abort", request, options)
    }
  };

  private readonly endpoint: string;
  private readonly token: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: KGOSClientOptions) {
    let endpoint: URL;
    try {
      endpoint = new URL(options.endpoint);
    } catch (error) {
      throw new TypeError("KG OS endpoint must be an absolute URL", { cause: error });
    }
    if (
      (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") ||
      options.token.length === 0
    ) {
      throw new TypeError("KG OS endpoint must use HTTP(S) and token must be non-empty");
    }
    this.endpoint = endpoint.toString().replace(/\/$/, "");
    this.token = options.token;
    // Native browser fetch requires its Window/Worker receiver. When kept as
    // an instance method, an unbound reference can throw before any request.
    this.fetchImplementation =
      options.fetch ??
      (typeof globalThis.fetch === "function"
        ? globalThis.fetch.bind(globalThis)
        : globalThis.fetch);
    if (typeof this.fetchImplementation !== "function") {
      throw new TypeError("KG OS client requires a Web-compatible fetch implementation");
    }
  }

  private async post<Result>(
    path: string,
    request: object,
    options?: RequestOptions
  ): Promise<Result> {
    const response = await this.request(path, request, "application/json", options);
    try {
      return (await response.json()) as Result;
    } catch (error) {
      throw invalidResponse(
        "KG OS daemon returned invalid JSON",
        error,
        response.headers.get("X-KGOS-Request-ID") ?? undefined
      );
    }
  }

  private async *stream(
    path: string,
    request: GraphQueryRequest | GraphExecuteRequest,
    options?: RequestOptions
  ): AsyncGenerator<GraphStreamEvent, void, void> {
    const response = await this.request(path, request, "application/x-ndjson", options);
    const requestId = response.headers.get("X-KGOS-Request-ID") ?? undefined;
    if (response.body === null) {
      throw invalidResponse("KG OS daemon returned an empty Graph stream", undefined, requestId);
    }
    for await (const event of graphEvents(response.body, options, requestId)) {
      yield event;
    }
  }

  private async request(
    path: string,
    request: object,
    accept: string,
    options?: RequestOptions
  ): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImplementation(this.endpoint + path, {
        method: "POST",
        headers: {
          Accept: accept,
          Authorization: "Bearer " + this.token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(request),
        signal: options?.signal ?? null
      });
    } catch (error) {
      throw new KGOSTransportError("KG OS daemon request failed", {
        aborted: isAbort(error) || options?.signal?.aborted === true,
        cause: error
      });
    }
    if (!response.ok) {
      throw await decodePublicError(response);
    }
    return response;
  }
}
