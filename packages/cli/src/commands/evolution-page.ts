import { optionalInteger, parseOptions, type ParsedOptions } from "../args.js";
import { usageError } from "../errors.js";

export function parseEvolutionPage(args: readonly string[]): ParsedOptions {
  const parsed = parseOptions(args, { value: ["--limit", "--cursor"] });
  if (parsed.positionals.length !== 0) {
    throw usageError("pagination options do not accept positional arguments");
  }
  optionalInteger(parsed, "--limit", 1, 1000);
  return parsed;
}

export function addEvolutionPage(
  request: { limit?: number; cursor?: string },
  parsed: ParsedOptions
): void {
  const limit = optionalInteger(parsed, "--limit", 1, 1000);
  const cursor = parsed.values.get("--cursor");
  if (limit !== undefined) {
    request.limit = limit;
  }
  if (cursor !== undefined) {
    request.cursor = cursor;
  }
}
