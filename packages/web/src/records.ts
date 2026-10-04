import { KGOSDaemonError, type JsonObject, type WebRecord, type WebRecordKind } from "@kgos/sdk";

import { type Connection } from "./connection.js";
import { Observable } from "./observable.js";
import { stableJSON } from "./json.js";

function same(left: JsonObject | null, right: JsonObject | null): boolean {
  return stableJSON(left) === stableJSON(right);
}

export class RecordSlot extends Observable {
  data: JsonObject;
  confirmed: WebRecord | undefined;
  remote: WebRecord | undefined;
  status = "未保存";
  adoption = 0;
  error = "";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flight: Promise<boolean> | undefined;
  private stopped = false;
  readonly storeId: string;
  readonly kind: WebRecordKind;
  id: string;

  constructor(
    readonly connection: Connection,
    metadata: { storeId: string; kind: WebRecordKind; id: string },
    data: JsonObject,
    confirmed?: WebRecord
  ) {
    super();
    this.storeId = metadata.storeId;
    this.kind = metadata.kind;
    this.id = metadata.id;
    this.data = structuredClone(data);
    this.confirmed = confirmed;
    if (confirmed !== undefined) this.status = "已保存";
  }

  get dirty(): boolean {
    return this.confirmed === undefined || !same(this.data, this.confirmed.data);
  }

  edit(data: JsonObject) {
    this.data = structuredClone(data);
    if (this.status !== "内容冲突" && this.status !== "结果待核对") this.status = "未保存";
    this.changed();
    this.schedule();
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, 500);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  private writable() {
    return (
      !this.stopped &&
      this.connection.writableStore &&
      this.connection.info?.storeId === this.storeId &&
      this.status !== "内容冲突" &&
      this.status !== "结果待核对"
    );
  }

  async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.flight !== undefined) {
      await this.flight;
      return this.dirty && this.writable() ? this.flush() : !this.dirty;
    }
    if (!this.dirty) return true;
    if (!this.writable()) return false;
    this.flight = this.save();
    const saved = await this.flight;
    this.flight = undefined;
    if (saved && this.hasPendingChanges()) this.schedule();
    return saved && !this.hasPendingChanges();
  }

  private hasPendingChanges() {
    return this.dirty;
  }

  private async save(): Promise<boolean> {
    const client = this.connection.client;
    if (client === undefined) return false;
    const data = structuredClone(this.data);
    const mutationId = crypto.randomUUID();
    const controller = this.connection.controller();
    this.status = "正在保存";
    this.error = "";
    this.changed();
    try {
      const record = await client.web.data.save(
        {
          storeId: this.storeId,
          kind: this.kind,
          id: this.id,
          expectedRevision: this.confirmed?.revision ?? null,
          mutationId,
          data
        },
        { signal: controller.signal }
      );
      this.confirm(record, data);
      return true;
    } catch (error) {
      this.error = this.connection.failure(error);
      if (error instanceof KGOSDaemonError && error.code !== "WEB_DATA_CHANGED") {
        this.status = "未保存";
        return false;
      }
      this.status = error instanceof KGOSDaemonError ? "内容冲突" : "结果待核对";
      return await this.reconcile(mutationId, data);
    } finally {
      this.connection.release(controller);
      this.changed();
    }
  }

  private confirm(record: WebRecord, sent: JsonObject) {
    this.confirmed = record;
    this.status = same(this.data, sent) ? "已保存" : "未保存";
    this.error = "";
  }

  private async reconcile(mutationId: string, sent: JsonObject): Promise<boolean> {
    try {
      const remote = await this.readRemote();
      if (remote.lastMutationId === mutationId && !remote.deleted && same(remote.data, sent)) {
        this.confirm(remote, sent);
        return true;
      }
      this.remote = remote;
      this.status = "内容冲突";
    } catch (error) {
      this.error = this.connection.failure(error);
    }
    return false;
  }

  async readRemote(): Promise<WebRecord> {
    const client = this.connection.client;
    if (client === undefined || this.connection.info?.storeId !== this.storeId) {
      throw new Error("连接或保存库已变化，保留本窗口输入");
    }
    const controller = this.connection.controller();
    try {
      return await client.web.data.read(
        { storeId: this.storeId, kind: this.kind, id: this.id },
        { signal: controller.signal }
      );
    } finally {
      this.connection.release(controller);
    }
  }

  useRemote() {
    if (this.remote?.data === null || this.remote === undefined) return;
    this.confirmed = this.remote;
    this.data = structuredClone(this.remote.data);
    this.status = "已保存";
    this.remote = undefined;
    this.error = "";
    this.adoption += 1;
    this.changed();
  }

  async saveCopy(): Promise<boolean> {
    if (this.flight !== undefined) await this.flight;
    this.id = crypto.randomUUID();
    this.confirmed = undefined;
    this.remote = undefined;
    this.status = "未保存";
    this.stopped = false;
    return this.flush();
  }

  async delete(): Promise<boolean> {
    if (this.flight !== undefined) await this.flight;
    const client = this.connection.client;
    if (client === undefined || this.confirmed === undefined || !this.writable()) return false;
    const controller = this.connection.controller();
    const mutationId = crypto.randomUUID();
    try {
      this.confirmed = await client.web.data.delete(
        {
          storeId: this.storeId,
          kind: this.kind,
          id: this.id,
          expectedRevision: this.confirmed.revision,
          mutationId
        },
        { signal: controller.signal }
      );
      this.stop();
      this.status = "已删除";
      return true;
    } catch (error) {
      this.error = this.connection.failure(error);
      this.status = "结果待核对";
      try {
        const remote = await this.readRemote();
        if (remote.deleted && remote.lastMutationId === mutationId) {
          this.confirmed = remote;
          this.stop();
          this.status = "已删除";
          return true;
        }
        this.remote = remote;
        this.status = "内容冲突";
      } catch (readError) {
        this.error = this.connection.failure(readError);
      }
      return false;
    } finally {
      this.connection.release(controller);
      this.changed();
    }
  }
}

export class Records extends Observable {
  readonly slots: RecordSlot[] = [];
  readonly cursors = new Map<WebRecordKind, string>();
  error = "";
  private readonly loads = new Map<WebRecordKind, Promise<RecordSlot[]>>();

  constructor(
    readonly connection: Connection,
    readonly storeId: string
  ) {
    super();
  }

  get dirty() {
    return this.slots.some((slot) => slot.dirty && slot.status !== "已删除");
  }

  add(kind: WebRecordKind, data: JsonObject, record?: WebRecord): RecordSlot {
    const slot = new RecordSlot(
      this.connection,
      { storeId: this.storeId, kind, id: record?.id ?? crypto.randomUUID() },
      data,
      record
    );
    slot.subscribe(() => {
      this.changed();
    });
    this.slots.push(slot);
    this.changed();
    return slot;
  }

  async load(kind: WebRecordKind, more = false): Promise<RecordSlot[]> {
    const existing = this.loads.get(kind);
    if (existing !== undefined) return existing;
    const flight = this.loadPage(kind, more);
    this.loads.set(kind, flight);
    try {
      return await flight;
    } finally {
      this.loads.delete(kind);
    }
  }

  private async loadPage(kind: WebRecordKind, more: boolean): Promise<RecordSlot[]> {
    const client = this.connection.client;
    if (client === undefined) return [];
    const controller = this.connection.controller();
    try {
      const cursor = more ? this.cursors.get(kind) : undefined;
      const page = await client.web.data.list(
        { storeId: this.storeId, kind, limit: 50, ...(cursor === undefined ? {} : { cursor }) },
        { signal: controller.signal }
      );
      const loaded: RecordSlot[] = [];
      for (const header of page.items) {
        if (
          header.deleted ||
          this.slots.some((slot) => slot.kind === kind && slot.id === header.id)
        )
          continue;
        const record = await client.web.data.read(
          { storeId: this.storeId, kind, id: header.id },
          { signal: controller.signal }
        );
        if (!record.deleted && record.data !== null)
          loaded.push(this.add(kind, record.data, record));
      }
      this.cursors.delete(kind);
      if (page.cursor !== undefined) this.cursors.set(kind, page.cursor);
      this.error = "";
      this.changed();
      return loaded;
    } catch (error) {
      this.error = this.connection.failure(error);
      this.changed();
      return [];
    } finally {
      this.connection.release(controller);
    }
  }

  stop() {
    for (const slot of this.slots) slot.stop();
  }
}
