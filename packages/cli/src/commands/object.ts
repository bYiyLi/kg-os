import type { KGOSClient, ObjectReadResult, ObjectTextReadResult } from "@kgos/sdk";

import { parseOptions, requiredValue } from "../args.js";
import { parseError, usageError } from "../errors.js";
import { outputJSON, readStdin, readTextFile } from "../io.js";
import { parsePatchRequest } from "./patch.js";

export async function runObject(client: KGOSClient, args: readonly string[]): Promise<void> {
  const command = args[0];
  if (command === "read") {
    await runRead(client, args.slice(1));
    return;
  }
  if (command === "patch") {
    const request = await parsePatchRequest(args.slice(1), "object patch");
    outputJSON(await client.object.patch(request), false);
    return;
  }
  throw usageError(
    command === undefined
      ? "object subcommand is required"
      : "unknown object subcommand " + JSON.stringify(command)
  );
}

async function runRead(client: KGOSClient, args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args, {
    boolean: ["--body", "--pretty"],
    value: ["--at", "--refs-file", "--format"]
  });
  const at = requiredValue(parsed, "--at");
  const refs = await readRefs(parsed.positionals, parsed.values.get("--refs-file"));
  if (refs.length < 1 || refs.length > 100) {
    throw usageError("object read requires 1..100 ObjectRef values");
  }
  if (new Set(refs).size !== refs.length) {
    throw usageError("object read does not accept duplicate ObjectRef values");
  }
  const body = parsed.booleans.has("--body");
  const pretty = parsed.booleans.has("--pretty");
  const format = parsed.values.get("--format") ?? "yaml";
  if (!body && parsed.values.has("--format")) {
    throw usageError("--format requires --body");
  }
  if (format !== "yaml" && format !== "json") {
    throw usageError("--format must be yaml or json");
  }
  if (body && format === "yaml" && pretty) {
    throw usageError("--pretty is not valid with YAML body output");
  }

  if (body && format === "yaml") {
    const result = await client.object.readText({ at, refs });
    validateTextResult(result, refs);
    process.stdout.write(formatYAML(result));
    return;
  }

  const result = await client.object.read({ at, refs });
  validateReadResult(result, refs);
  if (!body) {
    outputJSON(result, pretty);
    return;
  }
  const values = result.results.map((item) => item.value);
  outputJSON(values.length === 1 ? values[0] : values, pretty);
}

async function readRefs(
  positionals: readonly string[],
  refsFile: string | undefined
): Promise<string[]> {
  if (positionals.length !== 0 && refsFile !== undefined) {
    throw usageError("positional refs and --refs-file are mutually exclusive");
  }
  if (positionals.length !== 0) {
    return [...positionals];
  }
  if (refsFile !== undefined) {
    return splitRefs(await readTextFile(refsFile, "refs file"));
  }
  if (process.stdin.isTTY) {
    throw usageError("object read requires refs, --refs-file, or non-TTY stdin");
  }
  return splitRefs(await readStdin("refs stdin"));
}

function splitRefs(text: string): string[] {
  if (text.includes("\r")) {
    throw parseError("Object ref input contains invalid line endings");
  }
  return text.split("\n").filter((line) => line.length !== 0);
}

function validateReadResult(result: ObjectReadResult, refs: readonly string[]): void {
  if (result.state.length === 0 || result.results.length !== refs.length) {
    throw usageError("daemon returned mismatched Object read metadata");
  }
  for (let index = 0; index < refs.length; index += 1) {
    if (result.results[index]?.ref !== refs[index]) {
      throw usageError("daemon returned mismatched Object read metadata");
    }
  }
}

function validateTextResult(result: ObjectTextReadResult, refs: readonly string[]): void {
  if (result.state.length === 0 || result.results.length !== refs.length) {
    throw usageError("daemon returned mismatched Object text metadata");
  }
  for (let index = 0; index < refs.length; index += 1) {
    const item = result.results[index];
    if (item === undefined || item.ref !== refs[index] || item.body.length === 0) {
      throw usageError("daemon returned mismatched Object text metadata");
    }
  }
}

function formatYAML(result: ObjectTextReadResult): string {
  if (result.results.length === 1) {
    return result.results[0]?.body ?? "";
  }
  let output = "# kgos-state: " + result.state + "\n";
  for (const item of result.results) {
    output += "--- # kgos-ref: " + item.ref + "\n" + item.body;
  }
  return output;
}
