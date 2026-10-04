import type { JsonValue } from "./types.js";
import type { WebCacheWriteRequest } from "./web-types.js";

function encode(value: JsonValue): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite Graph values require a Float tag");
    if (Object.is(value, -0)) return "-0.0";
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) return value.toExponential();
  }
  if (Array.isArray(value)) return `[${value.map(encode).join(",")}]`;
  if (typeof value === "object" && value !== null)
    return `{${Object.entries(value)
      .map(([key, item]) => `${JSON.stringify(key)}:${encode(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

// JSON.parse retains these Float values as Number; ordinary stringify loses their wire type.
export function serializeWebCache(request: WebCacheWriteRequest): string {
  return encode({
    storeId: request.storeId,
    frameId: request.frameId,
    frameRevision: request.frameRevision,
    result: {
      state: request.result.state,
      columns: request.result.columns,
      rows: request.result.rows,
      valueEncoding: request.result.valueEncoding
    }
  });
}
