import type {
  KGOSClient,
  JsonValue,
  ObjectReadItem,
  ObjectTextReadItem,
  Summary,
  StateSummary
} from "@kgos/sdk";

import {
  commitMessage,
  fenced,
  MarkdownDocument,
  mermaidLabel,
  navigation,
  summaryFromMessage,
  utf8Sort
} from "./markdown.js";
import { ExecutionError } from "./sandbox.js";

const PAGE_SIZE = 100;
const MAX_ITEMS = 50_000;
export interface PreviewLimits {
  maxItems: number;
  entries: number;
  ttlMs: number;
}

export const DEFAULT_PREVIEW_LIMITS: PreviewLimits = {
  maxItems: MAX_ITEMS,
  entries: 8,
  ttlMs: 600_000
};

interface ViewOptions {
  signal?: AbortSignal;
  maxItems: number;
}

export interface PreviewInput {
  offset?: number | undefined;
  limit?: number | undefined;
  viewRevision?: string | undefined;
}

export interface PreviewOutput {
  totalLines: number;
  offset: number;
  lineCount: number;
  viewRevision: string;
  preview: string;
}

interface Definition {
  summary: Summary;
  body: string;
  value: JsonValue;
}

interface Domain {
  summary: Summary;
  members: Summary[];
  body: string;
}

interface BranchSnapshot {
  name: string;
  head: string;
  commit: StateSummary;
  domains: Domain[];
  definitions: Definition[];
}

function fail(message: string): never {
  throw new ExecutionError("RESOURCE_ERROR", message);
}

function record(value: JsonValue): Record<string, JsonValue> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    return fail("Definition has an invalid canonical value");
  }
  return value;
}

function isDefinition(summary: Summary): boolean {
  return summary.kind === "node-definition" || summary.kind === "relationship-definition";
}

function addSummary(target: Map<string, Summary>, item: Summary, maxItems: number): void {
  if (target.size >= maxItems && !target.has(item.ref)) {
    fail("Ontology exceeds view item budget");
  }
  const earlier = target.get(item.ref);
  if (earlier !== undefined && (earlier.kind !== item.kind || earlier.name !== item.name)) {
    fail("Ontology has inconsistent object identities");
  }
  target.set(item.ref, earlier ?? item);
}

interface OntologyPage {
  items: Summary[];
  total: number;
  cursor?: string;
}

function requireOntologyPage(
  result: Awaited<ReturnType<KGOSClient["ontology"]["read"]>>,
  state: string,
  scope: string | undefined
): OntologyPage {
  if (result.state !== state || result.results.length !== 1)
    fail("Ontology pagination changed pinned State or scope");
  const page = result.results[0];
  if (page === undefined || (scope !== undefined && page.ref !== scope))
    fail("Ontology pagination returned an unexpected scope");
  const received: unknown = page.items;
  const items = received === null && page.total === 0 ? [] : received;
  if (!Array.isArray(items) || !Number.isSafeInteger(page.total) || page.total < 0) {
    fail("Ontology page has invalid or incomplete items");
  }
  const cursor: unknown = page.cursor;
  if (cursor !== undefined && cursor !== null && typeof cursor !== "string") {
    fail("Ontology page has an invalid cursor");
  }
  return {
    items: items as Summary[],
    total: page.total,
    ...(typeof cursor === "string" ? { cursor } : {})
  };
}

function advanceCursor(page: OntologyPage, visited: Set<string>): string {
  const cursor = page.cursor;
  if (cursor === undefined || page.items.length === 0 || visited.has(cursor)) {
    fail("Ontology pagination did not make progress");
  }
  visited.add(cursor);
  return cursor;
}

async function paginate(
  client: KGOSClient,
  state: string,
  scope: string | undefined,
  options: ViewOptions
): Promise<Summary[]> {
  let cursor: string | undefined;
  const visited = new Set<string>();
  const items: Summary[] = [];
  for (;;) {
    const { signal } = options;
    const result = await client.ontology.read(
      {
        at: state,
        ...(scope === undefined ? {} : { refs: [scope] }),
        limit: PAGE_SIZE,
        ...(cursor === undefined ? {} : { cursor })
      },
      signal === undefined ? undefined : { signal }
    );
    const page = requireOntologyPage(result, state, scope);
    if (items.length + page.items.length > options.maxItems)
      fail("Ontology pagination exceeds item budget");
    items.push(...page.items);
    if (page.cursor === undefined || page.cursor === "") {
      if (items.length !== page.total) fail("Ontology pagination is incomplete");
      return items;
    }
    cursor = advanceCursor(page, visited);
  }
}

async function loadBodies(
  client: KGOSClient,
  state: string,
  refs: string[],
  signal?: AbortSignal
): Promise<{ text: Map<string, ObjectTextReadItem>; values: Map<string, ObjectReadItem> }> {
  const text = new Map<string, ObjectTextReadItem>();
  const values = new Map<string, ObjectReadItem>();
  for (let index = 0; index < refs.length; index += PAGE_SIZE) {
    const batch = refs.slice(index, index + PAGE_SIZE);
    const [body, objects] = await Promise.all([
      client.object.readText(
        { at: state, refs: batch },
        signal === undefined ? undefined : { signal }
      ),
      client.object.read({ at: state, refs: batch }, signal === undefined ? undefined : { signal })
    ]);
    if (
      body.state !== state ||
      objects.state !== state ||
      body.results.length !== batch.length ||
      objects.results.length !== batch.length
    ) {
      fail("Object read changed pinned State or lost objects");
    }
    for (const item of body.results) text.set(item.ref, item);
    for (const item of objects.results) values.set(item.ref, item);
  }
  for (const ref of refs) {
    if (text.get(ref) === undefined || values.get(ref) === undefined) {
      fail("Canonical Ontology Object was unavailable");
    }
  }
  return { text, values };
}

function required<T>(map: Map<string, T>, ref: string): T {
  const value = map.get(ref);
  if (value === undefined) fail("Ontology Object was missing from pinned view");
  return value;
}

function classify(
  item: Summary,
  domains: Map<string, Summary>,
  definitions: Map<string, Summary>,
  maxItems: number
): boolean {
  if (item.kind === "domain") {
    const newlyDiscovered = !domains.has(item.ref);
    addSummary(domains, item, maxItems);
    return newlyDiscovered;
  }
  if (!isDefinition(item)) fail("Ontology contains an unknown kind");
  addSummary(definitions, item, maxItems);
  return false;
}

async function collectOntology(
  client: KGOSClient,
  head: string,
  overview: Summary[],
  options: ViewOptions
): Promise<{
  domains: Map<string, Summary>;
  definitions: Map<string, Summary>;
  membership: Map<string, Summary[]>;
}> {
  const domains = new Map<string, Summary>();
  const definitions = new Map<string, Summary>();
  const membership = new Map<string, Summary[]>();
  for (const item of overview) classify(item, domains, definitions, options.maxItems);
  const pending = [...domains.keys()];
  const expanded = new Set<string>();
  while (pending.length > 0) {
    const ref = pending.shift();
    if (ref === undefined || expanded.has(ref)) continue;
    expanded.add(ref);
    const members = await paginate(client, head, ref, options);
    membership.set(ref, members);
    for (const item of members) {
      if (classify(item, domains, definitions, options.maxItems)) pending.push(item.ref);
    }
  }
  return { domains, definitions, membership };
}

async function snapshotBranch(
  client: KGOSClient,
  name: string,
  head: string,
  options: ViewOptions
): Promise<BranchSnapshot> {
  if (!head.startsWith("commit/")) fail("Branch Head is not a pinned Commit");
  const { signal } = options;
  const [commit, overview] = await Promise.all([
    client.evolution.get({ state: head }, signal === undefined ? undefined : { signal }),
    paginate(client, head, undefined, options)
  ]);
  if (commit.state !== head) fail("Commit metadata does not match Branch Head");
  const { domains, definitions, membership } = await collectOntology(
    client,
    head,
    overview,
    options
  );
  const domainRefs = [...domains.keys()].sort(utf8Sort);
  const definitionRefs = [...definitions.keys()].sort(utf8Sort);
  const bodies = await loadBodies(client, head, [...domainRefs, ...definitionRefs], signal);
  return {
    name,
    head,
    commit: { ...commit, parents: Array.isArray(commit.parents) ? commit.parents : [] },
    domains: domainRefs.map((ref) => ({
      summary: required(domains, ref),
      members: membership.get(ref) ?? [],
      body: required(bodies.text, ref).body
    })),
    definitions: definitionRefs.map((ref) => ({
      summary: required(definitions, ref),
      body: required(bodies.text, ref).body,
      value: required(bodies.values, ref).value
    }))
  };
}

function relationshipEdge(def: Definition, refs: Map<string, string>): string | undefined {
  if (def.summary.kind !== "relationship-definition") return undefined;
  const value = record(def.value);
  const from = value["from"];
  const to = value["to"];
  if ((from !== null && typeof from !== "string") || (to !== null && typeof to !== "string"))
    fail("Relationship Definition has invalid endpoints");
  const start = typeof from === "string" ? refs.get(from) : undefined;
  const end = typeof to === "string" ? refs.get(to) : undefined;
  if (start !== undefined && end !== undefined)
    return "  " + start + ' -->|"' + mermaidLabel(def.summary.ref) + '"| ' + end;
  return (
    "  " +
    required(refs, def.summary.ref) +
    '["' +
    mermaidLabel(def.summary.ref) +
    '（端点无类型约束或未在模型中）"]'
  );
}

function definitionGraph(definitions: Definition[]): string {
  const lines = ["flowchart LR"];
  const refs = new Map<string, string>();
  for (const [index, def] of definitions.entries()) {
    const id = "d" + String(index);
    refs.set(def.summary.ref, id);
    lines.push("  " + id + '["' + mermaidLabel(def.summary.ref) + '"]');
  }
  for (const def of definitions) {
    const edge = relationshipEdge(def, refs);
    if (edge !== undefined) lines.push(edge);
  }
  return lines.join("\n");
}

function renderHead(doc: MarkdownDocument, branch: BranchSnapshot): void {
  const lines = doc.lines;
  lines.push(
    `## ${navigation(branch.name)}`,
    "",
    `**Ref:** ${navigation("branch/" + branch.name)}`,
    `**State:** ${navigation(branch.head)}`,
    "",
    "### Head Commit",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Author | ${navigation(branch.commit.author ?? "—")} |`,
    "| Message | 见下文原文代码块 |",
    `| Committed At | ${String(branch.commit.committedAt)}（UTC Unix microseconds） |`,
    `| Parents | ${branch.commit.parents.map(navigation).join(", ") || "—"} |`,
    "",
    "### Commit Message",
    ""
  );
  commitMessage(lines, branch.commit.message);
  lines.push("", "### Ontology", "", "#### 目录", "");
}

function renderGraph(doc: MarkdownDocument, branch: BranchSnapshot, id: number): void {
  doc.begin(id);
  doc.lines.push("#### 模型关系图", "");
  fenced(doc.lines, definitionGraph(branch.definitions), "mermaid");
  doc.lines.push("");
  doc.end(id);
}

function renderDomains(doc: MarkdownDocument, branch: BranchSnapshot, id: number): void {
  const lines = doc.lines;
  doc.begin(id);
  lines.push("#### Domain 组织", "", "| Domain Ref | Title | Description |", "| --- | --- | --- |");
  for (const domain of branch.domains) {
    lines.push(
      `| ${navigation(domain.summary.ref)} | ${navigation(domain.summary.title ?? "—")} | ${navigation(domain.summary.description ?? "—")} |`
    );
  }
  lines.push("", "| Domain Ref | Member Ref |", "| --- | --- |");
  for (const domain of branch.domains) {
    for (const member of domain.members)
      lines.push(`| ${navigation(domain.summary.ref)} | ${navigation(member.ref)} |`);
  }
  lines.push("");
  for (const domain of branch.domains) {
    lines.push(`##### ${navigation(domain.summary.ref)}`, "");
    fenced(lines, domain.body, "yaml");
    lines.push("");
  }
  doc.end(id);
}

function renderDefinitions(
  doc: MarkdownDocument,
  branch: BranchSnapshot,
  indexId: number,
  detailsId: number
): void {
  const lines = doc.lines;
  const entries = branch.definitions.map((def) => ({ def, id: doc.reserve() }));
  doc.begin(indexId);
  lines.push(
    "#### Definition 索引",
    "",
    "| Ref | Title | Description | Offset | Lines |",
    "| --- | --- | --- | ---: | ---: |"
  );
  for (const { def, id } of entries) {
    lines.push(
      `| ${navigation(def.summary.ref)} | ${navigation(def.summary.title ?? "—")} | ${navigation(def.summary.description ?? "—")} | ${doc.offset(id)} | ${doc.length(id)} |`
    );
  }
  lines.push("");
  doc.end(indexId);
  doc.begin(detailsId);
  lines.push("#### Definition 详情", "");
  for (const { def, id } of entries) {
    doc.begin(id);
    lines.push(`##### ${navigation(def.summary.ref)}`, "");
    fenced(lines, def.body, "yaml");
    lines.push("");
    doc.end(id);
  }
  doc.end(detailsId);
}

function renderBranch(doc: MarkdownDocument, branch: BranchSnapshot, anchor: number): void {
  doc.begin(anchor);
  renderHead(doc, branch);
  const graphId = doc.reserve();
  const domainsId = doc.reserve();
  const indexId = doc.reserve();
  const detailsId = doc.reserve();
  doc.lines.push(
    "| Section | Offset | Lines |",
    "| --- | ---: | ---: |",
    `| 模型关系图 | ${doc.offset(graphId)} | ${doc.length(graphId)} |`,
    `| Domain 组织 | ${doc.offset(domainsId)} | ${doc.length(domainsId)} |`,
    `| Definition 索引 | ${doc.offset(indexId)} | ${doc.length(indexId)} |`,
    `| Definition 详情 | ${doc.offset(detailsId)} | ${doc.length(detailsId)} |`,
    ""
  );
  renderGraph(doc, branch, graphId);
  renderDomains(doc, branch, domainsId);
  renderDefinitions(doc, branch, indexId, detailsId);
  doc.end(anchor);
}

export async function renderPreview(
  client: KGOSClient,
  options: ViewOptions = { maxItems: MAX_ITEMS }
): Promise<string[]> {
  const { signal } = options;
  const [overview, branches] = await Promise.all([
    client.evolution.overview(signal === undefined ? undefined : { signal }),
    client.evolution.branch.list(signal === undefined ? undefined : { signal })
  ]);
  const sorted = (Array.isArray(branches.items) ? [...branches.items] : []).sort((a, b) =>
    utf8Sort(a.name, b.name)
  );
  const snapshots: BranchSnapshot[] = [];
  for (const branch of sorted)
    snapshots.push(await snapshotBranch(client, branch.name, branch.state, options));
  const doc = new MarkdownDocument();
  const entries = snapshots.map((branch) => ({ branch, anchor: doc.reserve() }));
  const defaultBranch = overview.defaultBranch.startsWith("branch/")
    ? overview.defaultBranch
    : "branch/" + overview.defaultBranch;
  doc.lines.push(
    "# 分支",
    "",
    `**Default:** ${navigation(defaultBranch)}`,
    "",
    "| Branch | Head Commit | 当前简介（首行） | Offset | Lines |",
    "| --- | --- | --- | ---: | ---: |"
  );
  for (const { branch, anchor } of entries) {
    doc.lines.push(
      `| ${navigation(branch.name)} | ${navigation(branch.head)} | ${navigation(summaryFromMessage(branch.commit.message))} | ${doc.offset(anchor)} | ${doc.length(anchor)} |`
    );
  }
  doc.lines.push("", "---", "");
  for (const { branch, anchor } of entries) renderBranch(doc, branch, anchor);
  return doc.finish();
}
