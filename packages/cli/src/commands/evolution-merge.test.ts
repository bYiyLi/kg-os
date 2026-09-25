import { afterEach, describe, expect, it, vi } from "vitest";

import { KGOSClient } from "@kgos/sdk";

import { runEvolutionMerge } from "./evolution-merge.js";
import { CLIError } from "../errors.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function mergeClient(captured: { path: string; body: unknown }[]): KGOSClient {
  const request = vi.fn<typeof fetch>().mockImplementation((input, init) => {
    const path = requestPath(input);
    const body = requestBody(init);
    captured.push({ path, body });
    if (path.endsWith("/list")) {
      return Promise.resolve(new Response('{"items":[]}', { status: 200 }));
    }
    if (path.endsWith("/conflicts")) {
      return Promise.resolve(
        new Response('{"session":"s","revision":1,"items":[]}', { status: 200 })
      );
    }
    if (path.endsWith("/finalize")) {
      return Promise.resolve(
        new Response('{"status":"merged","targetState":"a","sourceState":"b","state":"c"}', {
          status: 200
        })
      );
    }
    if (path.endsWith("/abort")) {
      return Promise.resolve(new Response('{"session":"s"}', { status: 200 }));
    }
    return Promise.resolve(
      new Response(
        '{"session":"s","branch":"main","targetState":"a","sourceState":"b","revision":1,"status":"open","unresolved":0}',
        { status: 200 }
      )
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

function requestBody(init: Parameters<typeof fetch>[1]): unknown {
  return typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : {};
}

describe("evolution merge CLI", () => {
  it("maps the full explicit Merge Session lifecycle", async () => {
    const captured: { path: string; body: unknown }[] = [];
    const client = mergeClient(captured);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runEvolutionMerge(
      client,
      ["start", "--branch", "main", "--source", "branch/feature"],
      false
    );
    await runEvolutionMerge(client, ["list", "--limit", "10"], false);
    await runEvolutionMerge(client, ["get", "s"], false);
    await runEvolutionMerge(client, ["conflicts", "s", "--cursor", "x"], false);
    await runEvolutionMerge(
      client,
      [
        "resolve",
        "s",
        "--expected-revision",
        "1",
        "--resolutions",
        '[{"conflictId":"c","choice":"value","value":null}]'
      ],
      false
    );
    await runEvolutionMerge(
      client,
      ["finalize", "s", "--expected-revision", "1", "--author", "a"],
      false
    );
    await runEvolutionMerge(client, ["abort", "s", "--expected-revision", "1"], false);

    const resolve = captured.find((item) => item.path.endsWith("/resolve"));
    expect(resolve?.body).toEqual({
      session: "s",
      expectedRevision: 1,
      resolutions: [{ conflictId: "c", choice: "value", value: null }]
    });
  });

  it("preserves absence vs explicit null and rejects non-strict resolution JSON", async () => {
    const captured: { path: string; body: unknown }[] = [];
    const client = mergeClient(captured);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runEvolutionMerge(
      client,
      [
        "resolve",
        "s",
        "--expected-revision",
        "2",
        "--resolutions",
        '[{"conflictId":"c","choice":"ours"}]'
      ],
      false
    );
    const body = captured.at(-1)?.body as { resolutions: Record<string, unknown>[] };
    expect(Object.hasOwn(body.resolutions[0] ?? {}, "value")).toBe(false);

    await expect(
      runEvolutionMerge(
        client,
        [
          "resolve",
          "s",
          "--expected-revision",
          "1",
          "--resolutions",
          '[{"conflictId":"c","choice":"ours","value":null}]'
        ],
        false
      )
    ).rejects.toBeInstanceOf(CLIError);
    await expect(
      runEvolutionMerge(
        client,
        ["resolve", "s", "--expected-revision", "1", "--resolutions", '{"not":"array"}'],
        false
      )
    ).rejects.toBeInstanceOf(CLIError);
  });
});
