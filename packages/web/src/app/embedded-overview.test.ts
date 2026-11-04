// @vitest-environment jsdom

import { expect, it } from "vitest";

import { readOverview } from "./embedded-app.js";

const textType = "text";

it("rejects errors and untrusted result envelopes", () => {
  expect(() => readOverview({ isError: true, content: [] })).toThrow();
  expect(() => readOverview({ content: [] })).toThrow();
  expect(() => readOverview({ content: [{ type: textType, text: "{}" }] })).toThrow();
  expect(() =>
    readOverview({
      content: [{ type: textType, text: '{"code":"ok","data":{"state":"","defaultBranch":2}}' }]
    })
  ).toThrow();
});

it.each([
  null,
  15,
  [],
  {},
  { isError: true, content: [] },
  { content: [] },
  { content: [null] },
  { content: [false, { type: "image", data: "" }] },
  { content: [{ type: textType, text: null }] },
  { content: [{ type: textType, text: "null" }] },
  { content: [{ type: textType, text: "[]" }] },
  { content: [{ type: textType, text: "42" }] },
  { content: [{ type: textType, text: '{"code":"ok","data":null}' }] },
  { content: [{ type: textType, text: '{"code":"ok","data":[]}' }] },
  {
    content: [{ type: textType, text: '{"code":"ok","data":{"state":"","defaultBranch":"main"}}' }]
  },
  { content: [{ type: textType, text: '{"code":"ok","data":{"state":"x","defaultBranch":""}}' }] },
  {
    content: [{ type: textType, text: '{"code":"ok","data":{"state":42,"defaultBranch":"main"}}' }]
  }
])("rejects malformed MCP results %#", (result) => {
  expect(() => readOverview(result)).toThrow();
});
