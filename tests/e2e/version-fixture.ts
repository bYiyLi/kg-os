import type { Page, Route } from "@playwright/test";
// Synthetic browser fixture intentionally supplies bare Commit IDs to cover
// the Web adapter's normalization boundary, not the public SDK response type.
interface FixtureCommit {
  state: string;
  message: string;
  committedAt: number;
  parents: string[];
}

export interface FixtureDomain {
  name: string;
  title?: string;
  includes: string[];
}

export interface DomainReadCall {
  operation: "overview" | "objects";
  at: string;
  refs?: string[];
  cursor?: string;
}

function sha(prefix: string): string {
  return prefix.padEnd(64, "0");
}

export const states = {
  main: sha("a81c2f"),
  develop: sha("54c9a2"),
  merge: sha("9d3e7a"),
  experiment: sha("7a1d9e"),
  search: sha("6a9f2c"),
  shared: sha("e4c9a1"),
  index: sha("6e2d4f"),
  genesis: sha("3b7f9c")
};

const currentDomains: FixtureDomain[] = [
  { name: "Work", title: "Work", includes: ["domain:People", "domain:Projects"] },
  { name: "People", title: "People and organizations", includes: ["domain:Shared"] },
  { name: "Projects", title: "Projects and decisions", includes: ["domain:Shared"] },
  { name: "Shared", title: "Shared references", includes: [] },
  { name: "CycleA", title: "Cycle A", includes: ["domain:CycleB"] },
  { name: "CycleB", title: "Cycle B", includes: ["domain:CycleA"] },
  { name: "Technology", title: "Technology and tools", includes: [] }
];

function domainsAt(state: string): FixtureDomain[] {
  const resolved = state.replace(/^commit\//, "");
  if (resolved === states.main || resolved === states.search) return currentDomains;
  if (resolved === states.develop) return [];
  return [{ name: "Archive", title: "Historical archive", includes: [] }];
}

function domainOverview(state: string, records = domainsAt(state)) {
  return {
    state: state.startsWith("commit/") ? state : "commit/" + state,
    results: [
      {
        kind: "overview",
        items: records
          .map((domain) => ({
            kind: "domain",
            ref: "domain:" + domain.name,
            name: domain.name,
            ...(domain.title === undefined ? {} : { title: domain.title })
          }))
          .sort((left, right) => left.ref.localeCompare(right.ref)),
        total: records.length,
        markdown: ""
      }
    ]
  };
}

function domainObjects(state: string, refs: string[], records = domainsAt(state)) {
  return {
    state: state.startsWith("commit/") ? state : "commit/" + state,
    results: refs.map((ref) => {
      const value = records.find((domain) => "domain:" + domain.name === ref);
      if (value === undefined) throw new Error("Missing fixture Domain " + ref);
      return { kind: "domain", ref, value };
    })
  };
}

export async function mockDomainRoutes(
  page: Page,
  options: {
    records?: FixtureDomain[];
    pageSize?: number;
    behavior?: "repeat" | "failure";
  } = {}
) {
  const calls: DomainReadCall[] = [];
  await page.route("**/api/v1/ontology/read", async (route) => {
    const input = route.request().postDataJSON() as {
      at: string;
      cursor?: string;
    };
    calls.push({ operation: "overview", ...input });
    if (input.cursor !== undefined && options.behavior === "failure") {
      await route.fulfill({
        status: 503,
        json: { code: "IO_ERROR", message: "Domain overview unavailable" }
      });
      return;
    }
    const result = domainOverview(input.at, options.records);
    const item = result.results[0];
    if (item === undefined) throw new Error("Missing fixture overview");
    const offset = Number(input.cursor?.slice("offset:".length) ?? 0);
    const pageSize = options.pageSize ?? item.total;
    const repeated = input.cursor !== undefined && options.behavior === "repeat";
    const next = (repeated ? 0 : offset) + pageSize;
    let cursor: string | undefined;
    if (repeated) cursor = input.cursor;
    else if (next < item.total) cursor = `offset:${String(next)}`;
    await route.fulfill({
      json: {
        ...result,
        results: [
          {
            ...item,
            items: item.items.slice(repeated ? 0 : offset, next),
            ...(cursor === undefined ? {} : { cursor })
          }
        ]
      }
    });
  });
  await page.route("**/api/v1/object/read", async (route) => {
    const input = route.request().postDataJSON() as { at: string; refs: string[] };
    calls.push({ operation: "objects", ...input });
    await route.fulfill({ json: domainObjects(input.at, input.refs, options.records) });
  });
  return calls;
}

const branches = [
  { name: "main", state: states.main },
  { name: "develop", state: states.develop },
  { name: "experiment", state: states.experiment },
  { name: "feature/search", state: states.search }
];

const epoch = Date.now() * 1000;
function commit(
  state: string,
  message: string,
  hoursAgo: number,
  parents: string[]
): FixtureCommit {
  return { state, message, committedAt: epoch - hoursAgo * 3600 * 1_000_000, parents };
}

const items = {
  main: commit(states.main, "Update knowledge model", 2, [states.merge]),
  develop: commit(states.develop, "Improve query diagnostics", 4, [states.shared]),
  merge: commit(states.merge, "Merge experiment", 6, [states.shared, states.experiment]),
  experiment: commit(states.experiment, "Add knowledge sources", 9, [states.shared]),
  search: commit(states.search, "Add hybrid search", 24, [states.shared]),
  shared: commit(states.shared, "Fix node properties", 48, [states.index]),
  index: commit(states.index, "Add search index", 72, [states.genesis]),
  genesis: commit(states.genesis, "Initialize knowledge base", 120, [])
};

export const versionAncestry = new Map<string, FixtureCommit[]>([
  [
    states.main,
    [items.main, items.merge, items.experiment, items.shared, items.index, items.genesis]
  ],
  [states.develop, [items.develop, items.shared, items.index, items.genesis]],
  [states.experiment, [items.experiment, items.shared, items.index, items.genesis]],
  [states.search, [items.search, items.shared, items.index, items.genesis]]
]);

async function respond(route: Route, body: object) {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

// Read-only HTTP fixture for browser acceptance. The UI must still use the SDK
// and issue the real Evolution routes with their actual request shapes.
export async function mockVersionRoutes(page: Page) {
  await mockDomainRoutes(page);
  await page.route("**/api/v1/evolution/branch/list", async (route) =>
    respond(route, { items: branches })
  );
  await page.route("**/api/v1/evolution/tag/list", async (route) =>
    respond(route, { items: [{ name: "v0.1.0", state: states.genesis }] })
  );
  await page.route("**/api/v1/evolution/ancestry", async (route) => {
    const request = route.request().postDataJSON() as { root: string; limit: number };
    const root = request.root.replace(/^commit\//, "");
    await respond(route, { root, items: versionAncestry.get(root) ?? [] });
  });
  await page.route("**/api/v1/evolution/get", async (route) => {
    const request = route.request().postDataJSON() as { state: string };
    const state = request.state.replace(/^commit\//, "");
    const item = Object.values(items).find((candidate) => candidate.state === state);
    if (item === undefined) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ code: "NOT_FOUND", message: "State missing" })
      });
      return;
    }
    await respond(route, {
      ...item,
      consistency: { status: "valid", issues: [] },
      hasData: false,
      data: null
    });
  });
}
