import { expect, it } from "vitest";

import { McpReadError, readMcpResult } from "./mcp-read.js";

function textResult(envelope: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(envelope) }] };
}

function readFailure(result: unknown): unknown {
  try {
    return readMcpResult(result);
  } catch (error) {
    return error;
  }
}

const businessFailure = {
  code: "RESOURCE_ERROR",
  message: "Request fewer results",
  retryable: false
};

it.each([null, false, 0, "", [], { code: "SCRIPT_ERROR", message: "application value" }])(
  "returns the actual JSON value without interpreting script data: %j",
  (data) => {
    expect(readMcpResult(textResult({ code: "ok", data }))).toEqual(data);
  }
);

it("prefers a structured envelope without parsing the text fallback", () => {
  expect(
    readMcpResult({
      structuredContent: { code: "ok", data: { state: "pinned" } },
      content: [{ type: "text", text: "not JSON" }]
    })
  ).toEqual({ state: "pinned" });
});

it("finds the text fallback when the host supplies no structured content", () => {
  expect(
    readMcpResult({
      content: [null, { type: "image", data: "" }, ...textResult({ code: "ok", data: 42 }).content]
    })
  ).toBe(42);
});

it.each([undefined, false])("rejects business failures regardless of isError=%s", (isError) => {
  const error = readFailure({ ...textResult(businessFailure), isError });
  expect(error).toBeInstanceOf(McpReadError);
  expect(error).toMatchObject({ code: businessFailure.code });
});

it("does not replace malformed structured content with a successful text fallback", () => {
  expect(() =>
    readMcpResult({
      structuredContent: null,
      ...textResult({ code: "ok", data: "must not be accepted" })
    })
  ).toThrow("Invalid MCP envelope");
});

it.each([
  null,
  [],
  42,
  {},
  { result: "legacy success" },
  { code: "" },
  { code: "ok" },
  { code: "RESOURCE_ERROR" },
  { code: "RESOURCE_ERROR", message: "limit" },
  { code: "RESOURCE_ERROR", message: "", retryable: false },
  { code: "RESOURCE_ERROR", message: 4, retryable: false },
  { code: "RESOURCE_ERROR", message: "limit", retryable: "false" }
])("rejects malformed or retired envelopes: %j", (envelope) => {
  expect(() => readMcpResult(textResult(envelope))).toThrow();
});

it.each([null, [], 42, {}, { content: [] }, { content: [{ type: "text", text: null }] }])(
  "rejects malformed tool results: %j",
  (result) => {
    expect(() => readMcpResult(result)).toThrow();
  }
);

it("preserves a public authorization code from a framework fallback", () => {
  const error = readFailure({
    isError: true,
    structuredContent: { code: "AUTHENTICATION_FAILED", message: "unavailable" }
  });
  expect(error).toBeInstanceOf(McpReadError);
  expect(error).toMatchObject({ code: "AUTHENTICATION_FAILED" });
});

it.each([{ content: [] }, textResult({ code: "ok", data: "not successful" }), textResult([])])(
  "keeps a framework failure failed even without a useful public code: %j",
  (result) => {
    const error = readFailure({ ...result, isError: true });
    expect(error).toBeInstanceOf(McpReadError);
    expect(error).toMatchObject({ code: null });
  }
);

it("rejects a structured success whose data is undefined", () => {
  expect(() => readMcpResult({ structuredContent: { code: "ok", data: undefined } })).toThrow(
    "Invalid MCP success envelope"
  );
});
