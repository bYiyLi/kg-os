// Host-provided content is untrusted even after an authorized tool call.
export class McpReadError extends Error {
  constructor(readonly code: string | null) {
    super("MCP read failed");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resultEnvelope(call: Record<string, unknown>): unknown {
  if (call["structuredContent"] !== undefined) return call["structuredContent"];
  const content = call["content"];
  if (!Array.isArray(content)) throw new Error("MCP result has no content");
  const item: unknown = content.find(
    (entry: unknown) => isRecord(entry) && entry["type"] === "text"
  );
  if (!isRecord(item) || typeof item["text"] !== "string") {
    throw new Error("MCP result has no text");
  }
  const envelope: unknown = JSON.parse(item["text"]);
  return envelope;
}

function frameworkFailureCode(call: Record<string, unknown>): string | null {
  try {
    const envelope = resultEnvelope(call);
    return isRecord(envelope) && typeof envelope["code"] === "string" && envelope["code"] !== "ok"
      ? envelope["code"]
      : null;
  } catch {
    return null;
  }
}

export function readMcpResult(result: unknown): unknown {
  if (!isRecord(result)) throw new Error("Invalid MCP result");
  if (result["isError"] === true) throw new McpReadError(frameworkFailureCode(result));
  const envelope = resultEnvelope(result);
  if (!isRecord(envelope) || typeof envelope["code"] !== "string" || envelope["code"] === "") {
    throw new Error("Invalid MCP envelope");
  }
  if (envelope["code"] !== "ok") {
    if (
      typeof envelope["message"] !== "string" ||
      envelope["message"] === "" ||
      typeof envelope["retryable"] !== "boolean"
    ) {
      throw new Error("Invalid MCP failure envelope");
    }
    throw new McpReadError(envelope["code"]);
  }
  if (!Object.hasOwn(envelope, "data") || envelope["data"] === undefined) {
    throw new Error("Invalid MCP success envelope");
  }
  return envelope["data"];
}
