import { expect, it, vi } from "vitest";
import type { ObjectReadRequest, OntologyReadResult, ResolvedState, Summary } from "@kgos/sdk";

import { loadDomainTree } from "./domain-data.js";
import type { DomainReader } from "./domain-data.js";

const state = ("commit/" + "a".repeat(64)) as ResolvedState;
const other = ("commit/" + "b".repeat(64)) as ResolvedState;

function summary(name: string, ref = "domain:" + name): Summary {
  return { kind: "domain", ref, name };
}

function overview(items: Summary[], total = items.length, cursor?: string): OntologyReadResult {
  return {
    state,
    results: [
      { kind: "overview", items, total, markdown: "", ...(cursor === undefined ? {} : { cursor }) }
    ]
  };
}

function reader(items: Summary[], edges: Record<string, string[]> = {}): DomainReader {
  return {
    ontology: { read: vi.fn().mockResolvedValue(overview(items)) },
    object: {
      read: vi.fn().mockImplementation((request: ObjectReadRequest) =>
        Promise.resolve({
          state,
          results: request.refs.map((ref) => ({
            kind: "domain",
            ref,
            value: {
              name: items.find((item) => item.ref === ref)?.name,
              title: ref + " title",
              description: ref + " description",
              includes: edges[ref] ?? []
            }
          }))
        })
      )
    }
  };
}

function load(api: DomainReader, signal = new AbortController().signal) {
  return loadDomainTree(api, state, signal);
}

it("accepts the actual empty Go overview and skips object reads", async () => {
  const api = reader([]);
  const empty = overview([]);
  Object.assign(empty.results[0] ?? {}, { items: null });
  vi.mocked(api.ontology.read).mockResolvedValue(empty);
  const tree = await load(api);
  expect(tree).toEqual({ state, nodes: new Map(), roots: [] });
  expect(api.object.read).not.toHaveBeenCalled();
});

it("accepts a null includes collection as an empty Domain without accepting other scalar values", async () => {
  const api = reader([summary("Empty")]);
  vi.mocked(api.object.read).mockResolvedValue({
    state,
    results: [{ kind: "domain", ref: "domain:Empty", value: { name: "Empty", includes: null } }]
  });
  const tree = await load(api);
  expect(tree.nodes.get("domain:Empty")?.children).toEqual([]);
  expect(tree.roots).toEqual(["domain:Empty"]);
});

it("orders canonical encoded high-BMP and emoji Refs consistently in roots and children", async () => {
  const bmp = summary("\uE000", "domain:%EE%80%80");
  const emoji = summary("😀", "domain:%F0%9F%98%80");
  const parent = summary("Parent");
  const api = reader([emoji, bmp, parent]);
  expect((await load(api)).roots).toEqual([bmp.ref, emoji.ref, parent.ref]);
  const linked = reader([emoji, bmp, parent], { "domain:Parent": [emoji.ref, bmp.ref] });
  expect((await load(linked)).nodes.get(parent.ref)?.children).toEqual([bmp.ref, emoji.ref]);
});

it("keeps shared children, discovers rootless cycles, and uses exact encoded Refs", async () => {
  const items = [
    summary("Root"),
    summary("Shared"),
    summary("Other"),
    summary("CycleA"),
    summary("CycleB"),
    summary("循环", "domain:%E5%BE%AA%E7%8E%AF"),
    summary("__proto__")
  ];
  const api = reader(items, {
    "domain:Root": ["domain:Shared", "node:Person", "relationship:KNOWS"],
    "domain:Other": ["domain:Shared"],
    "domain:CycleA": ["domain:CycleB"],
    "domain:CycleB": ["domain:CycleA"],
    "domain:%E5%BE%AA%E7%8E%AF": ["domain:%E5%BE%AA%E7%8E%AF"]
  });
  const tree = await load(api);
  expect(tree.roots).toEqual([
    "domain:Other",
    "domain:Root",
    "domain:__proto__",
    "domain:%E5%BE%AA%E7%8E%AF",
    "domain:CycleA"
  ]);
  expect(tree.nodes.get("domain:Root")).toEqual({
    ref: "domain:Root",
    name: "Root",
    title: "domain:Root title",
    description: "domain:Root description",
    children: ["domain:Shared"]
  });
  expect(tree.nodes.get("domain:Other")?.children).toEqual(["domain:Shared"]);
  expect(tree.nodes.get("domain:%E5%BE%AA%E7%8E%AF")?.name).toBe("循环");
  expect(tree.nodes.has("domain:__proto__")).toBe(true);
});

it("finishes all overview pages, counts unclassified definitions, and batches 100 refs", async () => {
  const items = Array.from({ length: 101 }, (_, index) => summary(String(index)));
  const node: Summary = { kind: "node-definition", ref: "node:Unclassified", name: "Unclassified" };
  const api = reader(items);
  vi.mocked(api.ontology.read)
    .mockResolvedValueOnce(overview(items.slice(0, 100), 102, "next"))
    .mockResolvedValueOnce(overview([items[100] ?? node, node], 102));
  const tree = await load(api);
  expect(tree.nodes.size).toBe(101);
  const call = vi.mocked(api.ontology.read).mock.calls[1];
  expect(call?.[0]).toEqual({ at: state, limit: 100, cursor: "next" });
  expect(call?.[1]?.signal).toBeInstanceOf(AbortSignal);
  expect(vi.mocked(api.object.read).mock.calls.map(([request]) => request.refs.length)).toEqual([
    100, 1
  ]);
});

it.each([
  ["wrong State", { ...overview([]), state: other }],
  ["missing result", { state, results: [] }],
  ["wrong scope", { state, results: [{ ...overview([]).results[0], kind: "domain" }] }],
  ["invalid total", { state, results: [{ ...overview([]).results[0], total: -1 }] }],
  ["truncated overview", overview([], 1)],
  ["no progress", overview([], 1, "next")],
  ["incomplete cursor", overview([summary("A")], 1, "next")],
  ["duplicate summary", overview([summary("A"), summary("A")])],
  ["unknown kind", overview([{ ...summary("A"), kind: "knowledge-node" }])],
  ["mismatched prefix", overview([summary("A", "node:A")])],
  ["empty identifying name", overview([summary("")])]
])("rejects an invalid overview: %s", async (_name, response) => {
  const api = reader([]);
  vi.mocked(api.ontology.read).mockResolvedValue(response as OntologyReadResult);
  await expect(load(api)).rejects.toThrow("Invalid Domain navigation response");
  expect(api.object.read).not.toHaveBeenCalled();
});

it("rejects a changed total or repeating cursor without publishing a partial tree", async () => {
  for (const second of [overview([summary("B")], 3), overview([summary("B")], 4, "next")]) {
    const api = reader([]);
    vi.mocked(api.ontology.read)
      .mockResolvedValueOnce(overview([summary("A")], 4, "next"))
      .mockResolvedValueOnce(second);
    await expect(load(api)).rejects.toThrow();
    expect(api.object.read).not.toHaveBeenCalled();
  }
});

it.each([
  { state: other, results: [] },
  { state, results: [] },
  { state, results: [{ kind: "domain", ref: "domain:B", value: { name: "A", includes: [] } }] },
  { state, results: [{ kind: "node-definition", ref: "domain:A", value: {} }] },
  { state, results: [{ kind: "domain", ref: "domain:A", value: { name: "B", includes: [] } }] },
  { state, results: [{ kind: "domain", ref: "domain:A", value: { name: "A", includes: false } }] },
  { state, results: [{ kind: "domain", ref: "domain:A", value: { name: "A", includes: [3] } }] },
  {
    state,
    results: [{ kind: "domain", ref: "domain:A", value: { name: "A", includes: [], title: null } }]
  }
])("rejects incomplete or mismatched object batches %#", async (response) => {
  const api = reader([summary("A")]);
  vi.mocked(api.object.read).mockResolvedValue(
    response as Awaited<ReturnType<DomainReader["object"]["read"]>>
  );
  await expect(load(api)).rejects.toThrow();
});

it("rejects missing child Domains and duplicate membership", async () => {
  for (const children of [["domain:Missing"], ["domain:A", "domain:A"], ["not-a-ref"]]) {
    const api = reader([summary("A")], { "domain:A": children });
    await expect(load(api)).rejects.toThrow();
  }
});

it("propagates read resource errors and aborts before reading more pages", async () => {
  const api = reader([summary("A")]);
  vi.mocked(api.object.read).mockRejectedValueOnce(new Error("RESOURCE_ERROR"));
  await expect(load(api)).rejects.toThrow("RESOURCE_ERROR");
  const controller = new AbortController();
  controller.abort();
  await expect(load(api, controller.signal)).rejects.toThrow();
  expect(api.ontology.read).toHaveBeenCalledTimes(1);
  await expect(
    loadDomainTree(api, "branch/main" as ResolvedState, new AbortController().signal)
  ).rejects.toThrow();
});

it("rejects a non-object overview envelope before reading its fields", async () => {
  const api = reader([]);
  vi.mocked(api.ontology.read).mockResolvedValueOnce(null as unknown as OntologyReadResult);
  await expect(load(api)).rejects.toThrow("Invalid Domain navigation response");
  expect(api.object.read).not.toHaveBeenCalled();
});

it("accepts Relationship Definitions in the overview without treating them as Domains", async () => {
  const relationship: Summary = {
    kind: "relationship-definition",
    ref: "relationship:WORKS_AT",
    name: "WORKS_AT"
  };
  const api = reader([relationship]);
  expect(await load(api)).toEqual({ state, nodes: new Map(), roots: [] });
  expect(api.object.read).not.toHaveBeenCalled();
});

it("rejects an oversized overview page even when its declared total is consistent", async () => {
  const api = reader([]);
  const items = Array.from({ length: 101 }, (_, index) => summary(String(index)));
  vi.mocked(api.ontology.read).mockResolvedValueOnce(overview(items, items.length));
  await expect(load(api)).rejects.toThrow("Invalid Domain navigation response");
  expect(api.object.read).not.toHaveBeenCalled();
});

it("rejects an empty Domain name when the identifying Ref is otherwise valid", async () => {
  const api = reader([]);
  vi.mocked(api.ontology.read).mockResolvedValueOnce(
    overview([{ kind: "domain", ref: "domain:Empty", name: "" }])
  );
  await expect(load(api)).rejects.toThrow("Invalid Domain navigation response");
  expect(api.object.read).not.toHaveBeenCalled();
});

it("rejects an overview whose items exceed the declared total", async () => {
  const api = reader([]);
  vi.mocked(api.ontology.read).mockResolvedValueOnce(overview([summary("A")], 0));
  await expect(load(api)).rejects.toThrow("Invalid Domain navigation response");
  expect(api.object.read).not.toHaveBeenCalled();
});
