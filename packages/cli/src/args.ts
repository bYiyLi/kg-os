import { resolve } from "node:path";

import { usageError } from "./errors.js";

export interface RootArguments {
  root: string;
  args: string[];
}

export function extractRoot(args: readonly string[]): RootArguments {
  const remaining: string[] = [];
  let root: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value !== "--root") {
      remaining.push(value ?? "");
      continue;
    }
    if (root !== undefined) {
      throw usageError("--root may be provided only once");
    }
    const next = args[index + 1];
    if (next === undefined || next.length === 0 || next.startsWith("--")) {
      throw usageError("--root requires a path");
    }
    root = next;
    index += 1;
  }
  if (root === undefined) {
    throw usageError("--root is required");
  }
  return { root: resolve(root), args: remaining };
}

export interface OptionSpec {
  boolean?: readonly string[];
  value?: readonly string[];
}

export interface ParsedOptions {
  positionals: string[];
  booleans: Set<string>;
  values: Map<string, string>;
}

export function parseOptions(args: readonly string[], spec: OptionSpec): ParsedOptions {
  const booleanNames = new Set(spec.boolean ?? []);
  const valueNames = new Set(spec.value ?? []);
  const parsed: ParsedOptions = {
    positionals: [],
    booleans: new Set<string>(),
    values: new Map<string, string>()
  };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index] ?? "";
    if (!value.startsWith("--")) {
      parsed.positionals.push(value);
      continue;
    }
    if (booleanNames.has(value)) {
      if (parsed.booleans.has(value)) {
        throw usageError(value + " may be provided only once");
      }
      parsed.booleans.add(value);
      continue;
    }
    if (!valueNames.has(value)) {
      throw usageError("unknown option " + JSON.stringify(value));
    }
    if (parsed.values.has(value)) {
      throw usageError(value + " may be provided only once");
    }
    const next = args[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw usageError(value + " requires a value");
    }
    parsed.values.set(value, next);
    index += 1;
  }
  return parsed;
}

export function requiredValue(parsed: ParsedOptions, name: string): string {
  const value = parsed.values.get(name);
  if (value === undefined || value.length === 0) {
    throw usageError(name + " is required");
  }
  return value;
}

export function optionalInteger(
  parsed: ParsedOptions,
  name: string,
  minimum: number,
  maximum: number
): number | undefined {
  const raw = parsed.values.get(name);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw usageError(
      `${name} must be an integer between ${String(minimum)} and ${String(maximum)}`
    );
  }
  return value;
}

export function requiredInteger(parsed: ParsedOptions, name: string, minimum = 0): number {
  const raw = requiredValue(parsed, name);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw usageError(`${name} must be an integer >= ${String(minimum)}`);
  }
  return value;
}

export function assertPositionals(
  parsed: ParsedOptions,
  minimum: number,
  maximum: number,
  label: string
): void {
  if (parsed.positionals.length < minimum || parsed.positionals.length > maximum) {
    throw usageError(label);
  }
}
