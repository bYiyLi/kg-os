import { afterEach, describe, expect, it, vi } from "vitest";

import { KGOSClient } from "@kgos/sdk";

import { runEvolution } from "./evolution.js";
import { CLIError } from "../errors.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function evolutionClient(onRequest?: (path: string, body: unknown) => void): KGOSClient {
  const request = vi.fn<typeof fetch>().mockImplementation((input, init) => {
    const path = requestPath(input);
    const body = requestBody(init);
    onRequest?.(path, body);
    return Promise.resolve(new Response(JSON.stringify(resultFor(path, body)), { status: 200 }));
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

function requestBody(init: Parameters<typeof fetch>[1]): unknown {
  return typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : {};
}

function resultFor(path: string, body: unknown): unknown {
  if (path.endsWith("/overview")) return { defaultBranch: "main", state: "commit/a" };
  if (path.endsWith("/get"))
    return {
      state: "commit/a",
      parents: [],
      committedAt: 1,
      consistency: { status: "ok", issues: [] },
      hasData: false,
      data: null
    };
  if (path.endsWith("/ancestry")) return { root: "commit/a", items: [], cursor: "" };
  if (path.endsWith("/history")) return { root: "commit/a", items: [] };
  if (path.endsWith("/diff")) return { before: "commit/a", after: "commit/b", items: [] };
  if (path.includes("/state/create")) return { state: "commit/b" };
  if (path.includes("/state/set-data"))
    return { state: "commit/a", data: (body as Record<string, unknown>)["data"] };
  if (path.includes("/state/clear-data")) return { state: "commit/a" };
  if (path.includes("/branch/list") || path.includes("/tag/list")) return { items: [] };
  if (path.includes("/branch/")) return { name: "x", state: "commit/a" };
  if (path.includes("/tag/")) return { name: "x", state: "commit/a" };
  return {};
}

describe("evolution core CLI", () => {
  it("maps read commands and pagination/scope options", async () => {
    const paths: string[] = [];
    const client = evolutionClient((path) => paths.push(path));
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runEvolution(client, ["overview"]);
    await runEvolution(client, ["get", "branch/main", "--pretty"]);
    await runEvolution(client, ["ancestry", "branch/main", "--limit", "10", "--cursor", "x"]);
    await runEvolution(client, ["history", "branch/main", "--scope", "all"]);
    await runEvolution(client, [
      "diff",
      "--before",
      "commit/a",
      "--after",
      "commit/b",
      "--scope",
      "object",
      "--object-ref",
      "node:A",
      "--anchor-state",
      "commit/a"
    ]);
    expect(paths).toHaveLength(5);
  });

  it("maps State, Branch, and Tag mutations", async () => {
    const paths: string[] = [];
    const client = evolutionClient((path) => paths.push(path));
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runEvolution(client, ["state", "create", "--branch", "main", "--data", "null"]);
    await runEvolution(client, ["state", "set-data", "commit/a", "--data", '{"a":1}']);
    await runEvolution(client, ["state", "clear-data", "commit/a"]);
    await runEvolution(client, ["branch", "list"]);
    await runEvolution(client, ["branch", "create", "feature", "--from", "branch/main"]);
    await runEvolution(client, ["branch", "delete", "feature"]);
    await runEvolution(client, ["tag", "list"]);
    await runEvolution(client, ["tag", "create", "v1", "--target", "branch/main"]);
    await runEvolution(client, ["tag", "move", "v1", "--target", "commit/a"]);
    await runEvolution(client, ["tag", "delete", "v1"]);
    expect(paths).toHaveLength(10);
    expect(paths.at(-1)).toContain("/tag/delete");
  });

  it("rejects invalid scopes and malformed state data", async () => {
    const client = evolutionClient();
    await expect(
      runEvolution(client, ["history", "x", "--scope", "object"])
    ).rejects.toBeInstanceOf(CLIError);
    await expect(
      runEvolution(client, ["history", "x", "--scope", "all", "--object-ref", "x"])
    ).rejects.toBeInstanceOf(CLIError);
    await expect(
      runEvolution(client, ["state", "set-data", "x", "--data", "{"])
    ).rejects.toMatchObject({ code: "PARSE_ERROR" });
    await expect(runEvolution(client, ["unknown"])).rejects.toBeInstanceOf(CLIError);
  });
});
