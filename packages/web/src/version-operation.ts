import { KGOSDaemonError, type JsonValue, type KGOSClient } from "@kgos/sdk";

import { type Connection } from "./connection.js";
import { Observable } from "./observable.js";

export function jsonValue(text: string): JsonValue {
  return JSON.parse(text) as JsonValue;
}

export function uncertain(error: unknown): boolean {
  return (
    !(error instanceof KGOSDaemonError) ||
    ["WEB_CONNECTION_CHANGED", "AUTHENTICATION_FAILED"].includes(error.code)
  );
}

export class VersionOperation extends Observable {
  busy = false;
  error = "";
  errorCode = "";
  unknown = false;
  private generation = 0;
  private request: AbortController | undefined;
  private mutating = false;

  constructor(readonly connection: Connection) {
    super();
  }

  cancel() {
    if (this.busy && this.mutating) this.unknown = true;
    this.generation += 1;
    this.request?.abort();
    this.busy = false;
    this.changed();
  }

  async run<T>(
    action: (client: KGOSClient, signal: AbortSignal) => Promise<T>,
    mutation = false
  ): Promise<T | undefined> {
    const client = this.connection.client;
    if (client === undefined || (mutation && (this.busy || this.unknown))) return undefined;
    this.cancel();
    const generation = this.generation;
    const controller = this.connection.controller();
    this.request = controller;
    this.busy = true;
    this.mutating = mutation;
    this.error = "";
    this.errorCode = "";
    this.changed();
    try {
      const result = await action(client, controller.signal);
      if (generation !== this.generation || controller.signal.aborted) {
        if (mutation) this.unknown = true;
        return undefined;
      }
      return result;
    } catch (error) {
      if (generation === this.generation) {
        this.failed(error, mutation);
      }
      return undefined;
    } finally {
      this.connection.release(controller);
      if (generation === this.generation) this.busy = false;
      this.changed();
    }
  }

  private failed(error: unknown, mutation: boolean) {
    this.error = this.connection.failure(error);
    this.errorCode = error instanceof KGOSDaemonError ? error.code : "";
    if (mutation && uncertain(error)) this.unknown = true;
  }
}
