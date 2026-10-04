import { type GraphStreamEvent, type JsonObject, type JsonValue } from "@kgos/sdk";

import { type Connection } from "./connection.js";
import { isObject, numberField, parseObject, textField } from "./json.js";
import { Observable } from "./observable.js";
import { project, type Projection } from "./projection.js";
import { type RecordSlot } from "./records.js";
import { jsonArraySources, jsonSourceField } from "./json-source.js";

export const FRAME_LIMITS = { bytes: 8 << 20, rows: 10_000, pageBytes: 32 << 20, active: 4 };
export class FrameBudgetError extends Error {
  constructor() {
    super("达到前端接收预算，保留部分结果");
  }
}
export type FrameStatus =
  "queued" | "running" | "complete" | "cancelled" | "partial" | "failed" | "unknown";
export interface FrameSnapshot {
  mode: "query" | "execute";
  statement: string;
  params: JsonObject;
  paramsText?: string;
  inputRef: string;
  readState?: string;
  branch?: string;
  observedHead?: string;
}
export interface Position {
  x: number;
  y: number;
}
export interface Camera extends Position {
  zoom: number;
}

export class Frame extends Observable {
  readonly localId = crypto.randomUUID();
  readonly request: FrameSnapshot;
  status: FrameStatus = "queued";
  closed = false;
  collapsed = false;
  restored = false;
  evicted = false;
  visible = true;
  view = "graph";
  columns: string[] = [];
  rows: JsonValue[][] = [];
  rowSources: string[] = [];
  expandedRows: JsonValue[][] = [];
  rowCount = 0;
  byteCount = 0;
  elapsed = 0;
  createdAt = Date.now();
  resultState = "";
  counters: JsonValue | undefined;
  error = "";
  selected = "";
  detail: JsonValue | undefined;
  detailSource: string | undefined;
  detailError = "";
  neighborError = "";
  neighborLoading = false;
  camera: Camera = { x: 0, y: 0, zoom: 1 };
  readonly positions = new Map<string, Position>();
  generation = 0;
  controller: AbortController | undefined;
  selectionGeneration = 0;
  detailController: AbortController | undefined;
  neighborController: AbortController | undefined;
  private cachedProjection: Projection | undefined;
  private columnsReceived = false;
  private notification: ReturnType<typeof setTimeout> | undefined;

  constructor(
    snapshot: FrameSnapshot,
    readonly slot?: RecordSlot
  ) {
    super();
    this.request = structuredClone(snapshot);
  }

  get id() {
    return this.slot?.id ?? this.localId;
  }
  get state() {
    return this.request.mode === "query" ? (this.request.readState ?? "") : this.resultState;
  }
  get active() {
    return !this.restored && (this.status === "queued" || this.status === "running");
  }
  get projection(): Projection {
    this.cachedProjection ??= project([...this.rows, ...this.expandedRows]);
    for (const node of this.cachedProjection.nodes) {
      if (!this.positions.has(node.ref)) {
        const index = this.positions.size;
        this.positions.set(node.ref, {
          x: 120 + (index % 5) * 180,
          y: 95 + Math.floor(index / 5) * 110
        });
      }
    }
    return this.cachedProjection;
  }

  restore(data: JsonObject) {
    const status = textField(data, "status", "unknown");
    if (
      ["queued", "running", "complete", "cancelled", "partial", "failed", "unknown"].includes(
        status
      )
    )
      this.status = status as FrameStatus;
    this.restored = true;
    this.closed = data["closed"] === true;
    this.collapsed = data["collapsed"] === true;
    this.selected = textField(data, "selected");
    this.view = textField(data, "view", "graph");
    this.resultState = textField(data, "resultState");
    this.rowCount = numberField(data, "rowCount");
    this.elapsed = numberField(data, "elapsed");
    this.createdAt = numberField(data, "createdAt", Date.now());
    this.evicted = this.rowCount > 0;
    const camera = data["camera"];
    if (isObject(camera))
      this.camera = {
        x: numberField(camera, "x"),
        y: numberField(camera, "y"),
        zoom: Math.max(0.1, Math.min(4, numberField(camera, "zoom", 1)))
      };
    const positions = data["positions"];
    if (isObject(positions))
      for (const [ref, value] of Object.entries(positions).slice(0, 1_000)) {
        if (isObject(value))
          this.positions.set(ref, { x: numberField(value, "x"), y: numberField(value, "y") });
      }
  }

  record(): JsonObject {
    const positions: JsonObject = {};
    for (const [ref, position] of this.positions) positions[ref] = { ...position };
    return {
      version: 1,
      ...this.request,
      status: this.status,
      closed: this.closed,
      collapsed: this.collapsed,
      view: this.view,
      selected: this.selected,
      resultState: this.resultState,
      rowCount: this.rowCount,
      elapsed: this.elapsed,
      createdAt: this.createdAt,
      camera: { ...this.camera },
      positions
    };
  }

  persist() {
    this.slot?.edit(this.record());
    this.changed();
  }

  append(row: JsonValue[], reserve: (bytes: number) => boolean, neighbor = false, source?: string) {
    const target = neighbor ? this.expandedRows : this.rows;
    const encoded = source ?? JSON.stringify(row);
    const bytes = new TextEncoder().encode(encoded).byteLength + (target.length === 0 ? 2 : 1);
    if (
      this.byteCount + bytes > FRAME_LIMITS.bytes ||
      this.rows.length + this.expandedRows.length >= FRAME_LIMITS.rows ||
      !reserve(bytes)
    ) {
      throw new FrameBudgetError();
    }
    this.byteCount += bytes;
    if (neighbor) this.expandedRows.push(row);
    else {
      this.rows.push(row);
      this.rowSources.push(encoded);
      this.rowCount += 1;
    }
    this.cachedProjection = undefined;
    this.notifyRows();
  }

  consume(event: GraphStreamEvent, reserve: (bytes: number) => boolean, source?: string) {
    if (event.type === "columns") {
      if (this.columnsReceived) throw new Error("重复或迟到的 columns");
      this.columnsReceived = true;
      this.columns = event.columns;
    } else if (event.type === "row") {
      if (!this.columnsReceived) throw new Error("row 早于 columns");
      if (event.row.length !== this.columns.length) throw new Error("行与 columns 数量不一致");
      this.append(event.row, reserve, false, source);
    }
  }

  private notifyRows() {
    this.notification ??= setTimeout(() => {
      this.notification = undefined;
      this.changed();
    }, 50);
  }

  cancel(close = false) {
    if (this.active) {
      const queued = this.status === "queued";
      this.status = this.request.mode === "execute" && !queued ? "unknown" : "cancelled";
      if (queued) this.error = "排队已取消，未发送请求";
    }
    if (close) this.closed = true;
    this.invalidate();
    this.persist();
  }

  invalidate() {
    this.generation += 1;
    this.selectionGeneration += 1;
    this.controller?.abort();
    this.detailController?.abort();
    this.neighborController?.abort();
    clearTimeout(this.notification);
    this.notification = undefined;
  }

  releaseRows() {
    this.rows = [];
    this.rowSources = [];
    this.expandedRows = [];
    this.byteCount = 0;
    this.cachedProjection = undefined;
    this.detail = undefined;
    this.detailSource = undefined;
    this.evicted = this.rowCount > 0;
    this.changed();
  }

  select(ref: string, connection: Connection) {
    this.detailController?.abort();
    this.neighborController?.abort();
    this.selectionGeneration += 1;
    this.selected = ref;
    this.detail = undefined;
    this.detailSource = undefined;
    this.detailError = "";
    this.neighborError = "";
    this.neighborLoading = false;
    this.persist();
    void this.readDetail(connection);
  }

  private async readDetail(connection: Connection) {
    const client = connection.client;
    if (client === undefined || this.state === "" || this.request.mode !== "query") return;
    const generation = this.selectionGeneration;
    const ref = this.selected;
    const controller = connection.controller();
    this.detailController = controller;
    try {
      let source: string | undefined;
      const result = await client.object.read(
        { at: this.state, refs: [ref] },
        {
          signal: controller.signal,
          onJSONResponse: (response) => {
            const results = jsonSourceField(response, "results");
            const first = results === undefined ? undefined : jsonArraySources(results)[0];
            if (first !== undefined) source = jsonSourceField(first, "value");
          }
        }
      );
      if (controller.signal.aborted || this.closed || generation !== this.selectionGeneration)
        return;
      if (result.state !== this.state) throw new Error("对象响应 State 不匹配");
      this.detail = result.results[0]?.value;
      this.detailSource = source;
    } catch (error) {
      if (!controller.signal.aborted && generation === this.selectionGeneration)
        this.detailError = connection.failure(error);
    } finally {
      connection.release(controller);
      this.changed();
    }
  }
}

export function restoredFrame(slot: RecordSlot): Frame {
  const data = slot.data;
  const snapshot: FrameSnapshot = {
    mode: data["mode"] === "execute" ? "execute" : "query",
    statement: textField(data, "statement"),
    params: isObject(data["params"]) ? data["params"] : {},
    inputRef: textField(data, "inputRef")
  };
  for (const key of ["readState", "branch", "observedHead"] as const)
    if (typeof data[key] === "string") snapshot[key] = data[key];
  if (typeof data["paramsText"] === "string") {
    snapshot.paramsText = data["paramsText"];
    try {
      snapshot.params = parseObject(snapshot.paramsText);
    } catch {
      // Retain a malformed legacy source and its stored parameters for explicit repair.
    }
  }
  const frame = new Frame(snapshot, slot);
  frame.restore(data);
  return frame;
}
