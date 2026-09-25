import type { JsonValue, KGOSClient, MergeResolution } from "@kgos/sdk";

import { parseOptions, requiredInteger, requiredValue, type ParsedOptions } from "../args.js";
import { usageError } from "../errors.js";
import { outputJSON, parseJSON, readStdin, readTextFile } from "../io.js";
import { addEvolutionPage, parseEvolutionPage } from "./evolution-page.js";

const EXPECTED_REVISION_OPTION = "--expected-revision";

export async function runEvolutionMerge(
  client: KGOSClient,
  args: readonly string[],
  pretty: boolean
): Promise<void> {
  const command = args[0];
  if (command === undefined) {
    throw usageError("merge command is required");
  }
  switch (command) {
    case "start":
      return runStart(client, args.slice(1), pretty);
    case "list":
      return runList(client, args.slice(1), pretty);
    case "get":
      requireCount(args.slice(1), 1, "merge get requires exactly one session");
      outputJSON(await client.evolution.merge.get({ session: args[1] ?? "" }), pretty);
      return;
    case "conflicts":
      return runConflicts(client, args.slice(1), pretty);
    case "resolve":
      return runResolve(client, args.slice(1), pretty);
    case "finalize":
      return runFinalize(client, args.slice(1), pretty);
    case "abort":
      return runAbort(client, args.slice(1), pretty);
    default:
      throw usageError("unknown evolution merge command " + JSON.stringify(command));
  }
}

async function runStart(
  client: KGOSClient,
  args: readonly string[],
  pretty: boolean
): Promise<void> {
  const parsed = parseOptions(args, { value: ["--branch", "--source"] });
  if (parsed.positionals.length !== 0) {
    throw usageError("merge start does not accept positional arguments");
  }
  outputJSON(
    await client.evolution.merge.start({
      branch: requiredValue(parsed, "--branch"),
      source: requiredValue(parsed, "--source")
    }),
    pretty
  );
}

async function runList(
  client: KGOSClient,
  args: readonly string[],
  pretty: boolean
): Promise<void> {
  const parsed = parseEvolutionPage(args);
  const request: { limit?: number; cursor?: string } = {};
  addEvolutionPage(request, parsed);
  outputJSON(await client.evolution.merge.list(request), pretty);
}

async function runConflicts(
  client: KGOSClient,
  args: readonly string[],
  pretty: boolean
): Promise<void> {
  const session = requireLeadingValue(args, "merge conflicts requires a session");
  const parsed = parseEvolutionPage(args.slice(1));
  const request: { session: string; limit?: number; cursor?: string } = { session };
  addEvolutionPage(request, parsed);
  outputJSON(await client.evolution.merge.conflicts(request), pretty);
}

async function runResolve(
  client: KGOSClient,
  args: readonly string[],
  pretty: boolean
): Promise<void> {
  const session = requireLeadingValue(args, "merge resolve requires a session");
  const parsed = parseOptions(args.slice(1), {
    value: [EXPECTED_REVISION_OPTION, "--resolutions", "--resolutions-file"]
  });
  if (parsed.positionals.length !== 0) {
    throw usageError("merge resolve accepts exactly one session");
  }
  const resolutions = await loadResolutions(parsed);
  outputJSON(
    await client.evolution.merge.resolve({
      session,
      expectedRevision: requiredInteger(parsed, EXPECTED_REVISION_OPTION, 1),
      resolutions
    }),
    pretty
  );
}

async function runFinalize(
  client: KGOSClient,
  args: readonly string[],
  pretty: boolean
): Promise<void> {
  const session = requireLeadingValue(args, "merge finalize requires a session");
  const parsed = parseOptions(args.slice(1), {
    value: [EXPECTED_REVISION_OPTION, "--author", "--message"]
  });
  if (parsed.positionals.length !== 0) {
    throw usageError("merge finalize accepts exactly one session");
  }
  const request: {
    session: string;
    expectedRevision: number;
    author?: string;
    message?: string;
  } = {
    session,
    expectedRevision: requiredInteger(parsed, EXPECTED_REVISION_OPTION, 1)
  };
  const author = parsed.values.get("--author");
  const message = parsed.values.get("--message");
  if (author !== undefined) {
    request.author = author;
  }
  if (message !== undefined) {
    request.message = message;
  }
  outputJSON(await client.evolution.merge.finalize(request), pretty);
}

async function runAbort(
  client: KGOSClient,
  args: readonly string[],
  pretty: boolean
): Promise<void> {
  const session = requireLeadingValue(args, "merge abort requires a session");
  const parsed = parseOptions(args.slice(1), { value: [EXPECTED_REVISION_OPTION] });
  if (parsed.positionals.length !== 0) {
    throw usageError("merge abort accepts exactly one session");
  }
  outputJSON(
    await client.evolution.merge.abort({
      session,
      expectedRevision: requiredInteger(parsed, EXPECTED_REVISION_OPTION, 1)
    }),
    pretty
  );
}

async function loadResolutions(parsed: ParsedOptions): Promise<MergeResolution[]> {
  const inline = parsed.values.get("--resolutions");
  const file = parsed.values.get("--resolutions-file");
  if (inline !== undefined && file !== undefined) {
    throw usageError("--resolutions and --resolutions-file are mutually exclusive");
  }
  if (inline === undefined && file === undefined && process.stdin.isTTY) {
    throw usageError("merge resolve requires --resolutions, --resolutions-file, or non-TTY stdin");
  }
  const text =
    inline ??
    (file !== undefined
      ? await readTextFile(file, "resolutions file")
      : await readStdin("resolutions stdin"));
  const raw = parseJSON(text, "resolutions");
  if (!Array.isArray(raw)) {
    throw usageError("resolutions must be a JSON array");
  }
  return raw.map((value, index) => decodeResolution(value, index));
}

function decodeResolution(value: JsonValue, index: number): MergeResolution {
  const label = `resolutions[${String(index)}]`;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw usageError(label + " must be a JSON object");
  }
  const keys = Object.keys(value);
  if (keys.some((key) => !["conflictId", "choice", "value"].includes(key))) {
    throw usageError(label + " contains an unknown field");
  }
  const conflictId = value["conflictId"];
  const choice = value["choice"];
  if (typeof conflictId !== "string" || conflictId.length === 0) {
    throw usageError(label + ".conflictId is required");
  }
  if (choice !== "ours" && choice !== "theirs" && choice !== "value") {
    throw usageError(label + ".choice must be ours, theirs, or value");
  }
  const hasValue = Object.hasOwn(value, "value");
  if (choice === "value" && !hasValue) {
    throw usageError(label + ".value is required when choice=value");
  }
  if (choice !== "value" && hasValue) {
    throw usageError(label + ".value is valid only when choice=value");
  }
  const resolution: MergeResolution = { conflictId, choice };
  if (hasValue) {
    resolution.value = value["value"] ?? null;
  }
  return resolution;
}

function requireLeadingValue(args: readonly string[], message: string): string {
  const value = args[0];
  if (value === undefined || value.startsWith("--")) {
    throw usageError(message);
  }
  return value;
}

function requireCount(args: readonly string[], count: number, message: string): void {
  if (args.length !== count || args.some((value) => value.startsWith("--"))) {
    throw usageError(message);
  }
}
