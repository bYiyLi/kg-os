import { type JsonObject, type WebRecordKind } from "@kgos/sdk";

import { Connection } from "./connection.js";
import { Context } from "./context.js";
import { FrameEngine } from "./frame-engine.js";
import { textField } from "./json.js";
import { Observable } from "./observable.js";
import { Records, type RecordSlot } from "./records.js";

export class Workspace extends Observable {
  readonly connection: Connection;
  readonly context: Context;
  readonly engine: FrameEngine;
  records: Records | undefined;
  editor: RecordSlot | undefined;
  layout: RecordSlot | undefined;
  statement = "MATCH (n) RETURN n LIMIT 50";
  paramsText = "{}";
  mode: "query" | "execute" = "query";
  tab = "knowledge";
  restoring = false;
  error = "";
  private generation = 0;

  constructor(endpoint: string, fetcher?: typeof fetch) {
    super();
    this.connection = new Connection(endpoint, fetcher);
    this.context = new Context(this.connection);
    this.engine = new FrameEngine(this.connection, () => this.records);
    for (const source of [this.connection, this.context, this.engine])
      source.subscribe(() => {
        this.changed();
      });
    let pinned = "";
    this.context.subscribe(() => {
      const next = `${this.context.inputRef}:${this.context.state}`;
      if (
        this.context.state !== "" &&
        !this.context.resolving &&
        this.context.switchError === "" &&
        pinned !== next
      ) {
        pinned = next;
        this.saveLayout();
      }
    });
  }

  async connect(token: string) {
    const generation = ++this.generation;
    const client = await this.connection.connect(token);
    if (client === undefined || generation !== this.generation) return;
    this.restoring = true;
    this.error = "";
    this.changed();
    try {
      await this.restoreStore();
      if (generation !== this.generation || client !== this.connection.client) return;
      const ref =
        this.layout === undefined
          ? "branch/main"
          : textField(this.layout.data, "inputRef", "branch/main");
      const pinned = this.layout === undefined ? "" : textField(this.layout.data, "state");
      await this.context.select(ref, pinned || undefined);
      await this.context.observe();
    } catch (error) {
      this.error = this.connection.failure(error);
    } finally {
      if (generation === this.generation) this.restoring = false;
      this.changed();
    }
  }

  private async restoreStore() {
    const info = this.connection.info;
    if (info?.storeId === undefined || info.storageStatus !== "ready") return;
    if (this.records?.storeId === info.storeId) {
      for (const slot of this.records.slots) {
        if (slot.confirmed === undefined) continue;
        const remote = await slot.readRemote();
        if (remote.revision !== slot.confirmed.revision) {
          slot.remote = remote;
          slot.status = "内容冲突";
          slot.changed();
        }
      }
      return;
    }
    if (this.records !== undefined) {
      this.error = "保存库已变化；本窗口输入保留，请复制或导出后重新打开工作区";
      return;
    }
    const records = new Records(this.connection, info.storeId);
    this.records = records;
    records.subscribe(() => {
      this.changed();
    });
    await this.loadAll(records, "workspace");
    await this.loadAll(records, "editor");
    await records.load("frame");
    await this.loadAll(records, "draft");
    await records.load("query");
    this.layout =
      records.slots.find((slot) => slot.kind === "workspace") ??
      records.add("workspace", { version: 1, inputRef: "branch/main", state: "", tab: this.tab });
    this.editor =
      records.slots.find((slot) => slot.kind === "editor") ??
      records.add("editor", this.editorData());
    this.statement = textField(this.editor.data, "statement", this.statement);
    this.paramsText = textField(this.editor.data, "paramsText", this.paramsText);
    this.mode = this.editor.data["mode"] === "execute" ? "execute" : "query";
    this.tab = textField(this.layout.data, "tab", "knowledge");
    let adoption = this.editor.adoption;
    this.editor.subscribe(() => {
      if (this.editor !== undefined && adoption !== this.editor.adoption) {
        adoption = this.editor.adoption;
        this.statement = textField(this.editor.data, "statement");
        this.paramsText = textField(this.editor.data, "paramsText", "{}");
        this.mode = this.editor.data["mode"] === "execute" ? "execute" : "query";
        this.changed();
      }
    });
    this.engine.restore();
  }

  private async loadAll(records: Records, kind: WebRecordKind) {
    await records.load(kind);
    while (records.error === "" && records.cursors.has(kind)) await records.load(kind, true);
  }

  editorData(): JsonObject {
    return { version: 1, statement: this.statement, paramsText: this.paramsText, mode: this.mode };
  }

  edit(statement: string, paramsText = this.paramsText, mode = this.mode) {
    this.statement = statement;
    this.paramsText = paramsText;
    this.mode = mode;
    this.editor?.edit(this.editorData());
    this.changed();
  }

  saveLayout() {
    this.layout?.edit({
      ...this.layout.data,
      version: 1,
      inputRef: this.context.inputRef,
      state: this.context.state,
      targetBranch: this.context.targetBranch,
      tab: this.tab
    });
    this.changed();
  }

  async select(ref: string, pinned?: string) {
    if (await this.context.select(ref, pinned)) this.saveLayout();
  }

  switchTab(tab: string) {
    this.tab = tab;
    this.saveLayout();
  }

  disconnect() {
    this.generation += 1;
    this.engine.cancelAll();
    this.connection.disconnect();
    this.changed();
  }
}
