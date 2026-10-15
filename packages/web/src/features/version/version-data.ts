import type {
  EvolutionAncestryRequest,
  EvolutionAncestryResult,
  EvolutionGetRequest,
  EvolutionGetResult,
  EvolutionRefItem,
  EvolutionRefListResult,
  RequestOptions,
  StateSummary
} from "@kgos/sdk";

// The browser uses the existing authenticated SDK; no parallel HTTP transport.
export interface VersionReader {
  branch: { list: (options?: RequestOptions) => Promise<EvolutionRefListResult> };
  tag: { list: (options?: RequestOptions) => Promise<EvolutionRefListResult> };
  ancestry: (
    request: EvolutionAncestryRequest,
    options?: RequestOptions
  ) => Promise<EvolutionAncestryResult>;
  get: (
    request: EvolutionGetRequest,
    options?: RequestOptions
  ) => Promise<Pick<EvolutionGetResult, "state">>;
}

type BranchColor = "blue" | "green" | "violet" | "orange";

export interface VersionBranch extends EvolutionRefItem {
  color: BranchColor;
}

interface VersionPage {
  root: string;
  items: StateSummary[];
  cursor?: string;
}

export interface VersionSnapshot {
  branches: VersionBranch[];
  tags: EvolutionRefItem[];
  pages: Record<string, VersionPage>;
}

interface VersionRef {
  kind: "branch" | "tag";
  name: string;
}

export interface VersionCommit extends StateSummary {
  reachableFrom: string[];
  refs: VersionRef[];
  merge: boolean;
}

const colors: readonly BranchColor[] = ["blue", "green", "violet", "orange"];
const PAGE_SIZE = 20;

export function stateRef(state: string): string {
  return state.startsWith("commit/") ? state : "commit/" + state;
}

export function flattenCommits(
  snapshot: VersionSnapshot,
  selected: ReadonlySet<string>
): VersionCommit[] {
  const commits = new Map<string, VersionCommit>();
  for (const branch of snapshot.branches) {
    if (!selected.has(branch.name)) continue;
    for (const item of snapshot.pages[branch.name]?.items ?? []) {
      let commit = commits.get(item.state);
      if (commit === undefined) {
        commit = { ...item, reachableFrom: [], refs: [], merge: item.parents.length > 1 };
        commits.set(item.state, commit);
      }
      commit.reachableFrom.push(branch.name);
    }
  }
  for (const commit of commits.values()) {
    commit.refs = [
      ...snapshot.branches
        .filter((branch) => branch.state === commit.state)
        .map((branch) => ({ kind: "branch" as const, name: branch.name })),
      ...snapshot.tags
        .filter((tag) => tag.state === commit.state)
        .map((tag) => ({ kind: "tag" as const, name: tag.name }))
    ];
  }
  return [...commits.values()].sort((a, b) => {
    if (a.committedAt !== b.committedAt) return b.committedAt - a.committedAt;
    if (a.state < b.state) return -1;
    if (a.state > b.state) return 1;
    return 0;
  });
}

async function batches<T, R>(
  input: readonly T[],
  signal: AbortSignal,
  fetch: (item: T) => Promise<R>
): Promise<R[]> {
  const output: (R | undefined)[] = Array.from({ length: input.length }, () => undefined);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, input.length) }, async () => {
      while (next < input.length) {
        signal.throwIfAborted();
        const i = next++;
        const item = input[i];
        if (item !== undefined) output[i] = await fetch(item);
      }
    })
  );
  return output.map((item) => {
    if (item === undefined) throw new Error("Missing paginated Evolution response");
    return item;
  });
}

function assertRefs(value: EvolutionRefListResult): EvolutionRefItem[] {
  if (
    !Array.isArray(value.items) ||
    !value.items.every((item) => typeof item.name === "string" && typeof item.state === "string")
  ) {
    throw new Error("Invalid Evolution ref response");
  }
  return value.items.map((item) => ({ ...item, state: stateRef(item.state) }));
}

function validatedStates(items: StateSummary[]): StateSummary[] {
  return items.map((item) => {
    // The Go daemon serializes no parents as null, despite the SDK's [] type.
    const parents: unknown = item.parents;
    if (
      typeof item.state !== "string" ||
      typeof item.committedAt !== "number" ||
      (parents !== null &&
        (!Array.isArray(parents) ||
          !parents.every((parent: unknown) => typeof parent === "string")))
    ) {
      throw new Error("Invalid Evolution ancestry entry");
    }
    return {
      ...item,
      state: stateRef(item.state),
      parents: parents === null ? [] : parents.map(stateRef)
    };
  });
}

async function page(
  reader: VersionReader,
  root: string,
  cursor: string | undefined,
  signal: AbortSignal
): Promise<VersionPage> {
  const response = await reader.ancestry(
    { root, limit: PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) },
    { signal }
  );
  if (
    !Array.isArray(response.items) ||
    typeof response.root !== "string" ||
    stateRef(response.root) !== root
  ) {
    throw new Error("Invalid Evolution ancestry response");
  }
  return {
    root,
    items: validatedStates(response.items),
    ...(typeof response.cursor === "string" && response.cursor.length > 0
      ? { cursor: response.cursor }
      : {})
  };
}

export async function loadVersions(
  reader: VersionReader,
  signal: AbortSignal
): Promise<VersionSnapshot> {
  const [branchResponse, tagResponse] = await Promise.all([
    reader.branch.list({ signal }),
    reader.tag.list({ signal })
  ]);
  const branches = assertRefs(branchResponse).map((branch, index) => ({
    ...branch,
    color: colors[index % colors.length] ?? "blue"
  }));
  const tags = assertRefs(tagResponse);
  const pages = await batches(branches, signal, async (branch) =>
    page(reader, stateRef(branch.state), undefined, signal)
  );
  // Branch names are data (including "__proto__"), never object prototype keys.
  const indexed = Object.create(null) as Record<string, VersionPage>;
  for (const [index, branch] of branches.entries()) {
    const result = pages[index];
    if (result === undefined) throw new Error("Missing Evolution ancestry page");
    indexed[branch.name] = result;
  }
  return { branches, tags, pages: indexed };
}

export function hasMore(snapshot: VersionSnapshot, selected: ReadonlySet<string>): boolean {
  return snapshot.branches.some(
    (branch) => selected.has(branch.name) && snapshot.pages[branch.name]?.cursor !== undefined
  );
}

export async function loadMoreVersions(
  reader: VersionReader,
  snapshot: VersionSnapshot,
  selected: ReadonlySet<string>,
  signal: AbortSignal
): Promise<VersionSnapshot> {
  const pending = snapshot.branches.filter(
    (branch) => selected.has(branch.name) && snapshot.pages[branch.name]?.cursor !== undefined
  );
  const next = await batches(pending, signal, async (branch) => {
    const previous = snapshot.pages[branch.name];
    if (previous === undefined) throw new Error("Missing branch history");
    const update = await page(reader, previous.root, previous.cursor, signal);
    const items = new Map(previous.items.map((item) => [item.state, item]));
    for (const item of update.items) items.set(item.state, item);
    return { ...update, items: [...items.values()] };
  });
  const pages = Object.assign(Object.create(null) as Record<string, VersionPage>, snapshot.pages);
  for (const [index, branch] of pending.entries()) {
    const result = next[index];
    if (result !== undefined) pages[branch.name] = result;
  }
  return { ...snapshot, pages };
}
