import type { JsonValue } from "./types.js";

function equivalent(value: JsonValue, expected: unknown): boolean {
  if (Array.isArray(value))
    return (
      Array.isArray(expected) &&
      value.length === expected.length &&
      value.every((item, index) => equivalent(item, expected[index]))
    );
  if (typeof value !== "object" || value === null) return Object.is(value, expected);
  if (typeof expected !== "object" || expected === null || Array.isArray(expected)) return false;
  return objectEquivalent(value, expected as Record<string, unknown>);
}

function objectEquivalent(
  value: Record<string, JsonValue>,
  expected: Record<string, unknown>
): boolean {
  const keys = Object.keys(value);
  const expectedKeys = Object.keys(expected).filter((key) => expected[key] !== undefined);
  return (
    keys.length === expectedKeys.length &&
    keys.every(
      (key) => Object.hasOwn(expected, key) && equivalent(value[key] ?? null, expected[key])
    )
  );
}

export function requestJSON(request: object, encoded?: string): string {
  const regular = JSON.stringify(request);
  if (encoded === undefined) return regular;
  const parsed = JSON.parse(encoded) as JsonValue;
  if (!equivalent(parsed, request))
    throw new TypeError("Exact JSON encoding must represent the same request");
  return encoded;
}
