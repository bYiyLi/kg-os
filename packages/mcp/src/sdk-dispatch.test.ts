import { KGOSClient } from "@kgos/sdk";
import { describe, expect, it, vi } from "vitest";

import { executeScript } from "./sandbox.js";
import { invoke, READ_METHODS, streamSdk, STREAM_METHODS, WRITE_METHODS } from "./sdk-dispatch.js";

const readPaths: Record<string, string> = {
  "ontology.read": "/ontology/read",
  "object.read": "/object/read",
  "object.readText": "/object/read-text",
  "graph.query": "/graph/query",
  "evolution.overview": "/evolution/overview",
  "evolution.get": "/evolution/get",
  "evolution.ancestry": "/evolution/ancestry",
  "evolution.history": "/evolution/history",
  "evolution.diff": "/evolution/diff",
  "evolution.branch.list": "/evolution/branch/list",
  "evolution.tag.list": "/evolution/tag/list",
  "evolution.merge.list": "/evolution/merge/list",
  "evolution.merge.get": "/evolution/merge/get",
  "evolution.merge.conflicts": "/evolution/merge/conflicts"
};

const writePaths: Record<string, string> = {
  "ontology.patch": "/ontology/patch",
  "object.patch": "/object/patch",
  "graph.execute": "/graph/execute",
  "evolution.state.create": "/evolution/state/create",
  "evolution.state.setData": "/evolution/state/set-data",
  "evolution.state.clearData": "/evolution/state/clear-data",
  "evolution.branch.create": "/evolution/branch/create",
  "evolution.branch.delete": "/evolution/branch/delete",
  "evolution.tag.create": "/evolution/tag/create",
  "evolution.tag.move": "/evolution/tag/move",
  "evolution.tag.delete": "/evolution/tag/delete",
  "evolution.merge.start": "/evolution/merge/start",
  "evolution.merge.resolve": "/evolution/merge/resolve",
  "evolution.merge.finalize": "/evolution/merge/finalize",
  "evolution.merge.abort": "/evolution/merge/abort"
};

function fixture() {
  const requests: { path: string; headers: Headers; body: unknown }[] = [];
  const network = vi.fn<typeof fetch>((input, init) => {
    let inputUrl: string;
    if (typeof input === "string") inputUrl = input;
    else if (input instanceof URL) inputUrl = input.href;
    else inputUrl = input.url;
    const path = new URL(inputUrl).pathname;
    requests.push({
      path,
      headers: new Headers(init?.headers),
      body: JSON.parse(typeof init?.body === "string" ? init.body : "{}") as unknown
    });
    if (new Headers(init?.headers).get("Accept") === "application/x-ndjson") {
      return Promise.resolve(
        new Response(
          '{"type":"columns","columns":["x"]}\n{"type":"summary","state":"commit/a"}\n',
          { status: 200 }
        )
      );
    }
    return Promise.resolve(new Response(JSON.stringify({ path }), { status: 200 }));
  });
  const client = new KGOSClient({
    endpoint: "http://127.0.0.1:7731",
    token: "private-token",
    fetch: network
  });
  return { client, requests };
}

const options = { signal: new AbortController().signal };
const request = {
  at: "commit/a",
  baseState: "commit/a",
  branch: "main",
  state: "commit/a",
  root: "commit/a",
  cypher: "RETURN 1",
  session: "merge/a",
  name: "experiment",
  expectedRevision: 1,
  refs: ["node:Person"]
};

describe("Phase 15 closed SDK dispatch", () => {
  it("tracks every actual public SDK method without silently omitting future methods", () => {
    const { client } = fixture();
    const publicMethods = Object.entries({
      ontology: client.ontology,
      object: client.object,
      graph: client.graph
    }).flatMap(([namespace, methods]) =>
      Object.keys(methods).map((method) => namespace + "." + method)
    );
    for (const [name, methodOrNamespace] of Object.entries(client.evolution)) {
      if (typeof methodOrNamespace === "function") {
        publicMethods.push("evolution." + name);
      } else {
        publicMethods.push(
          ...Object.keys(methodOrNamespace).map((method) => "evolution." + name + "." + method)
        );
      }
    }
    expect(publicMethods.sort()).toEqual([...READ_METHODS, ...WRITE_METHODS].sort());
    expect(publicMethods).toHaveLength(31);
  });

  it("matches the frozen public SDK method inventory without elevating unknown methods", () => {
    expect([...READ_METHODS].sort()).toEqual(
      [...Object.keys(readPaths), "graph.streamQuery"].sort()
    );
    expect([...WRITE_METHODS].sort()).toEqual(
      [...Object.keys(writePaths), "graph.streamExecute"].sort()
    );
    expect([...STREAM_METHODS].sort()).toEqual(["graph.streamExecute", "graph.streamQuery"]);
    const { client } = fixture();
    expect(() => invoke(client, "constructor", request, options)).toThrow("unavailable");
    expect(() => invoke(client, "graph.streamQuery", request, options)).toThrow("unavailable");
    expect(() => streamSdk(client, "evolution.overview", request, options)).toThrow("unavailable");
  });

  it("routes every read and write method to its exact existing SDK HTTP API", async () => {
    const { client, requests } = fixture();
    for (const [method, endpoint] of Object.entries({ ...readPaths, ...writePaths })) {
      expect(await invoke(client, method, request, options)).toEqual({
        path: "/api/v1" + endpoint
      });
      const sent = requests.at(-1);
      expect(sent).toBeDefined();
      expect(sent?.path).toBe("/api/v1" + endpoint);
      expect(sent?.headers.get("Authorization")).toBe("Bearer private-token");
    }
    expect(requests).toHaveLength(Object.keys(readPaths).length + Object.keys(writePaths).length);
    expect(requests.find((entry) => entry.path.endsWith("/evolution/overview"))?.body).toEqual({});
    expect(requests.find((entry) => entry.path.endsWith("/evolution/branch/list"))?.body).toEqual(
      {}
    );
  });

  it("opens true SDK streams without materializing results", async () => {
    const { client, requests } = fixture();
    for (const method of STREAM_METHODS) {
      const events = [];
      const stream = streamSdk(client, method, request, options);
      for (let item = await stream.next(); item.done !== true; item = await stream.next()) {
        events.push(item.value.type);
      }
      expect(events).toEqual(["columns", "summary"]);
    }
    expect(requests).toHaveLength(2);
    expect(requests.every((entry) => entry.headers.get("Accept") === "application/x-ndjson")).toBe(
      true
    );
  });
});

describe("Phase 15 read and write method capability isolation", () => {
  it("allows all read SDK branches through one isolated guest invocation", async () => {
    const { client, requests } = fixture();
    const statements = Object.keys(readPaths).map(
      (method) => "await " + method + "(" + JSON.stringify(request) + ");"
    );
    expect(await executeScript(client, statements.join("\n") + "\nreturn true;", false)).toBe(true);
    expect(requests).toHaveLength(Object.keys(readPaths).length);
  });

  it("allows every write method only through kgos_run", async () => {
    const { client, requests } = fixture();
    const statements = Object.keys(writePaths).map(
      (method) => "await " + method + "(" + JSON.stringify(request) + ");"
    );
    expect(await executeScript(client, statements.join("\n") + "\nreturn true;", true)).toBe(true);
    expect(requests).toHaveLength(Object.keys(writePaths).length);
    for (const method of Object.keys(writePaths)) {
      const source = "return await " + method + "(" + JSON.stringify(request) + ");";
      await expect(executeScript(client, source, false)).rejects.toMatchObject({
        code: "PERMISSION_DENIED"
      });
    }
    expect(requests).toHaveLength(Object.keys(writePaths).length);
  }, 20_000);
});
