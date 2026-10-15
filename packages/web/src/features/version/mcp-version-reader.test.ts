import type { App as McpApp } from "@modelcontextprotocol/ext-apps";
import { expect, it, vi } from "vitest";

import { loadVersions, stateRef } from "./version-data.js";
import { createMcpVersionReader } from "./mcp-version-reader.js";

function success(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ result }) }] };
}

const main = stateRef("a".repeat(64));
const shared = stateRef("b".repeat(64));
const experiment = stateRef("c".repeat(64));
const timestamp = Date.now() * 1000;

function fixture() {
  const callServerTool = vi.fn<McpApp["callServerTool"]>().mockImplementation((params) => {
    const code = params.arguments?.["code"];
    if (code === "return await evolution.branch.list()") {
      return Promise.resolve(
        success({
          items: [
            { name: "main", state: main },
            { name: "experiment", state: experiment }
          ]
        })
      );
    }
    if (code === "return await evolution.tag.list()") {
      return Promise.resolve(success({ items: [{ name: "v1", state: shared }] }));
    }
    if (typeof code === "string" && code.startsWith("return await evolution.ancestry(")) {
      const root = code.includes(main) ? main : experiment;
      return Promise.resolve(
        success({
          root,
          items:
            root === main
              ? [{ state: main, parents: [shared], committedAt: timestamp, message: "Main" }]
              : [
                  { state: experiment, parents: [shared], committedAt: timestamp - 1 },
                  { state: shared, parents: null, committedAt: timestamp - 2 }
                ]
        })
      );
    }
    if (typeof code === "string" && code.startsWith("const item = await evolution.get(")) {
      return Promise.resolve(success({ state: shared }));
    }
    throw new Error("Unexpected MCP script");
  });
  const onTransportFailure = vi.fn();
  const reader = createMcpVersionReader({ callServerTool }, onTransportFailure);
  return { callServerTool, onTransportFailure, reader };
}

it("uses only kgos_read for Branch/Tag/Ancestry/Get and forwards cancellation", async () => {
  const { callServerTool, reader, onTransportFailure } = fixture();
  const controller = new AbortController();
  const snapshot = await loadVersions(reader, controller.signal);
  expect(snapshot.branches.map((b) => b.name)).toEqual(["main", "experiment"]);
  expect(snapshot.tags).toEqual([{ name: "v1", state: shared }]);
  expect(snapshot.pages["experiment"]?.items.at(-1)?.parents).toEqual([]);
  expect(callServerTool).toHaveBeenCalledTimes(4);
  expect(callServerTool.mock.calls.every(([params]) => params.name === "kgos_read")).toBe(true);
  expect(
    callServerTool.mock.calls.every(([, options]) => options?.signal === controller.signal)
  ).toBe(true);
  expect(onTransportFailure).not.toHaveBeenCalled();

  await reader.get({ state: shared }, { signal: controller.signal });
  const last = callServerTool.mock.calls.at(-1)?.[0];
  expect(last?.arguments?.["code"]).toBe(
    `const item = await evolution.get({"state":"${shared}"}); return { state: item.state }`
  );
});

it("serializes opaque cursor and untrusted StateRef safely without code execution", async () => {
  const { reader, callServerTool } = fixture();
  const cursor = '"); throw new Error("script injection"); //\n';
  const request = { root: main, limit: 12, cursor };
  await reader.ancestry(request);
  expect(callServerTool).toHaveBeenCalledWith(
    {
      name: "kgos_read",
      arguments: { code: `return await evolution.ancestry(${JSON.stringify(request)})` }
    },
    undefined
  );
});

it("rejects errors returned as MCP content without treating them as host loss", async () => {
  const { callServerTool, reader, onTransportFailure } = fixture();
  callServerTool.mockResolvedValueOnce({
    isError: true,
    content: [{ type: "text", text: '{"code":"NOT_FOUND","message":"unavailable"}' }]
  });
  await expect(reader.branch.list()).rejects.toThrow("MCP read failed");
  expect(onTransportFailure).not.toHaveBeenCalled();
  callServerTool.mockResolvedValueOnce(success({ unexpected: true }));
  await expect(loadVersions(reader, new AbortController().signal)).rejects.toThrow(
    "Invalid Evolution ref response"
  );
  expect(onTransportFailure).not.toHaveBeenCalled();
});

it.each(["AUTHENTICATION_FAILED", "PERMISSION_DENIED"])(
  "invalidates the host for MCP authorization errors: %s",
  async (code) => {
    const { callServerTool, reader, onTransportFailure } = fixture();
    callServerTool.mockResolvedValueOnce({
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ code, message: "access denied" }) }]
    });
    await expect(reader.branch.list()).rejects.toThrow("MCP read failed");
    expect(onTransportFailure).toHaveBeenCalledExactlyOnceWith();
  }
);

it("keeps a malformed MCP error local when its authorization code is unknown", async () => {
  const { callServerTool, reader, onTransportFailure } = fixture();
  callServerTool.mockResolvedValueOnce({
    isError: true,
    content: [{ type: "text", text: "{not-json" }]
  });
  await expect(reader.tag.list()).rejects.toThrow("MCP read failed");
  expect(onTransportFailure).not.toHaveBeenCalled();
});

it("handles an already-aborted read without making a Bridge call", async () => {
  const { reader, callServerTool, onTransportFailure } = fixture();
  const controller = new AbortController();
  controller.abort();
  await expect(reader.tag.list({ signal: controller.signal })).rejects.toThrow();
  expect(callServerTool).not.toHaveBeenCalled();
  expect(onTransportFailure).not.toHaveBeenCalled();
});

it("ignores a late Bridge success after cancellation", async () => {
  const { reader, callServerTool, onTransportFailure } = fixture();
  let resolveResult: ((value: ReturnType<typeof success>) => void) | undefined;
  callServerTool.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveResult = resolve;
      })
  );
  const controller = new AbortController();
  const pending = reader.tag.list({ signal: controller.signal });
  controller.abort();
  resolveResult?.(success({ items: [] }));
  await expect(pending).rejects.toThrow();
  expect(onTransportFailure).not.toHaveBeenCalled();
});

it("does not invalidate the host for a rejected cancelled Bridge call", async () => {
  const { reader, callServerTool, onTransportFailure } = fixture();
  let rejectResult: ((reason: Error) => void) | undefined;
  callServerTool.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectResult = reject;
      })
  );
  const controller = new AbortController();
  const pending = reader.tag.list({ signal: controller.signal });
  controller.abort();
  rejectResult?.(new Error("cancelled by host"));
  await expect(pending).rejects.toThrow("cancelled by host");
  expect(onTransportFailure).not.toHaveBeenCalled();
});

it("invalidates the host when the Bridge rejects an active request", async () => {
  const { reader, callServerTool, onTransportFailure } = fixture();
  callServerTool.mockRejectedValueOnce(new Error("OAuth authorization revoked"));
  await expect(reader.branch.list()).rejects.toThrow("OAuth authorization revoked");
  expect(onTransportFailure).toHaveBeenCalledExactlyOnceWith();
});
