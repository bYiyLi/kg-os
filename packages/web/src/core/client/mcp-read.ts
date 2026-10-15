// The KG OS Go MCP tool wraps JSON-compatible sandbox returns in { result }.
// Host-provided content is untrusted even after an authorized tool call.
export class McpReadError extends Error {
  constructor(readonly code: string | null) {
    super("MCP read failed");
  }
}

function mcpFailureCode(text: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("code" in value) ||
    typeof value.code !== "string"
  ) {
    return null;
  }
  return value.code;
}

export function readMcpResult(result: unknown): unknown {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error("Invalid MCP result");
  }
  const call = result as Record<string, unknown>;
  const content = call["content"];
  if (!Array.isArray(content)) {
    if (call["isError"] === true) throw new McpReadError(null);
    throw new Error("MCP result has no content");
  }
  const item: unknown = content.find(
    (entry: unknown) =>
      typeof entry === "object" &&
      entry !== null &&
      (entry as Record<string, unknown>)["type"] === "text"
  );
  if (call["isError"] === true) {
    const errorText =
      typeof item === "object" && item !== null && "text" in item && typeof item.text === "string"
        ? item.text
        : "";
    throw new McpReadError(mcpFailureCode(errorText));
  }
  if (
    typeof item !== "object" ||
    item === null ||
    !("text" in item) ||
    typeof item.text !== "string"
  ) {
    throw new Error("MCP result has no text");
  }
  const envelope: unknown = JSON.parse(item.text);
  if (
    typeof envelope !== "object" ||
    envelope === null ||
    Array.isArray(envelope) ||
    !("result" in envelope)
  ) {
    throw new Error("Invalid MCP envelope");
  }
  return envelope.result;
}
