import {
  type EvolutionChange,
  type EvolutionDiffRequest,
  type EvolutionHistoryEntry,
  type EvolutionHistoryRequest,
  type JsonValue
} from "@kgos/sdk";

import { type Connection } from "./connection.js";
import { VersionOperation } from "./version-operation.js";
import { eachSource, readSourced, sourceField } from "./version-value-source.js";

export type ChangeQuery =
  | { mode: "history"; request: EvolutionHistoryRequest }
  | { mode: "diff"; request: EvolutionDiffRequest };

export class VersionChanges extends VersionOperation {
  query: ChangeQuery | undefined;
  changes: EvolutionChange[] = [];
  readonly changeSources = new WeakMap<EvolutionChange, string>();
  history: EvolutionHistoryEntry[] = [];
  before = "";
  after = "";
  cursor: string | undefined;

  async openPinned(input: ChangeQuery) {
    const query = structuredClone(input);
    const states =
      query.mode === "history" ? [query.request.root] : [query.request.before, query.request.after];
    if (query.request.object !== undefined) states.push(query.request.object.anchorState);
    const resolved = await this.run(async (client, signal) => {
      const entries = await Promise.all(
        [...new Set(states)].map(async (state) => {
          const result = await client.evolution.get({ state }, { signal });
          return [state, result.state] as const;
        })
      );
      return new Map(entries);
    });
    if (resolved === undefined) return;
    const object =
      query.request.object === undefined
        ? {}
        : {
            object: {
              ...query.request.object,
              anchorState:
                resolved.get(query.request.object.anchorState) ?? query.request.object.anchorState
            }
          };
    if (query.mode === "history")
      await this.open({
        mode: query.mode,
        request: {
          ...query.request,
          root: resolved.get(query.request.root) ?? query.request.root,
          ...object
        }
      });
    else
      await this.open({
        mode: query.mode,
        request: {
          ...query.request,
          before: resolved.get(query.request.before) ?? query.request.before,
          after: resolved.get(query.request.after) ?? query.request.after,
          ...object
        }
      });
  }

  async open(query: ChangeQuery) {
    this.cancel();
    this.query = structuredClone(query);
    this.changes = [];
    this.history = [];
    this.cursor = undefined;
    this.before = "";
    this.after = "";
    await this.more();
  }

  async more() {
    const query = this.query;
    if (query === undefined || this.busy) return;
    if ((this.changes.length !== 0 || this.history.length !== 0) && this.cursor === undefined)
      return;
    const cursor = this.cursor === undefined ? {} : { cursor: this.cursor };
    if (query.mode === "history") {
      const response = await this.run((client, signal) =>
        readSourced(
          (options) => client.evolution.history({ ...query.request, ...cursor }, options),
          signal
        )
      );
      if (response === undefined || this.query !== query) return;
      const page = response.value;
      eachSource(response.source, page.items, (entry, raw) => {
        const source = sourceField(raw, "change");
        if (entry.change !== null && source !== undefined)
          this.changeSources.set(entry.change, source);
      });
      this.history.push(...page.items);
      this.after = page.root;
      this.cursor = page.cursor;
    } else {
      const response = await this.run((client, signal) =>
        readSourced(
          (options) => client.evolution.diff({ ...query.request, ...cursor }, options),
          signal
        )
      );
      if (response === undefined || this.query !== query) return;
      const page = response.value;
      eachSource(response.source, page.items, (change, source) => {
        this.changeSources.set(change, source);
      });
      this.changes.push(...page.items);
      this.before = page.before;
      this.after = page.after;
      this.cursor = page.cursor;
    }
    this.changed();
  }
}

export class ChangeSide extends VersionOperation {
  value: JsonValue | undefined;
  source: string | undefined;
  ref = "";
  state = "";
  absent = false;

  async read(state: string, ref: string | undefined) {
    this.cancel();
    this.value = undefined;
    this.source = undefined;
    this.ref = ref ?? "";
    this.state = state;
    this.absent = ref === undefined;
    if (ref === undefined) return;
    const response = await this.run((client, signal) =>
      readSourced((options) => client.object.read({ at: state, refs: [ref] }, options), signal)
    );
    if (response === undefined) return;
    const result = response.value;
    if (result.state !== state) this.error = "对象返回 State 与请求不一致";
    else {
      this.value = result.results.find((item) => item.ref === ref)?.value;
      eachSource(
        response.source,
        result.results,
        (item, source) => {
          if (item.ref === ref) this.source = sourceField(source, "value");
        },
        "results"
      );
    }
    if (this.value === undefined && this.error === "") this.error = "这一侧未返回完整对象";
    this.changed();
  }
}

export class ChangeDetails {
  readonly before: ChangeSide;
  readonly after: ChangeSide;

  constructor(connection: Connection) {
    this.before = new ChangeSide(connection);
    this.after = new ChangeSide(connection);
  }

  async open(change: EvolutionChange, before: string, after: string) {
    await Promise.all([
      this.before.read(before, change.beforeRef),
      this.after.read(after, change.afterRef)
    ]);
  }
}
