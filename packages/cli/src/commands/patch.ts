import type { PatchRequest } from "@kgos/sdk";

import { parseOptions, requiredValue } from "../args.js";
import { usageError } from "../errors.js";
import { readStdin, readTextFile, requireNonEmptyText } from "../io.js";

export async function parsePatchRequest(
  args: readonly string[],
  command: string
): Promise<PatchRequest> {
  const parsed = parseOptions(args, {
    value: ["--base-state", "--branch", "--patch", "--patch-file", "--author", "--message"]
  });
  if (parsed.positionals.length !== 0) {
    throw usageError(command + " does not accept positional arguments");
  }
  const baseState = requiredValue(parsed, "--base-state");
  if (!isResolvedState(baseState)) {
    throw usageError("--base-state must be commit/<64-hex>");
  }
  const branch = requiredValue(parsed, "--branch");
  const inline = parsed.values.get("--patch");
  const file = parsed.values.get("--patch-file");
  if (inline !== undefined && file !== undefined) {
    throw usageError("--patch and --patch-file are mutually exclusive");
  }
  if (inline === undefined && file === undefined && process.stdin.isTTY) {
    throw usageError(command + " requires --patch, --patch-file, or non-TTY stdin");
  }
  let patchText: string;
  if (inline !== undefined) {
    patchText = inline;
  } else if (file !== undefined) {
    patchText = await readTextFile(file, "patch file");
  } else {
    patchText = await readStdin("patch stdin");
  }
  const patch = requireNonEmptyText(patchText, "patch");
  const request: PatchRequest = { baseState, branch, patch };
  const author = parsed.values.get("--author");
  const message = parsed.values.get("--message");
  if (author !== undefined) {
    request.author = author;
  }
  if (message !== undefined) {
    request.message = message;
  }
  return request;
}

export function isResolvedState(value: string): boolean {
  return /^commit\/[0-9a-f]{64}$/.test(value);
}
