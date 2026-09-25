import { afterEach, describe, expect, it, vi } from "vitest";

import { KGOSClient } from "@kgos/sdk";

import { runGraph } from "./graph.js";
import { CLIError } from "../errors.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function graphClient(): KGOSClient {
  const request = vi.fn<typeof fetch>().mockImplementation((input, init) => {
    const path = requestPath(input);
    const accept = new Headers(init?.headers).get("Accept");
    if (accept === "application/x-ndjson") {
      return Promise.resolve(
        new Response(
          '{"type":"columns","columns":["n"]}\n' +
            '{"type":"row","row":[1]}\n' +
            '{"type":"summary","state":"commit/a","counters":{}}\n',
          { status: 200 }
        )
      );
    }
    const body = requestBody(init);
    if (path.endsWith("/query")) {
      expect(body["at"]).toBe("branch/main");
      return Promise.resolve(
        new Response(JSON.stringify({ state: "commit/a", columns: ["n"], rows: [[1]] }), {
          status: 200
        })
      );
    }
    expect(body["branch"]).toBe("main");
    return Promise.resolve(
      new Response(JSON.stringify({ state: "commit/b", columns: [], rows: [], counters: {} }), {
        status: 200
      })
    );
  });
  return new KGOSClient({ endpoint: "http://127.0.0.1:5000", token: "secret", fetch: request });
}

function requestPath(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") {
    return new URL(input).pathname;
  }
  if (input instanceof URL) {
    return input.pathname;
  }
  return new URL(input.url).pathname;
}

function requestBody(init: Parameters<typeof fetch>[1]): Record<string, unknown> {
  if (typeof init?.body !== "string") {
    return {};
  }
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe("graph CLI", () => {
  it("runs query and execute JSON modes", async () => {
    const client = graphClient();
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runGraph(client, [
      "query",
      "--at",
      "branch/main",
      "--cypher",
      "RETURN $n",
      "--params",
      '{"n":1}',
      "--pretty"
    ]);
    expect(String(write.mock.calls.at(-1)?.[0])).toContain('"rows"');
    write.mockClear();
    await runGraph(client, [
      "execute",
      "--branch",
      "main",
      "--cypher",
      "RETURN 1",
      "--author",
      "a",
      "--message",
      "m"
    ]);
    expect(String(write.mock.calls.at(-1)?.[0])).toContain('"counters"');
  });

  it("writes streaming events incrementally", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runGraph(graphClient(), [
      "execute",
      "--branch",
      "main",
      "--cypher",
      "RETURN 1",
      "--stream"
    ]);
    expect(write.mock.calls.map((call) => String(call[0]))).toEqual([
      '{"type":"columns","columns":["n"]}\n',
      '{"type":"row","row":[1]}\n',
      '{"type":"summary","state":"commit/a","counters":{}}\n'
    ]);
  });

  it("rejects invalid command-specific option combinations and params", async () => {
    const client = graphClient();
    await expect(
      runGraph(client, ["query", "--branch", "main", "--cypher", "RETURN 1", "--at", "x"])
    ).rejects.toBeInstanceOf(CLIError);
    await expect(
      runGraph(client, ["execute", "--at", "x", "--branch", "main", "--cypher", "RETURN 1"])
    ).rejects.toBeInstanceOf(CLIError);
    await expect(
      runGraph(client, ["query", "--at", "x", "--cypher", "RETURN 1", "--params", "[]"])
    ).rejects.toBeInstanceOf(CLIError);
    await expect(runGraph(client, ["unknown"])).rejects.toBeInstanceOf(CLIError);
  });
});
