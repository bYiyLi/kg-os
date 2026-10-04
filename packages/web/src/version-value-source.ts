import { type RequestOptions } from "@kgos/sdk";

import { jsonArraySources, jsonSourceField, stableSourceJSON } from "./json-source.js";
import { isObject } from "./json.js";

export async function readSourced<T>(
  read: (options: RequestOptions) => Promise<T>,
  signal: AbortSignal
) {
  let source: string | undefined;
  const value = await read({
    signal,
    onJSONResponse: (text) => {
      source = text;
    }
  });
  return { value, source };
}

export function sourceField(source: string | undefined, field: string) {
  return source === undefined ? undefined : jsonSourceField(source, field);
}

export function eachSource<T>(
  source: string | undefined,
  items: T[],
  consume: (item: T, source: string) => void,
  field = "items"
) {
  const array = sourceField(source, field);
  const sources = array === undefined ? [] : jsonArraySources(array);
  items.forEach((item, index) => {
    const raw = sources[index];
    if (raw !== undefined) consume(item, raw);
  });
}

export function sourceIdentity(source: string, omit: string) {
  const value: unknown = JSON.parse(source);
  if (!isObject(value)) throw new TypeError("Expected an object source for conflict identity");
  const fields = Object.keys(value)
    .filter((field) => field !== omit)
    .map((field) => `${JSON.stringify(field)}:${sourceField(source, field) ?? "null"}`);
  return stableSourceJSON(`{${fields.join(",")}}`);
}
