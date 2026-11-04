import assert from "node:assert/strict";
import test from "node:test";

import { readMcpToolData, readMcpToolEnvelope } from "../scripts/mcp-tool-result.mjs";

function response(envelope) {
  return {
    content: [{ type: "text", text: JSON.stringify(envelope) }],
    structuredContent: envelope
  };
}

test("MCP result reader accepts JSON data without an old result wrapper", () => {
  for (const data of [null, false, 7, "state", [1, 2], { code: "script-value" }]) {
    assert.deepEqual(readMcpToolData(response({ code: "ok", data })), data);
  }
  assert.equal(
    readMcpToolData({ content: [{ type: "text", text: '{"code":"ok","data":null}' }] }),
    null
  );
  assert.deepEqual(readMcpToolData({ structuredContent: { code: "ok", data: [1] } }), [1]);
});

test("MCP result reader preserves a business failure with isError unset", () => {
  const failure = { code: "IO_ERROR", message: "Provider unavailable", retryable: true };
  assert.deepEqual(readMcpToolEnvelope(response(failure)), failure);
  assert.throws(() => readMcpToolData(response(failure)), /IO_ERROR/);
});

test("MCP result reader rejects malformed or inconsistent envelopes", () => {
  for (const envelope of [
    null,
    [],
    { result: 1 },
    { code: "ok" },
    { code: "ok", data: 1, message: "unexpected" },
    { code: "IO_ERROR", message: "Missing retry hint" },
    { code: "IO_ERROR", message: "", retryable: false },
    { code: "IO_ERROR", message: "Failure", retryable: false, data: 1 }
  ]) {
    assert.throws(() => readMcpToolEnvelope(response(envelope)), /invalid business envelope/);
  }
  const valid = response({ code: "ok", data: 1 });
  assert.throws(
    () => readMcpToolEnvelope({ ...valid, structuredContent: null }),
    /invalid business envelope/
  );
  assert.throws(
    () => readMcpToolEnvelope({ ...valid, structuredContent: { code: "ok", data: 2 } }),
    /disagree/
  );
  assert.throws(
    () => readMcpToolEnvelope({ content: [{ type: "text", text: "invalid-json" }] }),
    /invalid JSON/
  );
});

test("MCP result reader rejects framework failures without exposing their payload", () => {
  assert.throws(
    () => readMcpToolData({ isError: true, content: [{ type: "text", text: "private detail" }] }),
    (error) => error.message === "MCP framework did not return a business result"
  );
});
