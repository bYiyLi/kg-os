import { afterEach, describe, expect, it, vi } from "vitest";

import { KGOSClient } from "@kgos/sdk";

import { runOntology } from "./ontology.js";
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

describe("ontology CLI", () => {
  it("prints daemon Markdown for a single read", async () => {
    const client = clientFor((path, body) => {
      expect(path).toBe("/api/v1/ontology/read");
      expect(body).toEqual({ at: "branch/main", refs: ["node:Person"] });
      return {
        state: "commit/a",
        results: [
          {
            ref: "node:Person",
            kind: "node-definition",
            items: [],
            total: 0,
            markdown: "---\nstate: commit/a\n---\n# Person\n"
          }
        ]
      };
    });
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runOntology(client, ["node:Person", "--at", "branch/main"]);
    expect(String(write.mock.calls.at(-1)?.[0])).toContain("# Person");
  });

  it("frames batch Markdown and canonical edit YAML", async () => {
    let mode = "read";
    const paths: string[] = [];
    const state = "commit/" + "a".repeat(64);
    const client = clientFor((path) => {
      paths.push(path);
      if (mode === "read") {
        return {
          state,
          results: [
            { ref: "node:A", kind: "node-definition", items: [], total: 0, markdown: "# A\n" },
            {
              ref: "node:B",
              kind: "node-definition",
              items: [],
              total: 0,
              cursor: "next",
              markdown: "# B\n"
            }
          ]
        };
      }
      return {
        state,
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
    await runOntology(client, ["node:A", "node:B", "--at", state]);
    expect(String(write.mock.calls.at(-1)?.[0])).toContain('kind: "batch"');
    expect(paths.at(-1)).toBe("/api/v1/ontology/read");
    write.mockClear();
    mode = "edit";
    await runOntology(client, ["node:A", "node:B", "--at", state, "--edit"]);
    expect(String(write.mock.calls.at(-1)?.[0])).toContain("--- # kgos-ref: node:B");
    expect(paths.at(-1)).toBe("/api/v1/object/read-text");
  });

  it("uses the ontology patch endpoint and rejects invalid edit shapes", async () => {
    const state = "commit/" + "b".repeat(64);
    const client = clientFor((path) => {
      expect(path).toBe("/api/v1/ontology/patch");
      return { state, created: [], transitions: [] };
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runOntology(client, [
      "patch",
      "--base-state",
      state,
      "--branch",
      "main",
      "--patch",
      "diff"
    ]);
    await expect(runOntology(client, ["--at", "branch/main", "--edit"])).rejects.toBeInstanceOf(
      CLIError
    );
    await expect(
      runOntology(client, ["node:A", "--at", "branch/main", "--edit"])
    ).rejects.toBeInstanceOf(CLIError);
  });

  it("accepts pretty for JSON patch but rejects it for Markdown read", async () => {
    const state = "commit/" + "b".repeat(64);
    const client = clientFor(() => ({ state, created: [], transitions: [] }));
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runOntology(client, [
      "patch",
      "--base-state",
      state,
      "--branch",
      "main",
      "--patch",
      "diff",
      "--pretty"
    ]);
    expect(String(write.mock.calls.at(-1)?.[0])).toContain('\n  "state"');
    await expect(runOntology(client, ["--at", "branch/main", "--pretty"])).rejects.toBeInstanceOf(
      CLIError
    );
  });
});
