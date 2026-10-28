import type {
  ObjectReadRequest,
  ObjectReadResult,
  OntologyReadRequest,
  OntologyReadResult,
  RequestOptions,
  ResolvedState
} from "@kgos/sdk";

export interface DomainReader {
  ontology: {
    read: (request: OntologyReadRequest, options?: RequestOptions) => Promise<OntologyReadResult>;
  };
  object: {
    read: (request: ObjectReadRequest, options?: RequestOptions) => Promise<ObjectReadResult>;
  };
}

interface DomainNode {
  ref: string;
  name: string;
  title?: string;
  description?: string;
  children: string[];
}

export interface DomainTree {
  state: ResolvedState;
  nodes: Map<string, DomainNode>;
  roots: string[];
}

interface OverviewPage {
  items: unknown[];
  total: number;
  cursor?: string;
}

interface DomainSummary {
  ref: string;
  name: string;
}

const PAGE_SIZE = 100;

function invalidResponse(): never {
  throw new Error("Invalid Domain navigation response");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalidResponse();
  return value as Record<string, unknown>;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalidResponse();
  return value;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") invalidResponse();
  return value;
}

function summaryPrefix(kind: unknown): string {
  if (kind === "domain") return "domain:";
  if (kind === "node-definition") return "node:";
  if (kind === "relationship-definition") return "relationship:";
  return invalidResponse();
}

function overviewPage(response: OntologyReadResult, state: ResolvedState): OverviewPage {
  const value = record(response);
  const results = list(value["results"]);
  if (value["state"] !== state || results.length !== 1) invalidResponse();
  const page = record(results[0]);
  const total = page["total"];
  const cursor = optionalText(page["cursor"]);
  if (page["kind"] !== "overview" || !Number.isSafeInteger(total) || Number(total) < 0)
    invalidResponse();
  // The current Go empty-page encoder emits null instead of an empty slice.
  const items = page["items"] === null ? [] : list(page["items"]);
  if (items.length > PAGE_SIZE) invalidResponse();
  return {
    items,
    total: Number(total),
    ...(cursor === undefined || cursor === "" ? {} : { cursor })
  };
}

function addSummary(raw: unknown, allRefs: Set<string>, domains: Map<string, DomainSummary>) {
  const value = record(raw);
  const ref = value["ref"];
  const prefix = summaryPrefix(value["kind"]);
  if (
    typeof ref !== "string" ||
    !ref.startsWith(prefix) ||
    ref.length === prefix.length ||
    allRefs.has(ref)
  )
    invalidResponse();
  allRefs.add(ref);
  if (value["kind"] !== "domain") return;
  const name = value["name"];
  if (typeof name !== "string" || name === "") invalidResponse();
  domains.set(ref, { ref, name });
}

function checkContinuation(page: OverviewPage, count: number, cursors: Set<string>) {
  if (page.cursor === undefined) return;
  if (page.items.length === 0 || count === page.total || cursors.has(page.cursor))
    invalidResponse();
  cursors.add(page.cursor);
}

async function domainSummaries(reader: DomainReader, state: ResolvedState, signal: AbortSignal) {
  const domains = new Map<string, DomainSummary>();
  const allRefs = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let expected: number | undefined;
  do {
    signal.throwIfAborted();
    const response = await reader.ontology.read(
      { at: state, limit: PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) },
      { signal }
    );
    signal.throwIfAborted();
    const page = overviewPage(response, state);
    if (expected !== undefined && page.total !== expected) invalidResponse();
    expected = page.total;
    for (const item of page.items) addSummary(item, allRefs, domains);
    if (allRefs.size > expected) invalidResponse();
    checkContinuation(page, allRefs.size, cursors);
    cursor = page.cursor;
  } while (cursor !== undefined);
  if (allRefs.size !== expected) invalidResponse();
  return domains;
}

function domainNode(raw: unknown, expected: DomainSummary): DomainNode {
  const item = record(raw);
  if (item["kind"] !== "domain" || item["ref"] !== expected.ref) invalidResponse();
  const value = record(item["value"]);
  if (value["name"] !== expected.name) invalidResponse();
  const includes = value["includes"] === null ? [] : list(value["includes"]);
  const refs = new Set<string>();
  for (const ref of includes) {
    if (typeof ref !== "string" || !/^(?:domain|node|relationship):.+$/.test(ref) || refs.has(ref))
      invalidResponse();
    refs.add(ref);
  }
  const title = optionalText(value["title"]);
  const description = optionalText(value["description"]);
  return {
    ...expected,
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    children: [...refs].filter((ref) => ref.startsWith("domain:")).sort()
  };
}

async function readDomainNodes(
  reader: DomainReader,
  state: ResolvedState,
  domains: Map<string, DomainSummary>,
  signal: AbortSignal
) {
  const summaries = [...domains.values()];
  const nodes = new Map<string, DomainNode>();
  for (let start = 0; start < summaries.length; start += PAGE_SIZE) {
    signal.throwIfAborted();
    const batch = summaries.slice(start, start + PAGE_SIZE);
    const response = record(
      await reader.object.read({ at: state, refs: batch.map((item) => item.ref) }, { signal })
    );
    signal.throwIfAborted();
    const results = list(response["results"]);
    if (response["state"] !== state || results.length !== batch.length) invalidResponse();
    for (const [index, expected] of batch.entries()) {
      const node = domainNode(results[index], expected);
      nodes.set(node.ref, node);
    }
  }
  return nodes;
}

function treeRoots(nodes: Map<string, DomainNode>): string[] {
  const included = new Set<string>();
  for (const node of nodes.values()) {
    for (const ref of node.children) {
      if (!nodes.has(ref)) invalidResponse();
      included.add(ref);
    }
  }
  const refs = [...nodes.keys()].sort();
  const roots = refs.filter((ref) => !included.has(ref));
  const reached = new Set<string>();
  function visit(start: string) {
    const pending = [start];
    while (pending.length > 0) {
      const ref = pending.pop();
      if (ref === undefined || reached.has(ref)) continue;
      reached.add(ref);
      for (const child of nodes.get(ref)?.children ?? []) pending.push(child);
    }
  }
  for (const ref of roots) visit(ref);
  for (const ref of refs) {
    if (reached.has(ref)) continue;
    roots.push(ref);
    visit(ref);
  }
  return roots;
}

export async function loadDomainTree(
  reader: DomainReader,
  state: ResolvedState,
  signal: AbortSignal
): Promise<DomainTree> {
  if (!/^commit\/[0-9a-f]{64}$/.test(state)) invalidResponse();
  const summaries = await domainSummaries(reader, state, signal);
  const nodes = await readDomainNodes(reader, state, summaries, signal);
  signal.throwIfAborted();
  return { state, nodes, roots: treeRoots(nodes) };
}
