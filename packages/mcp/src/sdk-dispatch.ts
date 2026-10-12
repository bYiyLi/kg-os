import type { KGOSClient, GraphStreamEvent } from "@kgos/sdk";
import { ExecutionError } from "./errors.js";

export const READ_METHODS = new Set([
  "ontology.read",
  "object.read",
  "object.readText",
  "graph.query",
  "graph.streamQuery",
  "evolution.overview",
  "evolution.get",
  "evolution.ancestry",
  "evolution.history",
  "evolution.diff",
  "evolution.branch.list",
  "evolution.tag.list",
  "evolution.merge.list",
  "evolution.merge.get",
  "evolution.merge.conflicts"
]);

export const WRITE_METHODS = new Set([
  "ontology.patch",
  "object.patch",
  "graph.execute",
  "graph.streamExecute",
  "evolution.state.create",
  "evolution.state.setData",
  "evolution.state.clearData",
  "evolution.branch.create",
  "evolution.branch.delete",
  "evolution.tag.create",
  "evolution.tag.move",
  "evolution.tag.delete",
  "evolution.merge.start",
  "evolution.merge.resolve",
  "evolution.merge.finalize",
  "evolution.merge.abort"
]);

export const STREAM_METHODS = new Set(["graph.streamQuery", "graph.streamExecute"]);
interface SDKOptions {
  signal: AbortSignal;
}
export type Stream = AsyncIterator<GraphStreamEvent>;

function invokeRead(
  client: KGOSClient,
  method: string,
  arg: unknown,
  options: SDKOptions
): Promise<unknown> {
  switch (method) {
    case "ontology.read":
      return client.ontology.read(arg as Parameters<typeof client.ontology.read>[0], options);
    case "object.read":
      return client.object.read(arg as Parameters<typeof client.object.read>[0], options);
    case "object.readText":
      return client.object.readText(arg as Parameters<typeof client.object.readText>[0], options);
    case "graph.query":
      return client.graph.query(arg as Parameters<typeof client.graph.query>[0], options);
    case "evolution.overview":
      return client.evolution.overview(options);
    case "evolution.get":
      return client.evolution.get(arg as Parameters<typeof client.evolution.get>[0], options);
    case "evolution.ancestry":
      return client.evolution.ancestry(
        arg as Parameters<typeof client.evolution.ancestry>[0],
        options
      );
    case "evolution.history":
      return client.evolution.history(
        arg as Parameters<typeof client.evolution.history>[0],
        options
      );
    case "evolution.diff":
      return client.evolution.diff(arg as Parameters<typeof client.evolution.diff>[0], options);
    case "evolution.branch.list":
      return client.evolution.branch.list(options);
    case "evolution.tag.list":
      return client.evolution.tag.list(options);
    case "evolution.merge.list":
      return client.evolution.merge.list(
        arg as Parameters<typeof client.evolution.merge.list>[0],
        options
      );
    case "evolution.merge.get":
      return client.evolution.merge.get(
        arg as Parameters<typeof client.evolution.merge.get>[0],
        options
      );
    case "evolution.merge.conflicts":
      return client.evolution.merge.conflicts(
        arg as Parameters<typeof client.evolution.merge.conflicts>[0],
        options
      );
    default:
      throw new ExecutionError("PERMISSION_DENIED", "SDK method is unavailable");
  }
}

function invokeWrite(
  client: KGOSClient,
  method: string,
  arg: unknown,
  options: SDKOptions
): Promise<unknown> {
  switch (method) {
    case "ontology.patch":
      return client.ontology.patch(arg as Parameters<typeof client.ontology.patch>[0], options);
    case "object.patch":
      return client.object.patch(arg as Parameters<typeof client.object.patch>[0], options);
    case "graph.execute":
      return client.graph.execute(arg as Parameters<typeof client.graph.execute>[0], options);
    case "evolution.state.create":
      return client.evolution.state.create(
        arg as Parameters<typeof client.evolution.state.create>[0],
        options
      );
    case "evolution.state.setData":
      return client.evolution.state.setData(
        arg as Parameters<typeof client.evolution.state.setData>[0],
        options
      );
    case "evolution.state.clearData":
      return client.evolution.state.clearData(
        arg as Parameters<typeof client.evolution.state.clearData>[0],
        options
      );
    case "evolution.branch.create":
      return client.evolution.branch.create(
        arg as Parameters<typeof client.evolution.branch.create>[0],
        options
      );
    case "evolution.branch.delete":
      return client.evolution.branch.delete(
        arg as Parameters<typeof client.evolution.branch.delete>[0],
        options
      );
    case "evolution.tag.create":
      return client.evolution.tag.create(
        arg as Parameters<typeof client.evolution.tag.create>[0],
        options
      );
    case "evolution.tag.move":
      return client.evolution.tag.move(
        arg as Parameters<typeof client.evolution.tag.move>[0],
        options
      );
    case "evolution.tag.delete":
      return client.evolution.tag.delete(
        arg as Parameters<typeof client.evolution.tag.delete>[0],
        options
      );
    case "evolution.merge.start":
      return client.evolution.merge.start(
        arg as Parameters<typeof client.evolution.merge.start>[0],
        options
      );
    case "evolution.merge.resolve":
      return client.evolution.merge.resolve(
        arg as Parameters<typeof client.evolution.merge.resolve>[0],
        options
      );
    case "evolution.merge.finalize":
      return client.evolution.merge.finalize(
        arg as Parameters<typeof client.evolution.merge.finalize>[0],
        options
      );
    case "evolution.merge.abort":
      return client.evolution.merge.abort(
        arg as Parameters<typeof client.evolution.merge.abort>[0],
        options
      );
    default:
      throw new ExecutionError("PERMISSION_DENIED", "SDK method is unavailable");
  }
}

export function invoke(
  client: KGOSClient,
  method: string,
  arg: unknown,
  options: SDKOptions
): Promise<unknown> {
  return READ_METHODS.has(method)
    ? invokeRead(client, method, arg, options)
    : invokeWrite(client, method, arg, options);
}

export function streamSdk(
  client: KGOSClient,
  method: string,
  arg: unknown,
  options: SDKOptions
): Stream {
  if (method === "graph.streamQuery") {
    return client.graph.streamQuery(arg as Parameters<typeof client.graph.streamQuery>[0], options);
  }
  if (method === "graph.streamExecute") {
    return client.graph.streamExecute(
      arg as Parameters<typeof client.graph.streamExecute>[0],
      options
    );
  }
  throw new ExecutionError("PERMISSION_DENIED", "SDK stream method is unavailable");
}
