import type { KGOSClient, OntologyReadResult, ObjectTextReadResult } from "@kgos/sdk";

import { extractPretty, optionalInteger, parseOptions, requiredValue } from "../args.js";
import { usageError } from "../errors.js";
import { outputJSON } from "../io.js";
import { isResolvedState, parsePatchRequest } from "./patch.js";

export async function runOntology(client: KGOSClient, args: readonly string[]): Promise<void> {
  if (args[0] === "patch") {
    const { args: patchArgs, pretty } = extractPretty(args.slice(1));
    const request = await parsePatchRequest(patchArgs, "ontology patch");
    outputJSON(await client.ontology.patch(request), pretty);
    return;
  }

  const parsed = parseOptions(args, {
    boolean: ["--edit"],
    value: ["--at", "--limit", "--cursor"]
  });
  const at = requiredValue(parsed, "--at");
  const refs = parsed.positionals;
  if (refs.length > 100 || new Set(refs).size !== refs.length) {
    throw usageError("ontology read accepts at most 100 unique OntologyRef values");
  }
  const edit = parsed.booleans.has("--edit");
  if (edit) {
    if (!isResolvedState(at)) {
      throw usageError("--edit --at must be commit/<64-hex>");
    }
    if (refs.length < 1) {
      throw usageError("--edit requires 1..100 OntologyRef values");
    }
    if (parsed.values.has("--limit") || parsed.values.has("--cursor")) {
      throw usageError("--edit does not accept --limit or --cursor");
    }
    const result = await client.object.readText({ at, refs: [...refs] });
    validateEdit(result, refs, at);
    process.stdout.write(formatEdit(result));
    return;
  }

  const request: { at: string; refs?: string[]; limit?: number; cursor?: string } = { at };
  if (refs.length !== 0) {
    request.refs = [...refs];
  }
  const limit = optionalInteger(parsed, "--limit", 1, 1000);
  if (limit !== undefined) {
    request.limit = limit;
  }
  const cursor = parsed.values.get("--cursor");
  if (cursor !== undefined) {
    request.cursor = cursor;
  }
  const result = await client.ontology.read(request);
  process.stdout.write(formatRead(result));
}

function validateEdit(result: ObjectTextReadResult, refs: readonly string[], at: string): void {
  if (result.state !== at || result.results.length !== refs.length) {
    throw usageError("daemon returned mismatched Ontology edit metadata");
  }
  for (let index = 0; index < refs.length; index += 1) {
    const item = result.results[index];
    if (
      item === undefined ||
      item.ref !== refs[index] ||
      !["domain", "node-definition", "relationship-definition"].includes(item.kind) ||
      item.body.length === 0
    ) {
      throw usageError("daemon returned mismatched Ontology edit metadata");
    }
  }
}

function formatEdit(result: ObjectTextReadResult): string {
  if (result.results.length === 1) {
    return result.results[0]?.body ?? "";
  }
  let output = "# kgos-state: " + result.state + "\n";
  for (const item of result.results) {
    output += "--- # kgos-ref: " + item.ref + "\n" + item.body;
  }
  return output;
}

function formatRead(result: OntologyReadResult): string {
  if (result.state.length === 0 || result.results.length === 0) {
    throw usageError("daemon returned an incomplete Ontology read result");
  }
  if (result.results.length === 1) {
    const markdown = result.results[0]?.markdown ?? "";
    if (markdown.length === 0) {
      throw usageError("daemon returned an empty Ontology Markdown body");
    }
    return markdown;
  }
  let output =
    '---\nstate: "' +
    escapeQuoted(result.state) +
    '"\nkind: "batch"\ncount: ' +
    String(result.results.length) +
    "\n---\n";
  for (const item of result.results) {
    const body = stripFrontMatter(item.markdown);
    if (body.length === 0) {
      throw usageError("daemon returned an empty Ontology Markdown body");
    }
    output +=
      "\n---\nref: " + (item.ref === undefined ? "null" : '"' + escapeQuoted(item.ref) + '"');
    output +=
      '\nkind: "' + escapeQuoted(item.kind) + '"\ntotal: ' + String(item.total) + "\ncursor: ";
    output += item.cursor === undefined ? "null" : '"' + escapeQuoted(item.cursor) + '"';
    output += "\n---\n" + body;
  }
  return output;
}

function stripFrontMatter(markdown: string): string {
  if (!markdown.startsWith("---\n")) {
    return markdown;
  }
  const index = markdown.indexOf("\n---\n", 4);
  return index < 0 ? markdown : markdown.slice(index + 5);
}

function escapeQuoted(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
