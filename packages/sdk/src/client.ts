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
  TagCreateRequest,
  TagDeleteRequest,
  TagMoveRequest,
  TagMutationResult
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

  constructor(error: PublicError, status: number) {
    super(error.message);
    this.name = "KGOSDaemonError";
    this.code = error.code;
    this.details = error.details;
    this.status = status;
  }
}

export class KGOSTransportError extends Error {
  readonly aborted: boolean;
  readonly causeValue: unknown;

  constructor(message: string, options?: { aborted?: boolean; cause?: unknown }) {
    super(message);
    this.name = "KGOSTransportError";
    this.aborted = options?.aborted ?? false;
    this.causeValue = options?.cause;
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

function invalidResponse(message: string, cause?: unknown): KGOSTransportError {
  return new KGOSTransportError(message, { cause });
}

async function decodePublicError(response: Response): Promise<KGOSDaemonError> {
  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    throw invalidResponse("KG OS daemon returned an invalid error response", error);
  }
  if (!isPublicError(value)) {
    throw invalidResponse("KG OS daemon returned an invalid error response");
  }
  return new KGOSDaemonError(value, response.status);
}

function graphEvent(value: unknown): GraphStreamEvent | KGOSDaemonError {
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
        ? { type: "summary", state: value["state"] }
        : { type: "summary", state: value["state"], counters };
    }
    case "error": {
      if (!isPublicError(value["error"])) {
        throw invalidResponse("KG OS daemon returned an invalid Graph error event");
      }
      return new KGOSDaemonError(value["error"], 200);
    }
    default:
      throw invalidResponse("KG OS daemon returned an unknown Graph stream event");
  }
}

function decodeGraphLine(line: string): GraphStreamEvent {
  let decoded: unknown;
  try {
    decoded = JSON.parse(line);
  } catch (error) {
    throw invalidResponse("KG OS daemon returned invalid Graph NDJSON", error);
  }
  const event = graphEvent(decoded);
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
    reader.releaseLock();
  }
}

function graphStreamFailure(error: unknown, options?: RequestOptions): Error {
  if (error instanceof KGOSDaemonError || error instanceof KGOSTransportError) {
    return error;
  }
  return new KGOSTransportError("KG OS Graph stream failed", {
    aborted: isAbort(error) || options?.signal?.aborted === true,
    cause: error
  });
}

async function* graphEvents(
  body: ReadableStream<Uint8Array>,
  options?: RequestOptions
): AsyncGenerator<GraphStreamEvent, void, void> {
  let terminal = false;
  try {
    for await (const line of ndjsonLines(body)) {
      if (terminal) {
        throw invalidResponse("KG OS daemon sent data after the terminal Graph event");
      }
      const event = decodeGraphLine(line);
      terminal = event.type === "summary";
      yield event;
    }
    if (!terminal) {
      throw invalidResponse("KG OS Graph stream ended without a terminal event");
    }
  } catch (error) {
    throw graphStreamFailure(error, options);
  }
}

export class KGOSClient {
  readonly ontology = {
    read: (request: OntologyReadRequest, options?: RequestOptions) =>
      this.post<OntologyReadResult>("/api/v1/ontology/read", request, options),
    patch: (request: PatchRequest, options?: RequestOptions) =>
      this.post<PatchResult>("/api/v1/ontology/patch", request, options)
  };

  readonly object = {
    read: (request: ObjectReadRequest, options?: RequestOptions) =>
      this.post<ObjectReadResult>("/api/v1/object/read", request, options),
    readText: (request: ObjectReadRequest, options?: RequestOptions) =>
      this.post<ObjectTextReadResult>("/api/v1/object/read-text", request, options),
    patch: (request: PatchRequest, options?: RequestOptions) =>
      this.post<PatchResult>("/api/v1/object/patch", request, options)
  };

  readonly graph = {
    query: (request: GraphQueryRequest, options?: RequestOptions) =>
      this.post<GraphQueryResult>("/api/v1/graph/query", request, options),
    execute: (request: GraphExecuteRequest, options?: RequestOptions) =>
      this.post<GraphExecuteResult>("/api/v1/graph/execute", request, options),
    streamQuery: (request: GraphQueryRequest, options?: RequestOptions) =>
      this.stream("/api/v1/graph/query", request, options),
    streamExecute: (request: GraphExecuteRequest, options?: RequestOptions) =>
      this.stream("/api/v1/graph/execute", request, options)
  };

  readonly evolution = {
    overview: (options?: RequestOptions) =>
      this.post<EvolutionOverviewResult>("/api/v1/evolution/overview", {}, options),
    get: (request: EvolutionGetRequest, options?: RequestOptions) =>
      this.post<EvolutionGetResult>("/api/v1/evolution/get", request, options),
    ancestry: (request: EvolutionAncestryRequest, options?: RequestOptions) =>
      this.post<EvolutionAncestryResult>("/api/v1/evolution/ancestry", request, options),
    history: (request: EvolutionHistoryRequest, options?: RequestOptions) =>
      this.post<EvolutionHistoryResult>("/api/v1/evolution/history", request, options),
    diff: (request: EvolutionDiffRequest, options?: RequestOptions) =>
      this.post<EvolutionDiffResult>("/api/v1/evolution/diff", request, options),
    state: {
      create: (request: StateCreateRequest, options?: RequestOptions) =>
        this.post<StateCreateResult>("/api/v1/evolution/state/create", request, options),
      setData: (request: StateSetDataRequest, options?: RequestOptions) =>
        this.post<StateSetDataResult>("/api/v1/evolution/state/set-data", request, options),
      clearData: (request: StateClearDataRequest, options?: RequestOptions) =>
        this.post<StateClearDataResult>("/api/v1/evolution/state/clear-data", request, options)
    },
    branch: {
      list: (options?: RequestOptions) =>
        this.post<EvolutionRefListResult>("/api/v1/evolution/branch/list", {}, options),
      create: (request: BranchCreateRequest, options?: RequestOptions) =>
        this.post<BranchMutationResult>("/api/v1/evolution/branch/create", request, options),
      delete: (request: BranchDeleteRequest, options?: RequestOptions) =>
        this.post<BranchMutationResult>("/api/v1/evolution/branch/delete", request, options)
    },
    tag: {
      list: (options?: RequestOptions) =>
        this.post<EvolutionRefListResult>("/api/v1/evolution/tag/list", {}, options),
      create: (request: TagCreateRequest, options?: RequestOptions) =>
        this.post<TagMutationResult>("/api/v1/evolution/tag/create", request, options),
      move: (request: TagMoveRequest, options?: RequestOptions) =>
        this.post<TagMutationResult>("/api/v1/evolution/tag/move", request, options),
      delete: (request: TagDeleteRequest, options?: RequestOptions) =>
        this.post<TagMutationResult>("/api/v1/evolution/tag/delete", request, options)
    },
    merge: {
      start: (request: MergeStartRequest, options?: RequestOptions) =>
        this.post<MergeSession>("/api/v1/evolution/merge/start", request, options),
      list: (request: MergeListRequest = {}, options?: RequestOptions) =>
        this.post<MergeListResult>("/api/v1/evolution/merge/list", request, options),
      get: (request: MergeGetRequest, options?: RequestOptions) =>
        this.post<MergeSession>("/api/v1/evolution/merge/get", request, options),
      conflicts: (request: MergeConflictsRequest, options?: RequestOptions) =>
        this.post<MergeConflictsResult>("/api/v1/evolution/merge/conflicts", request, options),
      resolve: (request: MergeResolveRequest, options?: RequestOptions) =>
        this.post<MergeSession>("/api/v1/evolution/merge/resolve", request, options),
      finalize: (request: MergeFinalizeRequest, options?: RequestOptions) =>
        this.post<MergeFinalizeResult>("/api/v1/evolution/merge/finalize", request, options),
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
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
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
      throw invalidResponse("KG OS daemon returned invalid JSON", error);
    }
  }

  private async *stream(
    path: string,
    request: GraphQueryRequest | GraphExecuteRequest,
    options?: RequestOptions
  ): AsyncGenerator<GraphStreamEvent, void, void> {
    const response = await this.request(path, request, "application/x-ndjson", options);
    if (response.body === null) {
      throw invalidResponse("KG OS daemon returned an empty Graph stream");
    }
    for await (const event of graphEvents(response.body, options)) {
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
