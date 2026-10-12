import type { JsonValue } from "@kgos/sdk";

export class ExecutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: JsonValue
  ) {
    super(message);
    this.name = "ExecutionError";
  }
}
