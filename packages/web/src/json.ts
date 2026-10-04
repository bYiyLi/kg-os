import { type JsonObject, type JsonValue } from "@kgos/sdk";

export function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseObject(text: string): JsonObject {
  const value: unknown = JSON.parse(text);
  if (!isObject(value)) throw new Error("参数必须是 JSON 对象");
  return value;
}

export function textField(data: JsonObject, key: string, fallback = ""): string {
  const value = data[key];
  return typeof value === "string" ? value : fallback;
}

export function numberField(data: JsonObject, key: string, fallback = 0): number {
  const value = data[key];
  return typeof value === "number" ? value : fallback;
}

export function stableJSON(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(",")}]`;
  if (isObject(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJSON(value[key] ?? null)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export function shorten(state: string): string {
  return state.replace(/^commit\//, "").slice(0, 8);
}
