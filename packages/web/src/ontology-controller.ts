import {
  KGOSDaemonError,
  type JsonObject,
  type ObjectReadItem,
  type OntologyReadItem,
  type Summary
} from "@kgos/sdk";

import { type Connection } from "./connection.js";
import { type Context } from "./context.js";
import { Observable } from "./observable.js";

export const ONTOLOGY_LIMITS = { page: 50, nodes: 200, edges: 500, expansions: 20 };

export class OntologyBrowser extends Observable {
  state = "";
  scope: string | undefined;
  readonly pages = new Map<string, OntologyReadItem>();
  selected: string | undefined;
  detail: ObjectReadItem | undefined;
  canonical = "";
  loading = false;
  inspecting = false;
  error = "";
  detailError = "";
  consistency: JsonObject | undefined;
  private generation = 0;
  private selection = 0;
  private readonly controllers = new Set<AbortController>();

  constructor(
    readonly connection: Connection,
    readonly context: Context
  ) {
    super();
  }
  get page() {
    return this.pages.get(this.scope ?? "");
  }

  private controller() {
    const controller = this.connection.controller();
    this.controllers.add(controller);
    return controller;
  }

  private release(controller: AbortController) {
    this.controllers.delete(controller);
    this.connection.release(controller);
  }

  dispose() {
    for (const controller of this.controllers) controller.abort();
  }

  async reload(): Promise<void> {
    this.dispose();
    this.generation += 1;
    this.selection += 1;
    this.loading = false;
    this.inspecting = false;
    this.state = this.context.state;
    this.scope = undefined;
    this.pages.clear();
    this.selected = undefined;
    this.detail = undefined;
    this.canonical = "";
    this.error = "";
    this.detailError = "";
    this.consistency = undefined;
    this.changed();
    if (this.state !== "") await this.load(undefined);
  }

  async navigate(ref: string | undefined): Promise<void> {
    if (this.loading) return;
    this.scope = ref;
    this.selected = ref;
    this.detail = undefined;
    this.canonical = "";
    this.error = "";
    this.changed();
    if (!this.pages.has(ref ?? "")) await this.load(ref);
    if (ref !== undefined) await this.inspect(ref);
  }

  async expand(ref: string): Promise<void> {
    if (!ref.startsWith("domain:") || this.pages.has(ref)) return;
    if (this.pages.size >= ONTOLOGY_LIMITS.expansions + 1) {
      this.error = "已达直接展开预算；可打开单个领域继续阅读";
      this.changed();
      return;
    }
    await this.load(ref);
  }

  async more(): Promise<void> {
    const page = this.page;
    if (page?.cursor !== undefined) await this.load(this.scope, page.cursor);
  }

  private async load(ref: string | undefined, cursor?: string): Promise<void> {
    const client = this.connection.client;
    if (client === undefined || this.loading) return;
    const generation = this.generation;
    const controller = this.controller();
    this.loading = true;
    this.error = "";
    this.changed();
    try {
      const result = await client.ontology.read(
        {
          at: this.state,
          limit: ONTOLOGY_LIMITS.page,
          ...(ref === undefined ? {} : { refs: [ref] }),
          ...(cursor === undefined ? {} : { cursor })
        },
        { signal: controller.signal }
      );
      if (
        controller.signal.aborted ||
        generation !== this.generation ||
        this.connection.client !== client
      )
        return;
      const page = result.results[0];
      if (
        result.state !== this.state ||
        result.results.length !== 1 ||
        page === undefined ||
        page.ref !== ref
      ) {
        throw new Error("Ontology 页面未返回同一完整 State / scope；不拼接分页");
      }
      const previous = cursor === undefined ? [] : (this.pages.get(ref ?? "")?.items ?? []);
      const summaries = new Map(previous.map((item) => [item.ref, item]));
      for (const item of page.items) summaries.set(item.ref, item);
      this.pages.set(ref ?? "", { ...page, items: [...summaries.values()] });
    } catch (error) {
      if (generation === this.generation) {
        this.error = this.connection.failure(error);
        if (
          error instanceof KGOSDaemonError &&
          error.code === "CONSISTENCY_ERROR" &&
          this.connection.client === client
        ) {
          await this.readConsistency(controller);
        }
      }
    } finally {
      this.release(controller);
      if (generation === this.generation) this.loading = false;
      this.changed();
    }
  }

  private async readConsistency(controller: AbortController) {
    const client = this.connection.client;
    if (client === undefined) return;
    const generation = this.generation;
    const expectedState = this.state;
    try {
      const state = await client.evolution.get(
        { state: expectedState },
        { signal: controller.signal }
      );
      if (
        controller.signal.aborted ||
        generation !== this.generation ||
        this.connection.client !== client
      )
        return;
      if (state.state !== expectedState) throw new Error("Snapshot 一致性诊断未返回同一 State");
      this.consistency = {
        status: state.consistency.status,
        issues: state.consistency.issues.map((issue) => ({ ...issue }))
      };
    } catch (error) {
      if (generation === this.generation && !controller.signal.aborted)
        this.detailError = this.connection.failure(error);
    }
  }

  async inspect(ref: string): Promise<void> {
    const client = this.connection.client;
    if (client === undefined) return;
    const selection = ++this.selection;
    const generation = this.generation;
    const controller = this.controller();
    this.selected = ref;
    this.detail = undefined;
    this.canonical = "";
    this.inspecting = true;
    this.detailError = "";
    this.changed();
    try {
      const result = await client.object.read(
        { at: this.state, refs: [ref] },
        { signal: controller.signal }
      );
      if (
        controller.signal.aborted ||
        selection !== this.selection ||
        generation !== this.generation ||
        this.connection.client !== client
      )
        return;
      const detail = result.results[0];
      if (result.state !== this.state || result.results.length !== 1 || detail?.ref !== ref)
        throw new Error("Definition / Domain aggregate 未完整返回；禁止截断编辑");
      this.detail = detail;
    } catch (error) {
      if (selection === this.selection) this.detailError = this.connection.failure(error);
    } finally {
      this.release(controller);
      if (selection === this.selection) this.inspecting = false;
      this.changed();
    }
  }

  async readCanonical(): Promise<void> {
    const client = this.connection.client;
    const ref = this.selected;
    if (client === undefined || ref === undefined || this.detail === undefined) return;
    const selection = this.selection;
    const controller = this.controller();
    try {
      const result = await client.object.readText(
        { at: this.state, refs: [ref] },
        { signal: controller.signal }
      );
      const body = result.results[0];
      if (controller.signal.aborted || selection !== this.selection) return;
      if (result.state !== this.state || body?.ref !== ref || result.results.length !== 1)
        throw new Error("canonical YAML State / Ref 不一致");
      this.canonical = body.body;
    } catch (error) {
      if (selection === this.selection && !controller.signal.aborted)
        this.detailError = this.connection.failure(error);
    } finally {
      this.release(controller);
      this.changed();
    }
  }

  summaries(): Map<string, Summary> {
    const result = new Map<string, Summary>();
    for (const page of this.pages.values())
      for (const item of page.items) result.set(item.ref, item);
    return result;
  }
}
