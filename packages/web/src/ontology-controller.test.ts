import { afterEach, describe, expect, it, vi } from "vitest";
import { type OntologyReadItem, type Summary } from "@kgos/sdk";

import { OntologyBrowser, ONTOLOGY_LIMITS } from "./ontology-controller.js";
import { ontologyProjection } from "./ontology-projection.js";
import { detail, rejected, stateA, stateB, versionHarness } from "./version-test-support.js";

const cleanups: (() => void)[] = [];
const domainA: Summary = { kind: "domain", ref: "domain:A", name: "A" };
const domainB: Summary = { kind: "domain", ref: "domain:B", name: "B" };
const shared: Summary = { kind: "domain", ref: "domain:Shared", name: "Shared" };
const node: Summary = { kind: "node-definition", ref: "node:Thing", name: "Thing" };
const relation: Summary = {
  kind: "relationship-definition",
  ref: "relationship:Thing",
  name: "Thing",
  from: "node:Thing",
  to: "node:Outside"
};
const page = (items: Summary[], ref?: string): OntologyReadItem => ({
  kind: ref === undefined ? "overview" : "domain",
  items,
  total: items.length,
  markdown: "read-only markdown",
  ...(ref === undefined ? {} : { ref })
});

async function harness() {
  const setup = await versionHarness();
  setup.handlers.set("ontology/read", (request) => ({
    state: stateA,
    results: [
      page(
        [domainA, domainB, shared, node, relation],
        (request["refs"] as string[] | undefined)?.[0]
      )
    ]
  }));
  setup.handlers.set("object/read", (request) => ({
    state: stateA,
    results: [
      {
        kind: "node-definition",
        ref: (request["refs"] as string[])[0],
        value: { name: "Thing", properties: [{ name: "title", type: "STRING" }], constraints: [] }
      }
    ]
  }));
  setup.handlers.set("object/read-text", (request) => ({
    state: stateA,
    results: [
      {
        kind: "node-definition",
        ref: (request["refs"] as string[])[0],
        body: 'name: "Thing"\nproperties: [{name: "title", type: "STRING"}]\nconstraints: []\n'
      }
    ]
  }));
  const browser = new OntologyBrowser(setup.connection, setup.context);
  cleanups.push(() => {
    browser.dispose();
    setup.records.stop();
  });
  return { ...setup, browser };
}
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe("same-State progressive ontology browsing", () => {
  it("discards late Snapshot diagnostics and canonical errors after a new State or selection", async () => {
    const { browser, handlers, context } = await harness();
    const diagnostic = Promise.withResolvers<unknown>();
    handlers.set("ontology/read", () => rejected("CONSISTENCY_ERROR"));
    handlers.set("evolution/get", () => diagnostic.promise);
    const old = browser.reload();
    await vi.waitFor(() => {
      expect(browser.error).toContain("CONSISTENCY_ERROR");
    });
    context.state = stateB;
    handlers.set("ontology/read", () => ({ state: stateB, results: [page([])] }));
    await browser.reload();
    diagnostic.resolve({ ...detail(stateA), consistency: { status: "invalid", issues: [] } });
    await old;
    expect(browser.consistency).toBeUndefined();
    expect(browser.detailError).toBe("");
    handlers.set("ontology/read", () => rejected("CONSISTENCY_ERROR"));
    handlers.set("evolution/get", () => detail(stateA));
    await browser.reload();
    expect(browser.detailError).toContain("同一 State");
    context.state = stateA;
    handlers.set("ontology/read", () => ({ state: stateA, results: [page([node])] }));
    await browser.reload();
    await browser.inspect("node:Thing");
    const canonical = Promise.withResolvers<unknown>();
    handlers.set("object/read-text", () => canonical.promise);
    const reading = browser.readCanonical();
    await browser.inspect("node:Thing");
    canonical.reject(new TypeError("old canonical request failed"));
    await reading;
    expect(browser.detailError).toBe("");
    expect(browser.canonical).toBe("");
  });

  it("paginates only a scope's cursor at its immutable State and leaves other scopes separately expandable", async () => {
    const { browser, handlers, calls, context } = await harness();
    handlers.set("ontology/read", (request) => {
      const ref = (request["refs"] as string[] | undefined)?.[0];
      const more = request["cursor"] === "domain-next";
      return {
        state: stateA,
        results: [
          {
            ...page(more ? [node] : [shared], ref),
            total: 2,
            ...(more ? {} : { cursor: "domain-next" })
          }
        ]
      };
    });
    await browser.reload();
    expect(browser.page?.items).toEqual([shared]);
    await browser.navigate("domain:A");
    context.state = stateB;
    await browser.more();
    expect(browser.page?.items).toEqual([shared, node]);
    expect(browser.page?.cursor).toBeUndefined();
    expect(calls.filter((call) => call.route === "ontology/read").at(-1)?.body).toEqual({
      at: stateA,
      refs: ["domain:A"],
      cursor: "domain-next",
      limit: 50
    });
    const count = calls.length;
    await browser.more();
    expect(calls).toHaveLength(count);
    await browser.navigate(undefined);
    expect(browser.page?.items).toEqual([shared]);
    await browser.expand("domain:B");
    expect(browser.pages.has("domain:B")).toBe(true);
    const loaded = calls.length;
    await browser.expand("domain:B");
    await browser.expand("node:Thing");
    expect(calls).toHaveLength(loaded);
  });

  it("reads full aggregate and canonical text directly without interpreting Markdown as editable data", async () => {
    const { browser, calls } = await harness();
    await browser.reload();
    await browser.inspect("node:Thing");
    await browser.readCanonical();
    expect(browser.detail?.value).toMatchObject({
      properties: [{ name: "title", type: "STRING" }]
    });
    expect(browser.canonical).toContain('name: "Thing"');
    expect(
      calls
        .filter((call) => call.route.startsWith("object/"))
        .every((call) => call.body["at"] === stateA)
    ).toBe(true);
    expect(browser.pages.get("")?.markdown).toBe("read-only markdown");
  });

  it("distinguishes empty model, missing scope, budget failure and invalid Snapshot diagnostics", async () => {
    const { browser, handlers } = await harness();
    handlers.set("ontology/read", () => ({ state: stateA, results: [page([])] }));
    await browser.reload();
    expect(browser.page?.total).toBe(0);
    expect(browser.error).toBe("");
    handlers.set("ontology/read", () => rejected("OBJECT_NOT_FOUND"));
    await browser.navigate("domain:Missing");
    expect(browser.error).toContain("OBJECT_NOT_FOUND");
    handlers.set("ontology/read", () => rejected("RESOURCE_ERROR"));
    await browser.reload();
    expect(browser.page).toBeUndefined();
    expect(browser.error).toContain("RESOURCE_ERROR");
    handlers.set("ontology/read", () => rejected("CONSISTENCY_ERROR"));
    handlers.set("evolution/get", () => ({
      ...detail(stateA),
      consistency: {
        status: "invalid",
        issues: [{ code: "CONSISTENCY_ERROR", message: "invalid schema" }]
      }
    }));
    await browser.reload();
    expect(browser.consistency).toEqual({
      status: "invalid",
      issues: [{ code: "CONSISTENCY_ERROR", message: "invalid schema" }]
    });
    handlers.set("evolution/get", () => rejected("STATE_NOT_FOUND"));
    await browser.reload();
    expect(browser.detailError).toContain("STATE_NOT_FOUND");
    handlers.set("ontology/read", () => ({ state: stateB, results: [page([])] }));
    await browser.reload();
    expect(browser.error).toContain("scope");
  });

  it("discards late reads when the selected State changes and closes owned requests", async () => {
    const { browser, handlers, calls, context } = await harness();
    const pending = Promise.withResolvers<unknown>();
    handlers.set("ontology/read", () => pending.promise);
    const old = browser.reload();
    const signal = calls.at(-1)?.signal;
    context.state = stateB;
    handlers.set("ontology/read", () => ({ state: stateB, results: [page([])] }));
    await browser.reload();
    expect(signal?.aborted).toBe(true);
    pending.resolve({ state: stateA, results: [page([node])] });
    await old;
    expect(browser.state).toBe(stateB);
    expect(browser.page?.items).toEqual([]);
    expect(browser.loading).toBe(false);
    const late = Promise.withResolvers<unknown>();
    handlers.set("object/read", () => late.promise);
    const reading = browser.inspect("node:Old");
    await browser.reload();
    late.resolve({
      state: stateB,
      results: [{ kind: "node-definition", ref: "node:Old", value: {} }]
    });
    await reading;
    expect(browser.detail).toBeUndefined();
    expect(browser.inspecting).toBe(false);
  });

  it("rejects incomplete detail and canonical envelopes and pauses reads without a connection", async () => {
    const { browser, handlers, connection, calls } = await harness();
    await browser.reload();
    handlers.set("object/read", () => ({ state: stateA, results: [] }));
    await browser.inspect("node:Thing");
    expect(browser.detail).toBeUndefined();
    expect(browser.detailError).toContain("截断");
    const count = calls.length;
    await browser.readCanonical();
    expect(calls).toHaveLength(count);
    handlers.set("object/read", () => ({
      state: stateA,
      results: [{ kind: "node-definition", ref: "node:Thing", value: {} }]
    }));
    await browser.inspect("node:Thing");
    handlers.set("object/read-text", () => ({ state: stateB, results: [] }));
    await browser.readCanonical();
    expect(browser.detailError).toContain("canonical YAML");
    connection.disconnect();
    await browser.inspect("node:Thing");
    await browser.readCanonical();
    await browser.reload();
    expect(browser.pages.size).toBe(0);
  });
});

describe("bounded model/organization projection", () => {
  it("preserves shared membership, deduplicates repeated links and reports the edge cap independently of node count", async () => {
    const { browser } = await harness();
    const items = Array.from({ length: 100 }, (_, index): Summary => ({
      ...node,
      ref: `node:Type${String(index)}`
    }));
    for (let index = 0; index < 8; index += 1) {
      const ref = `domain:Group${String(index)}`;
      browser.pages.set(ref, { ...page(items, ref), title: "组", description: "直接成员" });
    }
    browser.pages.set("repeat", page(items, "domain:Group0"));
    const graph = ontologyProjection(browser);
    expect(graph.nodes).toHaveLength(108);
    expect(graph.links).toHaveLength(ONTOLOGY_LIMITS.edges);
    expect(graph.limited).toBe(true);
    expect(graph.links.filter((link) => link.from === "domain:Group0")).toHaveLength(100);
    expect(graph.nodes[0]?.summary).toMatchObject({ title: "组", description: "直接成员" });
    browser.scope = "domain:Missing";
    expect(ontologyProjection(browser)).toEqual({ nodes: [], links: [], limited: false });
  });

  it("represents multiple parents, cycles, kind distinctions, unconstrained ends and external endpoints exactly once", async () => {
    const { browser } = await harness();
    browser.pages.set("", page([domainA, domainB, shared]));
    browser.pages.set(domainA.ref, page([shared, node, relation], domainA.ref));
    browser.pages.set(domainB.ref, page([shared], domainB.ref));
    browser.pages.set(
      shared.ref,
      page(
        [
          domainA,
          {
            kind: "relationship-definition",
            ref: "relationship:Unrestricted",
            name: "Unrestricted"
          }
        ],
        shared.ref
      )
    );
    const graph = ontologyProjection(browser);
    expect(graph.nodes.filter((item) => item.summary.ref === "domain:Shared")).toHaveLength(1);
    expect(graph.links).toEqual(
      expect.arrayContaining([
        { from: "domain:A", to: "domain:Shared", kind: "membership" },
        { from: "domain:B", to: "domain:Shared", kind: "membership" },
        { from: "domain:Shared", to: "domain:A", kind: "membership" },
        { from: "node:Thing", to: "relationship:Thing", kind: "endpoint" },
        { from: "relationship:Thing", to: "node:Outside", kind: "endpoint" }
      ])
    );
    expect(graph.nodes.some((item) => item.summary.ref === "node:Outside" && item.external)).toBe(
      true
    );
    expect(graph.nodes.some((item) => item.summary.name === "Any")).toBe(false);
    expect(graph.limited).toBe(false);
    browser.scope = domainA.ref;
    expect(ontologyProjection(browser).nodes.some((item) => item.summary.ref === domainB.ref)).toBe(
      false
    );
  });

  it("keeps discovery usable with no Domains and reports graph/expansion budgets", async () => {
    const { browser, calls } = await harness();
    browser.pages.set("", page([node]));
    expect(ontologyProjection(browser).nodes[0]?.summary.ref).toBe("node:Thing");
    const many = Array.from({ length: ONTOLOGY_LIMITS.nodes + 5 }, (_, index): Summary => ({
      ...node,
      ref: `node:Type${String(index)}`
    }));
    browser.pages.set("", page(many));
    expect(ontologyProjection(browser)).toMatchObject({ limited: true });
    expect(ontologyProjection(browser).nodes).toHaveLength(ONTOLOGY_LIMITS.nodes);
    for (let index = 0; index < ONTOLOGY_LIMITS.expansions; index += 1)
      browser.pages.set(`domain:${String(index)}`, page([]));
    await browser.expand("domain:OverBudget");
    expect(browser.error).toContain("展开预算");
    expect(calls).toHaveLength(1);
  });
});
