import { KGOSClient } from "@kgos/sdk";
import { describe, expect, it, vi } from "vitest";

import {
  MAX_VIEW_BYTES,
  MarkdownDocument,
  commitMessage,
  fenced,
  mermaidLabel,
  navigation,
  summaryFromMessage,
  utf8Sort
} from "./markdown.js";
import { PreviewCache } from "./preview-cache.js";
import { renderPreview } from "./preview.js";

const branch = { name: "main", state: "commit/a" };
const group = { ref: "domain:Group", kind: "domain", name: "Group", title: "Group" };
const person = { ref: "node:Person", kind: "node-definition", name: "Person", title: "Person" };
const related = {
  ref: "relationship:KNOWS",
  kind: "relationship-definition",
  name: "KNOWS",
  title: "Knows"
};

type Hook = (path: string, body: Record<string, unknown>) => unknown;

function defaultResponse(path: string, body: Record<string, unknown>): unknown {
  if (path.endsWith("/evolution/overview")) return { defaultBranch: "main", state: branch.state };
  if (path.endsWith("/evolution/branch/list")) return { items: [branch] };
  if (path.endsWith("/evolution/get"))
    return {
      state: branch.state,
      parents: null,
      author: "Author",
      committedAt: 100,
      message: "## 简介\n\nKnowledge graph.\n\n## 改动\n\n- Original"
    };
  if (path.endsWith("/ontology/read")) {
    const refs = body["refs"];
    const member = Array.isArray(refs) && refs.length === 1 && refs[0] === group.ref;
    const items = member ? [person, related] : [group, person, related];
    return {
      state: branch.state,
      results: [
        {
          ...(member ? { ref: group.ref } : {}),
          kind: member ? "domain" : "overview",
          items,
          total: items.length,
          cursor: null
        }
      ]
    };
  }
  if (path.endsWith("/object/read") || path.endsWith("/object/read-text")) {
    const refs = body["refs"];
    if (!Array.isArray(refs)) throw new Error("Fixture needs explicit Object refs");
    return {
      state: branch.state,
      results: refs.map((ref: unknown) => ({
        ref,
        kind: typeof ref === "string" && ref.startsWith("domain:") ? "domain" : "node-definition",
        ...(path.endsWith("/object/read-text")
          ? { body: 'name: "Example"\ndescription: "Original model with ```` codes"\n' }
          : {
              value:
                ref === related.ref
                  ? { name: "KNOWS", from: person.ref, to: person.ref }
                  : { name: "Person", properties: [{ name: "name", type: "STRING" }] }
            })
      }))
    };
  }
  throw new Error("Unexpected SDK path: " + path);
}

function fixture(hook: Hook = () => undefined) {
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    let url: string;
    if (typeof input === "string") url = input;
    else if (input instanceof URL) url = input.href;
    else url = input.url;
    const path = new URL(url).pathname;
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<
      string,
      unknown
    >;
    requests.push({ path, body });
    const replacement = hook(path, body);
    return Promise.resolve(
      new Response(
        JSON.stringify(replacement === undefined ? defaultResponse(path, body) : replacement)
      )
    );
  });
  const client = new KGOSClient({
    endpoint: "http://127.0.0.1:6060",
    token: "internal-token",
    fetch: fetchMock
  });
  return { client, requests };
}

async function documentFor(hook: Hook = () => undefined, maxItems = 50_000): Promise<string> {
  return (await renderPreview(fixture(hook).client, { maxItems })).join("\n") + "\n";
}

describe("Preview complete immutable snapshots and canonical navigation", () => {
  it("preserves all schema details, real relationship endpoints and pinned commit metadata", async () => {
    const text = await documentFor();
    expect(text).toContain("Original model with ```` codes");
    expect(text).toContain("node:Person");
    expect(text).toContain("relationship:KNOWS");
    expect(text).toContain('d0 -->|"relationship:KNOWS"| d0');
    expect(text).toContain("**State:** commit/a");
    expect(text).toContain("Knowledge graph.");
    expect(text.endsWith("\n\n")).toBe(false);
  });

  it("reads more than one Branch even when both Heads point to the same Commit", async () => {
    const text = await documentFor((path) =>
      path.endsWith("/branch/list")
        ? {
            items: [
              { name: "z", state: "commit/a" },
              { name: "a", state: "commit/a" }
            ]
          }
        : undefined
    );
    expect(text.indexOf("## a")).toBeLessThan(text.indexOf("## z"));
    expect(text.match(/\*\*State:\*\* commit\/a/g)).toHaveLength(2);
  });

  it("renders ungrouped Definitions and a cyclic Domain graph without duplicating details", async () => {
    const other = { ref: "domain:Other", name: "Other", kind: "domain" };
    const text = await documentFor((path, body) => {
      if (!path.endsWith("/ontology/read")) return undefined;
      const ref: unknown = Array.isArray(body["refs"]) ? body["refs"][0] : undefined;
      if (ref === group.ref)
        return {
          state: branch.state,
          results: [{ ref: group.ref, kind: "domain", items: [other, person], total: 2 }]
        };
      if (ref === other.ref)
        return {
          state: branch.state,
          results: [{ ref: other.ref, kind: "domain", items: [group, related], total: 2 }]
        };
      return {
        state: branch.state,
        results: [{ kind: "overview", items: [other, group, person], total: 3 }]
      };
    });
    expect(text.match(/##### domain:Other\n/g)).toHaveLength(1);
    expect(text.match(/##### domain:Group\n/g)).toHaveLength(1);
    expect(text).toContain("| domain:Other | domain:Group |");
    expect(text).toContain("relationship:KNOWS");
  });

  it("assembles a continuing ontology cursor without losing the global totals", async () => {
    const { client, requests } = fixture((path, body) => {
      if (!path.endsWith("/ontology/read")) return undefined;
      const member = Array.isArray(body["refs"]);
      const cursor = body["cursor"];
      let items: (typeof group)[];
      if (member) items = [person, related];
      else if (cursor === "second") items = [related];
      else items = [group, person];
      return {
        state: branch.state,
        results: [
          {
            ...(member ? { ref: group.ref } : {}),
            kind: member ? "domain" : "overview",
            items,
            total: member ? 2 : 3,
            ...(member || cursor === "second" ? {} : { cursor: "second" })
          }
        ]
      };
    });
    const text = (await renderPreview(client, { maxItems: 10 })).join("\n");
    expect(text).toContain("relationship:KNOWS");
    expect(requests.some((item) => item.body["cursor"] === "second")).toBe(true);
  });
});

describe("Preview fails closed on incomplete or inconsistent SDK data", () => {
  it.each([
    [
      "wrong pinned State",
      { state: "commit/b", results: [{ kind: "overview", items: [], total: 0 }] }
    ],
    [
      "multiple scopes",
      { state: branch.state, results: [{ kind: "overview", items: [], total: 0 }, {}] }
    ],
    ["missing scopes", { state: branch.state, results: [] }],
    [
      "invalid item collection",
      { state: branch.state, results: [{ kind: "overview", items: null, total: 2 }] }
    ],
    [
      "invalid total",
      { state: branch.state, results: [{ kind: "overview", items: [], total: -1 }] }
    ],
    [
      "invalid cursor",
      { state: branch.state, results: [{ kind: "overview", items: [], total: 0, cursor: 4 }] }
    ],
    [
      "wrong total",
      { state: branch.state, results: [{ kind: "overview", items: [group], total: 2 }] }
    ],
    [
      "inert cursor",
      {
        state: branch.state,
        results: [{ kind: "overview", items: [], total: 0, cursor: "repeat" }]
      }
    ]
  ])("rejects %s rather than returning an incomplete view", async (_name, payload) => {
    const { client } = fixture((path) => (path.endsWith("/ontology/read") ? payload : undefined));
    await expect(renderPreview(client, { maxItems: 100 })).rejects.toMatchObject({
      code: "RESOURCE_ERROR"
    });
  });

  it("rejects a repeated cursor even when every page contains a valid item", async () => {
    const { client } = fixture((path) =>
      path.endsWith("/ontology/read")
        ? {
            state: branch.state,
            results: [{ kind: "overview", items: [group], total: 200, cursor: "stuck" }]
          }
        : undefined
    );
    await expect(renderPreview(client, { maxItems: 100 })).rejects.toMatchObject({
      code: "RESOURCE_ERROR"
    });
  });

  it("rejects unknown Ontology Object kinds and conflicting logical identities", async () => {
    const unknown = fixture((path) =>
      path.endsWith("/ontology/read")
        ? {
            state: branch.state,
            results: [
              {
                kind: "overview",
                total: 1,
                items: [{ ref: "other:x", kind: "unknown", name: "X" }]
              }
            ]
          }
        : undefined
    );
    await expect(renderPreview(unknown.client, { maxItems: 100 })).rejects.toThrow("unknown kind");
    const conflicting = fixture((path, body) => {
      if (path.endsWith("/ontology/read") && Array.isArray(body["refs"])) {
        return {
          state: branch.state,
          results: [
            {
              ref: group.ref,
              kind: "domain",
              total: 1,
              items: [{ ...person, name: "Different" }]
            }
          ]
        };
      }
      return undefined;
    });
    await expect(renderPreview(conflicting.client, { maxItems: 100 })).rejects.toThrow(
      "inconsistent object identities"
    );
  });

  it("rejects non-Commit Branch heads, mismatched Commit metadata and tiny object budgets", async () => {
    const invalidHead = fixture((path) =>
      path.endsWith("/branch/list")
        ? {
            items: [{ name: "main", state: "branch/main" }]
          }
        : undefined
    );
    await expect(renderPreview(invalidHead.client, { maxItems: 100 })).rejects.toThrow(
      "pinned Commit"
    );
    const invalidCommit = fixture((path) =>
      path.endsWith("/evolution/get")
        ? {
            state: "commit/other",
            parents: []
          }
        : undefined
    );
    await expect(renderPreview(invalidCommit.client, { maxItems: 100 })).rejects.toThrow(
      "does not match"
    );
    await expect(documentFor(() => undefined, 1)).rejects.toMatchObject({ code: "RESOURCE_ERROR" });
  });

  it.each(["wrong State", "incomplete batch", "missing value"])(
    "rejects corrupted canonical %s",
    async (kind) => {
      const { client } = fixture((path, body) => {
        if (!path.endsWith("/object/read") && !path.endsWith("/object/read-text")) return undefined;
        const original = defaultResponse(path, body) as { state: string; results: unknown[] };
        if (kind === "wrong State") return { ...original, state: "commit/wrong" };
        if (kind === "incomplete batch") return { ...original, results: [] };
        if (path.endsWith("/object/read-text")) return { ...original, results: [] };
        return undefined;
      });
      await expect(renderPreview(client, { maxItems: 100 })).rejects.toMatchObject({
        code: "RESOURCE_ERROR"
      });
    }
  );

  it("rejects malformed relationship endpoints and non-object values", async () => {
    for (const value of [null, [], { from: 12, to: person.ref }, { from: person.ref, to: 9 }]) {
      const { client } = fixture((path, body) => {
        if (!path.endsWith("/object/read")) return undefined;
        const original = defaultResponse(path, body) as {
          state: string;
          results: Record<string, unknown>[];
        };
        return {
          ...original,
          results: original.results.map((item) =>
            item["ref"] === related.ref ? { ...item, value } : item
          )
        };
      });
      await expect(renderPreview(client, { maxItems: 100 })).rejects.toMatchObject({
        code: "RESOURCE_ERROR"
      });
    }
  });
});

describe("Preview revisions and safe Markdown representation", () => {
  it("enforces isolation, expiry, eviction and all line window boundaries", async () => {
    const { client } = fixture();
    const cache = new PreviewCache({ maxItems: 100, entries: 1, ttlMs: 1000 });
    const first = await cache.read(client, "owner", { limit: 100 });
    expect(first.totalLines).toBeGreaterThan(1);
    await expect(
      cache.read(client, "other", { limit: 100, viewRevision: first.viewRevision })
    ).rejects.toMatchObject({ code: "VIEW_EXPIRED" });
    const second = await cache.read(client, "owner", { limit: 100 });
    await expect(
      cache.read(client, "owner", { limit: 100, viewRevision: first.viewRevision })
    ).rejects.toMatchObject({ code: "VIEW_EXPIRED" });
    const tail = await cache.read(client, "owner", {
      offset: second.totalLines,
      limit: 100,
      viewRevision: second.viewRevision
    });
    expect(tail.lineCount).toBe(0);
    expect(tail.preview).toBe("");
    for (const offset of [-1, 0.4, second.totalLines + 1]) {
      await expect(
        cache.read(client, "owner", { offset, limit: 100, viewRevision: second.viewRevision })
      ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    }
    for (const limit of [0, 99, 501, 101.5]) {
      await expect(
        cache.read(client, "owner", { limit, viewRevision: second.viewRevision })
      ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    }
    const expired = new PreviewCache({ maxItems: 100, entries: 1, ttlMs: 1 });
    const revision = await expired.read(client, "owner", {});
    await new Promise((resolve) => setTimeout(resolve, 12));
    await expect(
      expired.read(client, "owner", { viewRevision: revision.viewRevision })
    ).rejects.toMatchObject({ code: "VIEW_EXPIRED" });
  });

  it("escapes dangerous navigation, Mermaid labels and nested Markdown fences without data loss", () => {
    const safe = navigation("# heading | <tag> [link]\nMore `* text");
    expect(safe).toContain("&#124;");
    expect(safe).toContain("&lt;tag&gt;");
    expect(safe).not.toContain("\n");
    expect(summaryFromMessage("## 简介\n\nFirst sentence\n\n## 改动\n- item")).toBe(
      "First sentence"
    );
    expect(summaryFromMessage("no headings")).toBe("无规范简介");
    const lines: string[] = [];
    commitMessage(lines);
    expect(lines).toContain("（无 Message）");
    fenced(lines, "one\n````inside", "markdown");
    expect(lines).toContain("`````markdown");
    const doc = new MarkdownDocument();
    const anchor = doc.start();
    doc.lines.push("# Hello", "");
    doc.end(anchor);
    doc.lines.push("Index " + doc.offset(anchor) + " " + doc.length(anchor));
    const built = doc.finish();
    expect(built.at(-1)).toBe("Index 0 2");
  });
});

describe("Canonical Markdown renderer failure and escaping paths", () => {
  it("escapes every special navigation and Mermaid character deterministically", () => {
    const escaped = navigation("&<>|\\\r\n_*!#[]");
    expect(escaped).toContain("&amp;");
    expect(escaped).toContain("&lt;");
    expect(escaped).toContain("&gt;");
    expect(escaped).toContain("&#124;");
    expect(escaped).toContain("&#92;");
    expect(escaped).toContain("&#13;");
    expect(escaped).toContain("&#10;");
    expect(escaped).not.toContain("\n");
    const label = mermaidLabel('X"&<>\r\n');
    expect(label).toContain("&quot;");
    expect(label).toContain("&#10;");
    expect(utf8Sort("a", "b")).toBeLessThan(0);
  });

  it("uses safe fences with empty data, newlines and nested backticks", () => {
    const ticks = String.fromCharCode(96);
    const empty: string[] = [];
    fenced(empty, "", "yaml");
    expect(empty).toEqual([ticks.repeat(3) + "yaml", ticks.repeat(3)]);
    const converted: string[] = [];
    fenced(converted, "a\r\nb\rc\n", "markdown");
    expect(converted).toEqual([ticks.repeat(3) + "markdown", "a", "b", "c", ticks.repeat(3)]);
    const long: string[] = [];
    fenced(long, "before " + ticks.repeat(5) + " after", "markdown");
    expect(long[0]).toBe(ticks.repeat(6) + "markdown");
    expect(long.at(-1)).toBe(ticks.repeat(6));
  });

  it("does not invent Commit Message summaries when headings are nonstandard", () => {
    expect(summaryFromMessage()).toBe("无规范简介");
    expect(summaryFromMessage("## 改动\nChange\n## 简介\nLater")).toBe("无规范简介");
    expect(summaryFromMessage("## 简介\n\n## 改动\n- Changed")).toBe("无规范简介");
    expect(summaryFromMessage("## 简介\r\n\r\nOne line\r\n## 改动\n")).toBe("One line");
  });

  it("rejects invalid anchors instead of silently generating wrong line offsets", () => {
    const document = new MarkdownDocument();
    expect(() => {
      document.begin(999);
    }).toThrow("Invalid");
    expect(() => {
      document.end(999);
    }).toThrow("Invalid");
    const id = document.reserve();
    expect(() => {
      document.end(id);
    }).toThrow("Invalid");
    document.begin(id);
    expect(() => {
      document.begin(id);
    }).toThrow("Invalid");
    document.lines.push("# Section");
    expect(() => document.finish()).toThrow("Unclosed");
    document.end(id);
    expect(() => {
      document.end(id);
    }).toThrow("Invalid");
    expect(document.finish()).toEqual(["# Section"]);
  });

  it("fails oversized complete views rather than silently truncating", () => {
    const document = new MarkdownDocument();
    document.lines.push("x".repeat(MAX_VIEW_BYTES + 1));
    expect(() => document.finish()).toThrow("resource budget");
  });
});
