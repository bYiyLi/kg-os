import { afterEach, describe, expect, it, vi } from "vitest";

import { KGOSClient } from "@kgos/sdk";

import { runObject } from "./object.js";
import { CLIError } from "../errors.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function clientFor(handler: (path: string, body: unknown) => unknown): KGOSClient {
  const request = vi.fn<typeof fetch>().mockImplementation((input, init) => {
    const path = requestPath(input);
    const body = requestBody(init);
    return Promise.resolve(new Response(JSON.stringify(handler(path, body)), { status: 200 }));
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

describe("object CLI", () => {
  it("uses one batch request and preserves JSON result order", async () => {
    const client = clientFor((path, body) => {
      expect(path).toBe("/api/v1/object/read");
      expect(body).toEqual({ at: "branch/main", refs: ["n:1", "n:2"] });
      return {
        state: "commit/a",
        results: [
          { kind: "knowledge-node", ref: "n:1", value: { labels: [], properties: {} } },
          { kind: "knowledge-node", ref: "n:2", value: { labels: [], properties: {} } }
        ]
      };
    });
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runObject(client, ["read", "n:1", "n:2", "--at", "branch/main"]);
    expect(String(write.mock.calls.at(-1)?.[0])).toContain('"results"');
  });

  it("uses daemon canonical text for multi-document YAML bodies", async () => {
    const client = clientFor((path) => {
      expect(path).toBe("/api/v1/object/read-text");
      return {
        state: "commit/a",
        results: [
          {
            kind: "node-definition",
            ref: "node:A",
            body: "name: A\nproperties: []\nconstraints: []\n"
          },
          {
            kind: "node-definition",
            ref: "node:B",
            body: "name: B\nproperties: []\nconstraints: []\n"
          }
        ]
      };
    });
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runObject(client, ["read", "node:A", "node:B", "--at", "commit/a", "--body"]);
    const output = String(write.mock.calls.at(-1)?.[0]);
    expect(output).toContain("# kgos-state: commit/a");
    expect(output).toContain("--- # kgos-ref: node:B");
  });

  it("maps patch input to the shared patch endpoint", async () => {
    const state = "commit/" + "a".repeat(64);
    const client = clientFor((path, body) => {
      expect(path).toBe("/api/v1/object/patch");
      expect(body).toMatchObject({ baseState: state, branch: "main", patch: "diff" });
      return { state: "commit/b", created: [], transitions: [] };
    });
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runObject(client, [
      "patch",
      "--base-state",
      state,
      "--branch",
      "main",
      "--patch",
      "diff"
    ]);
    expect(String(write.mock.calls.at(-1)?.[0])).toContain('"created":[]');
  });

  it("pretty prints a single JSON patch result without changing its value", async () => {
    const state = "commit/" + "a".repeat(64);
    const result = { state, created: [], transitions: [] };
    const client = clientFor(() => result);
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const args = ["patch", "--base-state", state, "--branch", "main", "--patch", "diff"];
    await runObject(client, args);
    const compact = String(write.mock.calls.at(-1)?.[0]);
    await runObject(client, [...args, "--pretty"]);
    const pretty = String(write.mock.calls.at(-1)?.[0]);
    expect(pretty).toContain('\n  "state"');
    expect(JSON.parse(pretty)).toEqual(JSON.parse(compact));
    await expect(runObject(client, [...args, "--pretty", "--pretty"])).rejects.toBeInstanceOf(
      CLIError
    );
  });

  it("rejects duplicate refs, invalid CRLF lists, and invalid format combinations", async () => {
    const client = clientFor(() => ({}));
    await expect(
      runObject(client, ["read", "n:1", "n:1", "--at", "branch/main"])
    ).rejects.toBeInstanceOf(CLIError);
    await expect(
      runObject(client, ["read", "n:1", "--at", "branch/main", "--format", "json"])
    ).rejects.toBeInstanceOf(CLIError);
    await expect(runObject(client, ["unknown"])).rejects.toBeInstanceOf(CLIError);
  });
});
