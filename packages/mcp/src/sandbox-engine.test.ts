import { describe, expect, it } from "vitest";

import { runSandboxEngine, type BridgeChannel, type BridgeReply } from "./sandbox-engine.js";

interface RequestMessage {
  method: string;
  args: unknown[];
}

type Stub = (request: RequestMessage) => unknown;

async function runGuest(
  code: string,
  stub: Stub = () => null,
  deadlineMs = 2000
): Promise<unknown> {
  let reply: ((message: BridgeReply) => void) | undefined;
  let receive: (value: unknown) => void = () => undefined;
  const completed = new Promise<unknown>((resolve) => {
    receive = resolve;
  });
  const channel: BridgeChannel = {
    postMessage(value) {
      if (value["type"] === "complete" && typeof value["json"] === "string") {
        receive(JSON.parse(value["json"]) as unknown);
        return;
      }
      if (value["type"] === "failure") {
        receive(value);
        return;
      }
      if (
        value["type"] !== "call" ||
        typeof value["id"] !== "number" ||
        typeof value["request"] !== "string"
      ) {
        throw new Error("Unexpected engine bridge message");
      }
      const id = value["id"];
      const request = JSON.parse(value["request"]) as RequestMessage;
      void Promise.resolve()
        .then(async () => await stub(request))
        .then(
          (answer) => {
            reply?.({ type: "resolve", id, json: JSON.stringify(answer) });
          },
          () => {
            reply?.({
              type: "reject",
              id,
              code: "PUBLIC_ERROR",
              message: "Expected SDK failure",
              details: { reason: "invalid" }
            });
          }
        );
    },
    onMessage(listener) {
      reply = listener;
    },
    removeMessageListeners() {
      reply = undefined;
    }
  };
  await runSandboxEngine(
    {
      code,
      deadline: Date.now() + deadlineMs,
      memoryBytes: 64 * 1024 * 1024
    },
    channel
  );
  return await completed;
}

describe("QuickJS WASM engine (same runtime as the isolated Worker)", () => {
  it("executes async computation, JSON output and ordinary JS without host globals", async () => {
    const value = await runGuest(`
      const pairs = new Map([["a", 1], ["b", 2]]);
      const sum = Array.from(pairs.values()).reduce((a,b) => a+b,0);
      return { sum, array: [...new Set(["a","b","a"])],
        processType:typeof process, fetchType:typeof fetch,
        requireType:typeof require, globalType:typeof globalThis };
    `);
    expect(value).toEqual({
      ok: true,
      value: {
        sum: 3,
        array: ["a", "b"],
        processType: "undefined",
        fetchType: "undefined",
        requireType: "undefined",
        globalType: "object"
      }
    });
  });

  it("supports concurrently pending SDK calls and incremental graph iteration", async () => {
    const seen: string[] = [];
    const rows = [
      { type: "columns", columns: ["name"] },
      { type: "row", row: ["Alice"] },
      { type: "summary", state: "commit/a" }
    ];
    let position = 0;
    const result = await runGuest(
      `
      const [a,b] = await Promise.all([evolution.overview(), evolution.overview()]);
      const events = [];
      for await(const value of graph.streamQuery({at:a.state,cypher:"RETURN 1"})) {
        events.push(value.type);
      }
      return { versions: [a.state,b.state], events };
    `,
      (request) => {
        seen.push(request.method);
        if (request.method === "evolution.overview") return { state: "commit/a" };
        if (request.method === "stream-open") return { streamId: "s" };
        if (request.method === "stream-next") {
          const value = rows[position++];
          return value === undefined ? { done: true } : { done: false, value };
        }
        if (request.method === "stream-return") return null;
        throw new Error("Unknown bridge request");
      }
    );
    expect(result).toEqual({
      ok: true,
      value: { versions: ["commit/a", "commit/a"], events: ["columns", "row", "summary"] }
    });
    expect(seen.filter((method) => method === "stream-next")).toHaveLength(4);
  });

  it("retains bounded public errors including details for caller catch and uncaught errors", async () => {
    const errorStub = () => {
      throw new Error("SDK failed");
    };
    const caught = await runGuest(
      `
      try { await evolution.overview(); }
      catch (e) { return {code:e.code, message:e.message, details:e.details}; }
      return null;
    `,
      errorStub
    );
    expect(caught).toMatchObject({
      ok: true,
      value: { code: "PUBLIC_ERROR", details: { reason: "invalid" } }
    });
    const failed = await runGuest("await evolution.overview(); return null;", errorStub);
    expect(failed).toMatchObject({
      ok: false,
      code: "PUBLIC_ERROR",
      details: { reason: "invalid" }
    });
  });

  it("rejects unsupported JSON results, circular and accessor-based values", async () => {
    for (const code of [
      "return undefined",
      "return 1n",
      "return Infinity",
      "return {a:undefined}",
      "return new Date()",
      "return { get value(){return 5;} }",
      "const v={};v.self=v;return v",
      "return [1,,3]",
      "return ()=>3"
    ]) {
      const result = await runGuest(code);
      expect(result).toMatchObject({ ok: false, code: "SCRIPT_ERROR" });
    }
  });

  it("terminates CPU-bound loops and malformed JS without accessing host files", async () => {
    const interrupted = await runGuest("while(true) {}", () => null, 80);
    expect(interrupted).toMatchObject({ type: "failure", code: "RESOURCE_ERROR" });
    const malformed = await runGuest("this is not valid JavaScript {");
    expect(malformed).toMatchObject({ type: "failure", code: "SCRIPT_ERROR" });
  }, 10_000);
});
