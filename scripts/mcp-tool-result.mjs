import { isDeepStrictEqual } from "node:util";

function validEnvelope(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.code === "ok") {
    return (
      Object.hasOwn(value, "data") &&
      Object.keys(value).every((key) => ["code", "data"].includes(key))
    );
  }
  return (
    typeof value.code === "string" &&
    /^[A-Z][A-Z0-9_]*$/.test(value.code) &&
    typeof value.message === "string" &&
    value.message.trim().length > 0 &&
    typeof value.retryable === "boolean" &&
    Object.keys(value).every((key) => ["code", "message", "retryable", "details"].includes(key))
  );
}

export function readMcpToolEnvelope(response) {
  if (response === null || typeof response !== "object" || response.isError === true) {
    throw new Error("MCP framework did not return a business result");
  }
  let textValue;
  const text = response.content?.[0];
  if (text?.type === "text") {
    try {
      textValue = JSON.parse(text.text);
    } catch {
      throw new Error("MCP tool returned invalid JSON text");
    }
  }
  const envelope = Object.hasOwn(response, "structuredContent")
    ? response.structuredContent
    : textValue;
  if (!validEnvelope(envelope)) throw new Error("MCP tool returned an invalid business envelope");
  if (textValue !== undefined && !isDeepStrictEqual(envelope, textValue)) {
    throw new Error("MCP text and structured results disagree");
  }
  return envelope;
}

export function readMcpToolData(response) {
  const envelope = readMcpToolEnvelope(response);
  if (envelope.code !== "ok") {
    throw new Error("MCP tool operation failed: " + envelope.code);
  }
  return envelope.data;
}
