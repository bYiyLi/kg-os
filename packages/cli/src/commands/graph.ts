import type {
  GraphExecuteRequest,
  GraphQueryRequest,
  GraphStreamEvent,
  JsonObject,
  KGOSClient
} from "@kgos/sdk";

import { parseOptions, requiredValue, type ParsedOptions } from "../args.js";
import { usageError } from "../errors.js";
import {
  outputJSON,
  parseJSONObject,
  readStdin,
  readTextFile,
  requireNonEmptyText
} from "../io.js";

interface GraphInvocation {
  client: KGOSClient;
  parsed: ParsedOptions;
  cypher: string;
  params: JsonObject | undefined;
  stream: boolean;
  pretty: boolean;
}

export async function runGraph(client: KGOSClient, args: readonly string[]): Promise<void> {
  const command = args[0];
  if (command !== "query" && command !== "execute") {
    throw usageError(
      command === undefined ? "graph subcommand is required" : "unknown graph subcommand"
    );
  }
  const parsed = parseOptions(args.slice(1), {
    boolean: ["--pretty", "--stream"],
    value: [
      "--at",
      "--branch",
      "--cypher",
      "--cypher-file",
      "--params",
      "--params-file",
      "--author",
      "--message"
    ]
  });
  if (parsed.positionals.length !== 0) {
    throw usageError("graph " + command + " does not accept positional arguments");
  }
  const stream = parsed.booleans.has("--stream");
  const pretty = parsed.booleans.has("--pretty");
  if (stream && pretty) {
    throw usageError("--pretty and --stream are mutually exclusive");
  }
  const cypher = await loadCypher(
    parsed.values.get("--cypher"),
    parsed.values.get("--cypher-file")
  );
  const params = await loadParams(
    parsed.values.get("--params"),
    parsed.values.get("--params-file")
  );
  const invocation: GraphInvocation = { client, parsed, cypher, params, stream, pretty };
  if (command === "query") {
    await runQuery(invocation);
    return;
  }
  await runExecute(invocation);
}

async function runQuery(invocation: GraphInvocation): Promise<void> {
  const { client, parsed, cypher, params, stream, pretty } = invocation;
  if (
    parsed.values.has("--branch") ||
    parsed.values.has("--author") ||
    parsed.values.has("--message")
  ) {
    throw usageError("graph query does not accept --branch, --author, or --message");
  }
  const request: GraphQueryRequest = { at: requiredValue(parsed, "--at"), cypher };
  if (params !== undefined) {
    request.params = params;
  }
  if (stream) {
    await writeStream(client.graph.streamQuery(request));
    return;
  }
  outputJSON(await client.graph.query(request), pretty);
}

async function runExecute(invocation: GraphInvocation): Promise<void> {
  const { client, parsed, cypher, params, stream, pretty } = invocation;
  if (parsed.values.has("--at")) {
    throw usageError("graph execute does not accept --at");
  }
  const request: GraphExecuteRequest = {
    branch: requiredValue(parsed, "--branch"),
    cypher
  };
  if (params !== undefined) {
    request.params = params;
  }
  const author = parsed.values.get("--author");
  const message = parsed.values.get("--message");
  if (author !== undefined) {
    request.author = author;
  }
  if (message !== undefined) {
    request.message = message;
  }
  if (stream) {
    await writeStream(client.graph.streamExecute(request));
    return;
  }
  outputJSON(await client.graph.execute(request), pretty);
}

async function loadCypher(inline: string | undefined, file: string | undefined): Promise<string> {
  if (inline !== undefined && file !== undefined) {
    throw usageError("--cypher and --cypher-file are mutually exclusive");
  }
  if (inline === undefined && file === undefined && process.stdin.isTTY) {
    throw usageError("graph command requires --cypher, --cypher-file, or non-TTY stdin");
  }
  let value: string;
  if (inline !== undefined) {
    value = inline;
  } else if (file !== undefined) {
    value = await readTextFile(file, "Cypher file");
  } else {
    value = await readStdin("Cypher stdin");
  }
  return requireNonEmptyText(value, "Cypher");
}

async function loadParams(
  inline: string | undefined,
  file: string | undefined
): Promise<JsonObject | undefined> {
  if (inline !== undefined && file !== undefined) {
    throw usageError("--params and --params-file are mutually exclusive");
  }
  if (inline === undefined && file === undefined) {
    return undefined;
  }
  let text = inline;
  if (text === undefined) {
    if (file === undefined) {
      return undefined;
    }
    text = await readTextFile(file, "params file");
  }
  return parseJSONObject(text, "params");
}

async function writeStream(stream: AsyncIterable<GraphStreamEvent>): Promise<void> {
  for await (const event of stream) {
    process.stdout.write(JSON.stringify(event) + "\n");
  }
}
