import type {
  EvolutionDiffRequest,
  EvolutionHistoryRequest,
  EvolutionObjectFilter,
  JsonValue,
  KGOSClient,
  StateCreateRequest
} from "@kgos/sdk";

import {
  assertPositionals,
  extractPretty,
  optionalInteger,
  parseOptions,
  requiredValue,
  type ParsedOptions
} from "../args.js";
import { usageError } from "../errors.js";
import { outputJSON, parseJSON, readStdin, readTextFile } from "../io.js";
import { addEvolutionPage, parseEvolutionPage } from "./evolution-page.js";
import { runEvolutionMerge } from "./evolution-merge.js";

export async function runEvolution(
  client: KGOSClient,
  inputArgs: readonly string[]
): Promise<void> {
  const { args, pretty } = extractPretty(inputArgs);
  const command = args[0];
  if (command === undefined) {
    throw usageError("evolution command is required");
  }
  switch (command) {
    case "overview":
      requireCount(args.slice(1), 0, "overview does not accept arguments");
      outputJSON(await client.evolution.overview(), pretty);
      return;
    case "get":
      requireCount(args.slice(1), 1, "get requires exactly one StateRef");
      outputJSON(await client.evolution.get({ state: args[1] ?? "" }), pretty);
      return;
    case "ancestry":
      await runAncestry(client, args.slice(1), pretty);
      return;
    case "history":
      await runHistory(client, args.slice(1), pretty);
      return;
    case "diff":
      await runDiff(client, args.slice(1), pretty);
      return;
    case "state":
      await runState(client, args.slice(1), pretty);
      return;
    case "branch":
      await runBranch(client, args.slice(1), pretty);
      return;
    case "tag":
      await runTag(client, args.slice(1), pretty);
      return;
    case "merge":
      await runEvolutionMerge(client, args.slice(1), pretty);
      return;
    default:
      throw usageError("unknown evolution command " + JSON.stringify(command));
  }
}

async function runAncestry(
  client: KGOSClient,
  args: readonly string[],
  pretty: boolean
): Promise<void> {
  if (args.length === 0 || args[0]?.startsWith("--") === true) {
    throw usageError("ancestry requires a StateRef");
  }
  const parsed = parseEvolutionPage(args.slice(1));
  const request: { root: string; limit?: number; cursor?: string } = { root: args[0] ?? "" };
  addEvolutionPage(request, parsed);
  outputJSON(await client.evolution.ancestry(request), pretty);
}

async function runHistory(
  client: KGOSClient,
  args: readonly string[],
  pretty: boolean
): Promise<void> {
  if (args.length === 0 || args[0]?.startsWith("--") === true) {
    throw usageError("history requires a StateRef");
  }
  const parsed = parseScope(args.slice(1));
  const request: EvolutionHistoryRequest = { root: args[0] ?? "", scope: parsed.scope };
  if (parsed.object !== undefined) {
    request.object = parsed.object;
  }
  addEvolutionPage(request, parsed);
  outputJSON(await client.evolution.history(request), pretty);
}

async function runDiff(
  client: KGOSClient,
  args: readonly string[],
  pretty: boolean
): Promise<void> {
  const parsed = parseOptions(args, {
    value: [
      "--before",
      "--after",
      "--scope",
      "--object-ref",
      "--anchor-state",
      "--limit",
      "--cursor"
    ]
  });
  if (parsed.positionals.length !== 0) {
    throw usageError("diff does not accept positional arguments");
  }
  const scope = parseScopeValue(requiredValue(parsed, "--scope"));
  const object = parseObjectFilter(parsed, scope);
  const request: EvolutionDiffRequest = {
    before: requiredValue(parsed, "--before"),
    after: requiredValue(parsed, "--after"),
    scope
  };
  if (object !== undefined) {
    request.object = object;
  }
  addEvolutionPage(request, parsed);
  outputJSON(await client.evolution.diff(request), pretty);
}

async function runState(
  client: KGOSClient,
  args: readonly string[],
  pretty: boolean
): Promise<void> {
  const command = args[0];
  if (command === undefined) {
    throw usageError("state command is required");
  }
  switch (command) {
    case "create": {
      const parsed = parseOptions(args.slice(1), {
        value: ["--branch", "--data", "--data-file", "--author", "--message"]
      });
      if (parsed.positionals.length !== 0) {
        throw usageError("state create does not accept positional arguments");
      }
      const request: StateCreateRequest = { branch: requiredValue(parsed, "--branch") };
      const data = await optionalJSONSource(parsed, {
        inlineName: "--data",
        fileName: "--data-file",
        required: false,
        label: "State data"
      });
      if (data.present) {
        request.data = data.value;
      }
      const author = parsed.values.get("--author");
      const message = parsed.values.get("--message");
      if (author !== undefined) {
        request.author = author;
      }
      if (message !== undefined) {
        request.message = message;
      }
      outputJSON(await client.evolution.state.create(request), pretty);
      return;
    }
    case "set-data": {
      const parsed = parseOptions(args.slice(1), { value: ["--data", "--data-file"] });
      assertPositionals(parsed, 1, 1, "state set-data requires exactly one StateRef");
      const data = await optionalJSONSource(parsed, {
        inlineName: "--data",
        fileName: "--data-file",
        required: true,
        label: "State data"
      });
      outputJSON(
        await client.evolution.state.setData({
          state: parsed.positionals[0] ?? "",
          data: data.value
        }),
        pretty
      );
      return;
    }
    case "clear-data": {
      const parsed = parseOptions(args.slice(1), {});
      assertPositionals(parsed, 1, 1, "state clear-data requires exactly one StateRef");
      outputJSON(
        await client.evolution.state.clearData({ state: parsed.positionals[0] ?? "" }),
        pretty
      );
      return;
    }
    default:
      throw usageError("unknown evolution state command " + JSON.stringify(command));
  }
}

async function runBranch(
  client: KGOSClient,
  args: readonly string[],
  pretty: boolean
): Promise<void> {
  const command = args[0];
  if (command === undefined) {
    throw usageError("branch command is required");
  }
  switch (command) {
    case "list":
      requireCount(args.slice(1), 0, "branch list does not accept arguments");
      outputJSON(await client.evolution.branch.list(), pretty);
      return;
    case "create": {
      if (args.length < 2 || args[1]?.startsWith("--") === true) {
        throw usageError("branch create requires a name");
      }
      const parsed = parseOptions(args.slice(2), { value: ["--from"] });
      if (parsed.positionals.length !== 0) {
        throw usageError("branch create accepts exactly one name");
      }
      outputJSON(
        await client.evolution.branch.create({
          name: args[1] ?? "",
          from: requiredValue(parsed, "--from")
        }),
        pretty
      );
      return;
    }
    case "delete":
      requireCount(args.slice(1), 1, "branch delete requires exactly one name");
      outputJSON(await client.evolution.branch.delete({ name: args[1] ?? "" }), pretty);
      return;
    default:
      throw usageError("unknown evolution branch command " + JSON.stringify(command));
  }
}

async function runTag(client: KGOSClient, args: readonly string[], pretty: boolean): Promise<void> {
  const command = args[0];
  if (command === undefined) {
    throw usageError("tag command is required");
  }
  switch (command) {
    case "list":
      requireCount(args.slice(1), 0, "tag list does not accept arguments");
      outputJSON(await client.evolution.tag.list(), pretty);
      return;
    case "create":
    case "move": {
      if (args.length < 2 || args[1]?.startsWith("--") === true) {
        throw usageError("tag " + command + " requires a name");
      }
      const parsed = parseOptions(args.slice(2), { value: ["--target"] });
      if (parsed.positionals.length !== 0) {
        throw usageError("tag " + command + " accepts exactly one name");
      }
      const request = { name: args[1] ?? "", target: requiredValue(parsed, "--target") };
      outputJSON(
        command === "create"
          ? await client.evolution.tag.create(request)
          : await client.evolution.tag.move(request),
        pretty
      );
      return;
    }
    case "delete":
      requireCount(args.slice(1), 1, "tag delete requires exactly one name");
      outputJSON(await client.evolution.tag.delete({ name: args[1] ?? "" }), pretty);
      return;
    default:
      throw usageError("unknown evolution tag command " + JSON.stringify(command));
  }
}

function parseScope(args: readonly string[]): ParsedOptions & {
  scope: string;
  object?: EvolutionObjectFilter;
} {
  const parsed = parseOptions(args, {
    value: ["--scope", "--object-ref", "--anchor-state", "--limit", "--cursor"]
  });
  if (parsed.positionals.length !== 0) {
    throw usageError("history does not accept additional positional arguments");
  }
  const scope = parseScopeValue(requiredValue(parsed, "--scope"));
  const object = parseObjectFilter(parsed, scope);
  optionalInteger(parsed, "--limit", 1, 1000);
  return object === undefined
    ? Object.assign(parsed, { scope })
    : Object.assign(parsed, { scope, object });
}

function parseScopeValue(value: string): string {
  if (!["all", "ontology", "knowledge", "object"].includes(value)) {
    throw usageError("--scope must be all, ontology, knowledge, or object");
  }
  return value;
}

function parseObjectFilter(
  parsed: ParsedOptions,
  scope: string
): EvolutionObjectFilter | undefined {
  const ref = parsed.values.get("--object-ref");
  const anchorState = parsed.values.get("--anchor-state");
  if (scope === "object") {
    if (ref === undefined || anchorState === undefined) {
      throw usageError("--scope object requires --object-ref and --anchor-state");
    }
    return { ref, anchorState };
  }
  if (ref !== undefined || anchorState !== undefined) {
    throw usageError("--object-ref and --anchor-state are valid only with --scope object");
  }
  return undefined;
}

interface JSONSourceOptions {
  inlineName: string;
  fileName: string;
  required: boolean;
  label: string;
}

async function optionalJSONSource(
  parsed: ParsedOptions,
  options: JSONSourceOptions
): Promise<{ present: boolean; value: JsonValue }> {
  const { inlineName, fileName, required, label } = options;
  const inline = parsed.values.get(inlineName);
  const file = parsed.values.get(fileName);
  if (inline !== undefined && file !== undefined) {
    throw usageError(inlineName + " and " + fileName + " are mutually exclusive");
  }
  if (inline !== undefined) {
    return { present: true, value: parseJSON(inline, label) };
  }
  if (file !== undefined) {
    return { present: true, value: parseJSON(await readTextFile(file, label + " file"), label) };
  }
  if (!required) {
    return { present: false, value: null };
  }
  if (process.stdin.isTTY) {
    throw usageError(label + " is required");
  }
  return { present: true, value: parseJSON(await readStdin(label + " stdin"), label) };
}

function requireCount(args: readonly string[], count: number, message: string): void {
  if (args.length !== count || args.some((value) => value.startsWith("--"))) {
    throw usageError(message);
  }
}
