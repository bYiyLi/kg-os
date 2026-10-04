import { type EvolutionGetResult, type JsonObject, type StateSummary } from "@kgos/sdk";

import { Connection } from "./connection.js";
import { Context } from "./context.js";
import { isObject } from "./json.js";
import { Records } from "./records.js";

export const stateA = `commit/${"a".repeat(64)}`;
export const stateB = `commit/${"b".repeat(64)}`;
export const stateC = `commit/${"c".repeat(64)}`;
const storeId = "00000000-0000-4000-8000-000000000001";

function validateSave(body: JsonObject): Response | undefined {
  const data = body["data"];
  const kind = body["kind"];
  const validId = (value: unknown) =>
    typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value);
  let message = "";
  if (
    !validId(body["storeId"]) ||
    !validId(body["id"]) ||
    !validId(body["mutationId"]) ||
    typeof kind !== "string" ||
    !["workspace", "editor", "frame", "query", "draft"].includes(kind)
  )
    message = "Web record requires UUID storeId, id, mutationId and supported kind";
  else if (
    body["expectedRevision"] !== null &&
    (typeof body["expectedRevision"] !== "string" ||
      !/^[1-9][0-9]{0,127}$/.test(body["expectedRevision"]))
  )
    message = "Web mutation requires decimal expectedRevision";
  else if (!isObject(data)) message = "Web record data must be a versioned JSON object";
  else if (data["version"] !== 1) message = "Web record payload version must be 1";
  else if (
    kind === "draft" &&
    (typeof data["subtype"] !== "string" ||
      !["object", "merge", "state-data"].includes(data["subtype"]))
  )
    message = "Web draft subtype is invalid";
  if (message === "") return undefined;
  return new Response(JSON.stringify({ code: "INVALID_ARGUMENT", message }), { status: 400 });
}

export function summary(state = stateA, parents: string[] = []): StateSummary {
  return { state, parents, committedAt: 1_700_000_000_000_000, message: "immutable message" };
}

export function detail(state = stateA): EvolutionGetResult {
  return {
    ...summary(state),
    hasData: false,
    data: null,
    consistency: { status: "valid", issues: [] }
  };
}

export function rejected(code: string) {
  return new Response(JSON.stringify({ code, message: `rejected ${code}` }), { status: 409 });
}

export async function versionHarness() {
  const handlers = new Map<string, (body: JsonObject) => unknown>();
  const calls: {
    route: string;
    body: JsonObject;
    wire: string;
    signal: AbortSignal | null | undefined;
  }[] = [];
  let revision = 0;
  const fetcher: typeof fetch = async (input, options) => {
    const address = input instanceof Request ? input.url : input.toString();
    const route = address.replace("http://127.0.0.1:1/api/v1/", "");
    const wire = typeof options?.body === "string" ? options.body : "{}";
    const body = JSON.parse(wire) as JsonObject;
    calls.push({ route, body, wire, signal: options?.signal });
    if (route === "web/data/save") {
      const invalid = validateSave(body);
      if (invalid !== undefined) return invalid;
    }
    const handler = handlers.get(route);
    if (handler !== undefined) {
      const value: unknown = await handler(body);
      return value instanceof Response ? value : new Response(JSON.stringify(value));
    }
    if (route === "web/data/info")
      return new Response(
        JSON.stringify({
          daemonBootId: "boot",
          storageStatus: "ready",
          storeId,
          databaseId: "database"
        })
      );
    if (route === "web/data/save")
      return new Response(
        JSON.stringify({
          kind: body["kind"],
          id: body["id"],
          revision: String(++revision),
          deleted: false,
          lastMutationId: body["mutationId"],
          data: body["data"]
        })
      );
    if (route === "evolution/get")
      return new Response(
        JSON.stringify(detail(typeof body["state"] === "string" ? body["state"] : stateA))
      );
    return new Response(JSON.stringify({ items: [] }));
  };
  const connection = new Connection("http://127.0.0.1:1", fetcher);
  await connection.connect("test credential");
  const context = new Context(connection);
  context.state = stateA;
  context.branches = [{ name: "main", state: stateA }];
  const records = new Records(connection, storeId);
  return { connection, context, records, calls, handlers };
}
