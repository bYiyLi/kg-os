import { type EvolutionAncestryRequest, type StateSummary } from "@kgos/sdk";

import { VersionOperation } from "./version-operation.js";

export interface DagNode {
  item: StateSummary;
  lane: number;
  row: number;
  parents: { state: string; lane: number }[];
}

export function ancestryLayout(items: StateSummary[]): DagNode[] {
  const frontier: (string | undefined)[] = [];
  return items.map((item, row) => {
    let lane = frontier.indexOf(item.state);
    if (lane < 0) lane = frontier.indexOf(undefined);
    if (lane < 0) lane = frontier.length;
    frontier[lane] = undefined;
    const parents = item.parents.map((state, index) => {
      let parentLane = frontier.indexOf(state);
      if (parentLane < 0) {
        parentLane =
          index === 0 && frontier[lane] === undefined ? lane : frontier.indexOf(undefined);
        if (parentLane < 0) parentLane = frontier.length;
        frontier[parentLane] = state;
      }
      return { state, lane: parentLane };
    });
    return { item, lane, row, parents };
  });
}

export class VersionHistory extends VersionOperation {
  items: StateSummary[] = [];
  nodes: DagNode[] = [];
  root = "";
  resolvedRoot = "";
  cursor: string | undefined;
  limited = false;
  private query: EvolutionAncestryRequest | undefined;

  async open(root: string) {
    this.cancel();
    this.root = root;
    this.resolvedRoot = "";
    this.items = [];
    this.nodes = [];
    this.cursor = undefined;
    this.limited = false;
    this.query = { root, limit: 20 };
    await this.more();
  }

  async more() {
    if (this.busy || this.query === undefined || this.limited) return;
    if (this.items.length !== 0 && this.cursor === undefined) return;
    const query = this.query;
    const page = await this.run((client, signal) =>
      client.evolution.ancestry(
        { ...query, ...(this.cursor === undefined ? {} : { cursor: this.cursor }) },
        { signal }
      )
    );
    if (page === undefined || this.query !== query) return;
    const seen = new Set(this.items.map((item) => item.state));
    for (const item of page.items) {
      if (!seen.has(item.state)) {
        this.items.push(item);
        seen.add(item.state);
      }
    }
    this.resolvedRoot = page.root;
    this.cursor = page.cursor;
    this.limited = this.items.length >= 4000;
    this.nodes = ancestryLayout(this.items);
    this.changed();
  }
}
