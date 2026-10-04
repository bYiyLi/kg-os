import { type OntologyReadItem, type Summary } from "@kgos/sdk";

import { type OntologyBrowser, ONTOLOGY_LIMITS } from "./ontology-controller.js";

export interface OntologyNode {
  summary: Summary;
  external: boolean;
  expanded: boolean;
}
interface OntologyLink {
  from: string;
  to: string;
  kind: "membership" | "endpoint";
}
export interface OntologyProjection {
  nodes: OntologyNode[];
  links: OntologyLink[];
  limited: boolean;
}

function refName(ref: string): string {
  const encoded = ref.slice(ref.indexOf(":") + 1);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

class ProjectionBuilder {
  readonly nodes = new Map<string, OntologyNode>();
  readonly links = new Map<string, OntologyLink>();
  readonly summaries: Map<string, Summary>;
  limited = false;

  constructor(readonly browser: OntologyBrowser) {
    this.summaries = browser.summaries();
  }

  add(summary: Summary, external = false) {
    if (this.nodes.has(summary.ref)) return;
    if (this.nodes.size >= ONTOLOGY_LIMITS.nodes) {
      this.limited = true;
      return;
    }
    this.nodes.set(summary.ref, {
      summary,
      external,
      expanded: this.browser.pages.has(summary.ref)
    });
  }

  link(from: string, to: string, kind: OntologyLink["kind"]) {
    const key = `${kind}:${from}:${to}`;
    if (this.links.has(key)) return;
    if (this.links.size >= ONTOLOGY_LIMITS.edges || !this.nodes.has(from) || !this.nodes.has(to))
      this.limited = true;
    else this.links.set(key, { from, to, kind });
  }

  page(page: OntologyReadItem) {
    if (page.ref !== undefined)
      this.add(
        this.summaries.get(page.ref) ?? {
          ref: page.ref,
          kind: "domain",
          name: refName(page.ref),
          ...(page.title === undefined ? {} : { title: page.title }),
          ...(page.description === undefined ? {} : { description: page.description })
        }
      );
    for (const item of page.items) this.add(item);
  }

  pageLinks(page: OntologyReadItem) {
    if (page.ref !== undefined)
      for (const item of page.items) this.link(page.ref, item.ref, "membership");
    for (const item of page.items) {
      if (item.kind === "relationship-definition") this.endpoints(item);
    }
  }

  private endpoints(item: Summary) {
    for (const [ref, incoming] of [
      [item.from, true],
      [item.to, false]
    ] as const) {
      if (ref === undefined) continue;
      this.add(
        this.summaries.get(ref) ?? { ref, kind: "node-definition", name: refName(ref) },
        !this.nodes.has(ref)
      );
      this.link(incoming ? ref : item.ref, incoming ? item.ref : ref, "endpoint");
    }
  }
}

export function ontologyProjection(browser: OntologyBrowser): OntologyProjection {
  const builder = new ProjectionBuilder(browser);
  const pages =
    browser.scope === undefined
      ? [...browser.pages.values()]
      : [browser.page].filter((page) => page !== undefined);
  for (const page of pages) builder.page(page);
  for (const page of pages) builder.pageLinks(page);
  return {
    nodes: [...builder.nodes.values()],
    links: [...builder.links.values()],
    limited: builder.limited
  };
}
