import { KGOSClient, KGOSDaemonError, KGOSTransportError, type WebStoreInfo } from "@kgos/sdk";

import { Observable } from "./observable.js";
import { createWebFetch, ResponseBudgetError } from "./transport.js";

export class Connection extends Observable {
  client: KGOSClient | undefined;
  info: WebStoreInfo | undefined;
  status = "未连接";
  connecting = false;
  private boot: string | undefined;
  private generation = 0;
  private readonly controllers = new Set<AbortController>();

  constructor(
    readonly endpoint: string,
    private readonly implementation: typeof fetch = globalThis.fetch
  ) {
    super();
  }

  get writableStore() {
    return this.client !== undefined && this.info?.storageStatus === "ready";
  }

  controller(): AbortController {
    const controller = new AbortController();
    this.controllers.add(controller);
    controller.signal.addEventListener("abort", () => this.controllers.delete(controller), {
      once: true
    });
    return controller;
  }

  release(controller: AbortController) {
    this.controllers.delete(controller);
  }

  private abortSignal(signal: AbortSignal | null | undefined, reason: Error) {
    for (const controller of this.controllers) {
      if (controller.signal === signal) controller.abort(reason);
    }
  }

  disconnect(message = "未连接") {
    this.generation += 1;
    this.client = undefined;
    this.boot = undefined;
    this.connecting = false;
    this.status = message;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.changed();
  }

  failure(error: unknown): string {
    if (error instanceof KGOSTransportError && error.causeValue instanceof ResponseBudgetError)
      return error.causeValue.message;
    if (error instanceof KGOSDaemonError) {
      if (error.code === "AUTHENTICATION_FAILED") this.disconnect("凭证不可用，请重新连接");
      if (error.code === "WEB_CONNECTION_CHANGED") this.disconnect("连接已变化，请重新连接");
      return `${error.message} (${error.code})`;
    }
    return error instanceof Error ? error.message : "请求失败，请核对连接";
  }

  async connect(token: string): Promise<KGOSClient | undefined> {
    this.disconnect();
    const generation = this.generation;
    this.connecting = true;
    this.status = "正在连接";
    this.changed();
    const controller = this.controller();
    try {
      const client = new KGOSClient({
        endpoint: this.endpoint,
        token,
        fetch: createWebFetch({
          boot: () => this.boot,
          valid: () => generation === this.generation,
          fetch: this.implementation,
          onUnauthorized: () => {
            this.disconnect("凭证不可用，请重新连接");
          },
          abort: (signal, reason) => {
            this.abortSignal(signal, reason);
          }
        })
      });
      const info = await client.web.data.info({ signal: controller.signal });
      if (generation !== this.generation) return undefined;
      this.boot = info.daemonBootId;
      this.info = info;
      this.client = client;
      this.status = "已连接";
      return client;
    } catch (error) {
      if (generation === this.generation) this.status = this.failure(error);
      return undefined;
    } finally {
      this.release(controller);
      if (generation === this.generation) this.connecting = false;
      this.changed();
    }
  }
}
