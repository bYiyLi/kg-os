import {
  type GraphSummaryEvent,
  type JsonValue,
  type RequestOptions,
  type WebCacheWriteRequest
} from "@kgos/sdk";

import { type Connection } from "./connection.js";
import {
  Frame,
  FrameBudgetError,
  FRAME_LIMITS,
  restoredFrame,
  type FrameSnapshot
} from "./frame.js";
import { ResponseBudgetError } from "./transport.js";
import { Observable } from "./observable.js";
import { type Records } from "./records.js";
import { jsonArraySources, jsonSourceField } from "./json-source.js";

function requestOptions(request: FrameSnapshot, signal: AbortSignal): RequestOptions {
  const options: RequestOptions = { signal };
  if (request.paramsText !== undefined) {
    const target =
      request.mode === "query"
        ? `"at":${JSON.stringify(request.readState ?? "")}`
        : `"branch":${JSON.stringify(request.branch ?? "")}`;
    options.encodedJSON = `{${target},"cypher":${JSON.stringify(request.statement)},"params":${request.paramsText}}`;
  }
  return options;
}

function cacheOptions(
  request: WebCacheWriteRequest,
  sources: string[],
  signal: AbortSignal
): RequestOptions {
  const { result, ...metadata } = request;
  const encoded = `{"state":${JSON.stringify(result.state)},"columns":${JSON.stringify(result.columns)},"rows":[${sources.join(",")}],"valueEncoding":${JSON.stringify(result.valueEncoding)}}`;
  return { signal, encodedJSON: `${JSON.stringify(metadata).slice(0, -1)},"result":${encoded}}` };
}

export class FrameEngine extends Observable {
  readonly frames: Frame[] = [];
  active = 0;
  private readonly queue: Frame[] = [];

  constructor(
    readonly connection: Connection,
    readonly records: () => Records | undefined
  ) {
    super();
  }

  run(snapshot: FrameSnapshot): Frame {
    const frame = new Frame(snapshot);
    const slot = this.records()?.add("frame", frame.record());
    const attached = slot === undefined ? frame : new Frame(snapshot, slot);
    this.attach(attached);
    this.frames.unshift(attached);
    this.queue.push(attached);
    this.changed();
    this.pump();
    return attached;
  }

  restore() {
    for (const slot of this.records()?.slots ?? []) {
      if (slot.kind !== "frame" || this.frames.some((frame) => frame.slot === slot)) continue;
      const frame = restoredFrame(slot);
      this.attach(frame);
      this.frames.push(frame);
    }
    this.frames.sort((left, right) => right.createdAt - left.createdAt);
    this.changed();
  }

  private attach(frame: Frame) {
    const unsubscribe = frame.subscribe(() => {
      this.changed();
    });
    let adoption = frame.slot?.adoption;
    const unsubscribeSlot = frame.slot?.subscribe(() => {
      if (frame.slot !== undefined && adoption !== frame.slot.adoption) {
        adoption = frame.slot.adoption;
        frame.invalidate();
        const restored = restoredFrame(frame.slot);
        const index = this.frames.indexOf(frame);
        if (index >= 0) this.frames.splice(index, 1, restored);
        unsubscribe();
        unsubscribeSlot?.();
        this.attach(restored);
        this.changed();
      }
    });
  }

  private pump() {
    while (this.active < FRAME_LIMITS.active && this.queue.length !== 0) {
      const frame = this.queue.shift();
      if (frame === undefined || frame.closed || frame.status !== "queued") continue;
      this.active += 1;
      void this.execute(frame).finally(() => {
        this.active -= 1;
        this.pump();
        this.changed();
      });
    }
  }

  private reserve(frame: Frame, bytes: number): boolean {
    const total = () => this.frames.reduce((sum, item) => sum + item.byteCount, 0);
    if (total() + bytes <= FRAME_LIMITS.pageBytes) return true;
    const eligible = this.frames.filter(
      (item) =>
        item !== frame &&
        item.status === "complete" &&
        item.byteCount > 0 &&
        (item.closed || item.collapsed || !item.visible)
    );
    eligible.sort(
      (left, right) =>
        Number(right.closed || right.collapsed) - Number(left.closed || left.collapsed)
    );
    for (const item of eligible) {
      item.releaseRows();
      if (total() + bytes <= FRAME_LIMITS.pageBytes) return true;
    }
    return false;
  }

  private live(frame: Frame, controller: AbortController, generation: number) {
    return !controller.signal.aborted && !frame.closed && generation === frame.generation;
  }

  private async receive(
    frame: Frame,
    controller: AbortController,
    generation: number
  ): Promise<GraphSummaryEvent | undefined> {
    const client = this.connection.client;
    if (client === undefined) return undefined;
    const options = requestOptions(frame.request, controller.signal);
    let rowSource: string | undefined;
    options.onGraphJSON = (source, event) => {
      if (event.type === "row") rowSource = jsonSourceField(source, "row");
    };
    const stream =
      frame.request.mode === "query"
        ? client.graph.streamQuery(
            {
              at: frame.request.readState ?? "",
              cypher: frame.request.statement,
              params: frame.request.params
            },
            options
          )
        : client.graph.streamExecute(
            {
              branch: frame.request.branch ?? "",
              cypher: frame.request.statement,
              params: frame.request.params
            },
            options
          );
    let summary: GraphSummaryEvent | undefined;
    for await (const event of stream) {
      if (!this.live(frame, controller, generation)) return undefined;
      if (event.type === "summary") summary = event;
      else frame.consume(event, (bytes) => this.reserve(frame, bytes), rowSource);
      rowSource = undefined;
    }
    return summary;
  }

  private async execute(frame: Frame) {
    const client = this.connection.client;
    if (client === undefined) {
      frame.status = "failed";
      frame.error = "请先连接，未发送请求";
      frame.persist();
      return;
    }
    const controller = this.connection.controller();
    frame.controller = controller;
    const generation = ++frame.generation;
    const started = performance.now();
    frame.status = "running";
    frame.persist();
    try {
      const summary = await this.receive(frame, controller, generation);
      if (!this.live(frame, controller, generation)) return;
      frame.status = this.complete(frame, summary);
    } catch (error) {
      if (generation !== frame.generation || frame.closed) return;
      controller.abort();
      const budget =
        error instanceof FrameBudgetError ||
        controller.signal.reason instanceof ResponseBudgetError;
      frame.status = frame.rowCount > 0 || budget ? "partial" : "failed";
      if (frame.request.mode === "execute") frame.status = "unknown";
      frame.error = this.connection.failure(error);
    } finally {
      this.connection.release(controller);
      if (this.current(frame, generation)) {
        frame.elapsed = performance.now() - started;
        frame.persist();
      }
    }
    if (this.live(frame, controller, generation) && frame.status === "complete")
      await this.cache(frame);
  }

  private complete(frame: Frame, summary: GraphSummaryEvent | undefined): "complete" {
    if (summary === undefined || (frame.request.mode === "query" && summary.state !== frame.state))
      throw new Error("结果 State 不匹配或缺少完成回执");
    frame.resultState = summary.state;
    frame.counters = summary.counters;
    if (frame.rows.length > 0 && frame.projection.nodes.length === 0) frame.view = "json";
    return "complete";
  }

  private async cache(frame: Frame) {
    const slot = frame.slot;
    const client = this.connection.client;
    if (
      slot === undefined ||
      client === undefined ||
      frame.request.mode !== "query" ||
      !(await slot.flush())
    )
      return;
    const revision = slot.confirmed?.revision;
    if (revision === undefined || !this.cacheable(frame)) return;
    const controller = this.connection.controller();
    try {
      const request: WebCacheWriteRequest = {
        storeId: slot.storeId,
        frameId: slot.id,
        frameRevision: revision,
        result: {
          state: frame.state,
          columns: frame.columns,
          rows: frame.rows,
          valueEncoding: "lithograph-json-v1"
        }
      };
      await client.web.cache.write(
        request,
        cacheOptions(request, frame.rowSources, controller.signal)
      );
    } catch (error) {
      if (!frame.closed) {
        frame.error = `查询完成；完整缓存未保存：${this.connection.failure(error)}`;
        frame.changed();
      }
    } finally {
      this.connection.release(controller);
    }
  }

  private cacheable(frame: Frame) {
    return !frame.closed && frame.status === "complete";
  }
  private current(frame: Frame, generation: number) {
    return generation === frame.generation && !frame.closed;
  }

  async loadCache(frame: Frame) {
    const client = this.connection.client;
    const slot = frame.slot;
    if (
      client === undefined ||
      slot === undefined ||
      frame.closed ||
      frame.status !== "complete" ||
      frame.request.mode !== "query"
    )
      return;
    frame.controller?.abort();
    const generation = ++frame.generation;
    const controller = this.connection.controller();
    frame.controller = controller;
    try {
      let source: string | undefined;
      const result = await client.web.cache.read(
        { storeId: slot.storeId, frameId: slot.id },
        {
          signal: controller.signal,
          onJSONResponse: (response) => {
            const data = jsonSourceField(response, "result");
            if (data !== undefined) source = jsonSourceField(data, "rows");
          }
        }
      );
      if (!this.live(frame, controller, generation)) return;
      if (!result.hit || result.result === undefined) {
        frame.error = "完整缓存不可用；可按原 State 另建帧重跑";
        return;
      }
      if (result.result.state !== frame.state) throw new Error("缓存 State 不匹配");
      const rows = result.result.rows;
      const encoded = source ?? JSON.stringify(rows);
      const bytes = new TextEncoder().encode(encoded).byteLength;
      if (
        rows.length > FRAME_LIMITS.rows ||
        bytes > FRAME_LIMITS.bytes ||
        !this.reserve(frame, bytes)
      )
        throw new Error("完整缓存超过前端预算");
      frame.releaseRows();
      frame.columns = result.result.columns;
      frame.rows = rows;
      frame.rowSources = jsonArraySources(encoded);
      frame.byteCount = bytes;
      frame.evicted = false;
      frame.error = "";
    } catch (error) {
      if (this.current(frame, generation)) frame.error = this.connection.failure(error);
    } finally {
      this.connection.release(controller);
      if (this.current(frame, generation)) frame.changed();
    }
  }

  private neighborLive(frame: Frame, controller: AbortController, generation: number) {
    return (
      !controller.signal.aborted &&
      !frame.closed &&
      generation === frame.selectionGeneration &&
      frame.neighborController === controller
    );
  }

  async neighbors(frame: Frame, ref = frame.selected) {
    const client = this.connection.client;
    if (
      client === undefined ||
      frame.closed ||
      frame.request.mode !== "query" ||
      frame.state === "" ||
      !/^n:(?:0|[1-9]\d*)$/.test(ref)
    )
      return;
    frame.neighborController?.abort();
    const controller = this.connection.controller();
    frame.neighborController = controller;
    const generation = frame.selectionGeneration;
    frame.neighborLoading = true;
    frame.neighborError = "";
    frame.changed();
    try {
      let rowSource: string | undefined;
      const stream = client.graph.streamQuery(
        {
          at: frame.state,
          cypher: "MATCH (n)-[r]-(m) WHERE elementId(n) = $ref RETURN n, r, m LIMIT 50",
          params: { ref }
        },
        {
          signal: controller.signal,
          onGraphJSON: (source, event) => {
            if (event.type === "row") rowSource = jsonSourceField(source, "row");
          }
        }
      );
      for await (const event of stream) {
        if (!this.neighborLive(frame, controller, generation)) return;
        if (event.type === "row")
          frame.append(event.row, (bytes) => this.reserve(frame, bytes), true, rowSource);
        rowSource = undefined;
        if (event.type === "summary" && event.state !== frame.state)
          throw new Error("邻居响应 State 不匹配");
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        frame.neighborError = this.connection.failure(error);
        controller.abort();
      }
    } finally {
      this.connection.release(controller);
      if (generation === frame.selectionGeneration && frame.neighborController === controller) {
        frame.neighborLoading = false;
        frame.changed();
      }
    }
  }

  explore(frame: Frame): Frame | undefined {
    if (frame.resultState === "") return undefined;
    return this.run({
      mode: "query",
      statement: "MATCH (n) RETURN n LIMIT 50",
      params: {},
      inputRef: frame.resultState,
      readState: frame.resultState
    });
  }

  cancelAll() {
    for (const frame of this.frames) if (frame.active) frame.cancel();
  }
}

export function frameStatus(frame: Frame): string {
  if (frame.restored && (frame.status === "running" || frame.status === "queued"))
    return "上次执行未连接，不能续跑；请核对原请求";
  const labels: Record<Frame["status"], string> = {
    queued: "等待执行",
    running: "接收中，结果未完整",
    complete: "已完成",
    cancelled: "已取消，部分结果",
    partial: "结果不完整",
    failed: "请求失败",
    unknown: "执行未完整返回，写入结果待核对"
  };
  return labels[frame.status];
}

export function selectedProperties(frame: Frame): JsonValue | undefined {
  return (
    frame.detail ??
    [...frame.projection.nodes, ...frame.projection.relationships].find(
      (item) => item.ref === frame.selected
    )?.properties
  );
}
