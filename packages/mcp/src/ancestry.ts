import type { KGOSClient, StateSummary } from "@kgos/sdk";

import { commitMessage, fenced, MarkdownDocument, mermaidLabel, navigation } from "./markdown.js";
import { ExecutionError } from "./sandbox.js";

export interface AncestryInput {
  root: string;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface AncestryOutput {
  root: string;
  count: number;
  cursor?: string;
  markdown: string;
}

function renderCommitTable(items: StateSummary[]): string[] {
  return items.map(
    (item) =>
      `| ${navigation(item.state)} | ${item.parents.map(navigation).join(", ") || "—"} | ${navigation(item.author ?? "—")} | ${String(item.committedAt)} |`
  );
}

function renderMermaidDag(items: StateSummary[]): string {
  const present = new Set(items.map((item) => item.state));
  const ids = new Map<string, string>();
  for (const item of items) {
    ids.set(item.state, "");
    for (const parent of item.parents) ids.set(parent, "");
  }
  let number = 0;
  for (const ref of ids.keys()) ids.set(ref, "n" + String(number++));
  const idOf = (ref: string): string => {
    const id = ids.get(ref);
    if (id === undefined) throw new Error("Missing DAG node identity");
    return id;
  };
  const graph = ["flowchart TD"];
  for (const ref of ids.keys()) {
    const suffix = present.has(ref) ? "" : "（未在本页展开）";
    graph.push("  " + idOf(ref) + '["' + mermaidLabel(ref + suffix) + '"]');
  }
  for (const item of items) {
    for (const parent of item.parents) graph.push("  " + idOf(item.state) + " --> " + idOf(parent));
  }
  return graph.join("\n");
}

export async function stateAncestry(
  client: KGOSClient,
  input: AncestryInput,
  signal?: AbortSignal
): Promise<AncestryOutput> {
  const limit = input.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new ExecutionError("INVALID_ARGUMENT", "limit must be between 1 and 1000");
  }
  const response = await client.evolution.ancestry(
    input.cursor === undefined
      ? { root: input.root, limit }
      : { root: input.root, limit, cursor: input.cursor },
    signal === undefined ? undefined : { signal }
  );
  if (!response.root.startsWith("commit/")) {
    throw new ExecutionError("RESOURCE_ERROR", "Ancestry did not resolve an immutable Commit");
  }
  const items = (Array.isArray(response.items) ? response.items : []).map((item) => ({
    ...item,
    parents: Array.isArray(item.parents) ? item.parents : []
  }));

  const document = new MarkdownDocument();
  const lines = document.lines;
  lines.push(
    "# Version History",
    "",
    `**Root:** ${navigation(response.root)}`,
    `**Page Count:** ${String(items.length)}`,
    "",
    "## Commit DAG（本页）",
    ""
  );
  fenced(lines, renderMermaidDag(items), "mermaid");
  lines.push(
    "",
    "## Commits",
    "",
    "| State | Parents | Author | Committed At (µs) |",
    "| --- | --- | --- | ---: |",
    ...renderCommitTable(items),
    "",
    "## Commit 详情",
    ""
  );

  for (const item of items) {
    lines.push(
      `### ${navigation(item.state)}`,
      "",
      `**Parents:** ${item.parents.map(navigation).join(", ") || "—"}`,
      `**Author:** ${navigation(item.author ?? "—")}`,
      `**Committed At:** ${String(item.committedAt)}（UTC Unix microseconds）`,
      "",
      "#### Commit Message",
      ""
    );
    commitMessage(lines, item.message);
    lines.push("");
  }
  const rendered = document.finish().join("\n") + "\n";
  return {
    root: response.root,
    count: items.length,
    ...(response.cursor === undefined ? {} : { cursor: response.cursor }),
    markdown: rendered
  };
}
