import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { Worker } from "node:worker_threads";

import { KGOSDaemonError, KGOSTransportError, type KGOSClient, type JsonValue } from "@kgos/sdk";

import { ExecutionError } from "./errors.js";
import {
  READ_METHODS,
  WRITE_METHODS,
  STREAM_METHODS,
  invoke,
  streamSdk,
  type Stream
} from "./sdk-dispatch.js";
export { ExecutionError } from "./errors.js";

const MAX_CODE_BYTES = 64 * 1024;
const MAX_BRIDGE_BYTES = 2 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_SDK_CALLS = 2048;
const MAX_STREAMS = 32;
const WALL_MS = 15_000;
const MAX_PENDING_SDK = 16;

interface WorkerCall {
  type: "call";
  id: number;
  request: string;
}

interface WorkerComplete {
  type: "complete";
  json: string;
}

interface WorkerFailure {
  type: "failure";
  code: string;
  message: string;
}

type WorkerMessage = WorkerCall | WorkerComplete | WorkerFailure;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function encode(value: unknown): string {
  const json = JSON.stringify(value);
  if (typeof json !== "string" || byteLength(json) > MAX_BRIDGE_BYTES) {
    throw new ExecutionError("RESOURCE_ERROR", "SDK result exceeds bridge limit");
  }
  return json;
}

function normalizeError(error: unknown): { code: string; message: string; details?: JsonValue } {
  if (error instanceof KGOSDaemonError) {
    const details = error.details;
    const safeDetails =
      details === undefined || byteLength(JSON.stringify(details)) > 8192 ? undefined : details;
    return {
      code: error.code,
      message: error.message.slice(0, 1024),
      ...(safeDetails === undefined ? {} : { details: safeDetails })
    };
  }
  if (error instanceof ExecutionError) {
    return { code: error.code, message: error.message.slice(0, 1024) };
  }
  if (error instanceof KGOSTransportError) {
    return {
      code: error.aborted ? "CANCELLED" : "TRANSPORT_ERROR",
      message: error.aborted ? "SDK call cancelled; any write may have completed" : error.message
    };
  }
  return { code: "SCRIPT_ERROR", message: "SDK call failed" };
}

function parseInvocationResult(json: string, maxBytes: number): JsonValue {
  if (byteLength(json) > maxBytes) {
    throw new ExecutionError("RESOURCE_ERROR", "Script output exceeds limit");
  }
  const decoded: unknown = JSON.parse(json);
  if (!isRecord(decoded) || typeof decoded["ok"] !== "boolean") {
    throw new ExecutionError("SCRIPT_ERROR", "Invalid Sandbox result");
  }
  if (!decoded["ok"]) {
    const code = decoded["code"];
    const message = decoded["message"];
    throw new ExecutionError(
      typeof code === "string" ? code.slice(0, 64) : "SCRIPT_ERROR",
      typeof message === "string" ? message.slice(0, 1024) : "Script failed",
      decoded["details"] as JsonValue | undefined
    );
  }
  if (!Object.hasOwn(decoded, "value")) {
    throw new ExecutionError("SCRIPT_ERROR", "Script did not return a JSON value");
  }
  return decoded["value"] as JsonValue;
}

export interface SandboxLimits {
  scriptTimeoutMs: number;
  scriptMemoryMb: number;
  scriptMaxCodeBytes: number;
  scriptMaxCalls: number;
  scriptMaxStreams: number;
  scriptMaxOutputBytes: number;
}

export const DEFAULT_SANDBOX_LIMITS: Readonly<SandboxLimits> = Object.freeze({
  scriptTimeoutMs: WALL_MS,
  scriptMemoryMb: 64,
  scriptMaxCodeBytes: MAX_CODE_BYTES,
  scriptMaxCalls: MAX_SDK_CALLS,
  scriptMaxStreams: MAX_STREAMS,
  scriptMaxOutputBytes: MAX_OUTPUT_BYTES
});

interface Invocation {
  client: KGOSClient;
  writable: boolean;
  limits: SandboxLimits;
  controller: AbortController;
  streams: Map<string, { iterator: Stream; active: boolean }>;
  calls: number;
  pending: number;
  closed: boolean;
}

function permitted(invocation: Invocation, method: string): boolean {
  return READ_METHODS.has(method) || (invocation.writable && WRITE_METHODS.has(method));
}

function openStream(invocation: Invocation, args: unknown[]): string {
  const method = args[0];
  if (typeof method !== "string" || !STREAM_METHODS.has(method) || !permitted(invocation, method)) {
    throw new ExecutionError("PERMISSION_DENIED", "SDK stream method is not allowed");
  }
  if (invocation.streams.size >= invocation.limits.scriptMaxStreams) {
    throw new ExecutionError("RESOURCE_ERROR", "Too many open SDK streams");
  }
  const streamId = randomUUID();
  invocation.streams.set(streamId, {
    iterator: streamSdk(invocation.client, method, args[1], {
      signal: invocation.controller.signal
    }),
    active: false
  });
  return encode({ streamId });
}

async function consumeStream(
  invocation: Invocation,
  method: string,
  args: unknown[]
): Promise<string> {
  const streamId = args[0];
  if (typeof streamId !== "string") {
    throw new ExecutionError("INVALID_ARGUMENT", "Invalid stream ID");
  }
  const stream = invocation.streams.get(streamId);
  if (stream === undefined) {
    if (method === "stream-return") return encode(null);
    throw new ExecutionError("INVALID_ARGUMENT", "SDK stream is not open");
  }
  if (stream.active)
    throw new ExecutionError("INVALID_ARGUMENT", "Concurrent SDK stream operations");
  stream.active = true;
  try {
    if (method === "stream-return") {
      invocation.streams.delete(streamId);
      await stream.iterator.return?.();
      return encode(null);
    }
    const next = await stream.iterator.next();
    if (next.done === true) invocation.streams.delete(streamId);
    return encode(next.done === true ? { done: true } : { done: false, value: next.value });
  } finally {
    stream.active = false;
  }
}

async function dispatch(invocation: Invocation, request: string): Promise<string> {
  if (byteLength(request) > MAX_BRIDGE_BYTES) {
    throw new ExecutionError("RESOURCE_ERROR", "SDK arguments exceed bridge limit");
  }
  invocation.calls += 1;
  if (invocation.calls > invocation.limits.scriptMaxCalls) {
    throw new ExecutionError("RESOURCE_ERROR", "SDK call budget exceeded");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(request) as unknown;
  } catch {
    throw new ExecutionError("INVALID_ARGUMENT", "Invalid SDK bridge JSON");
  }
  if (
    !isRecord(decoded) ||
    typeof decoded["method"] !== "string" ||
    !Array.isArray(decoded["args"])
  ) {
    throw new ExecutionError("INVALID_ARGUMENT", "Invalid SDK bridge request");
  }
  const method: string = decoded["method"];
  const args = decoded["args"] as unknown[];
  if (method === "stream-open") return openStream(invocation, args);
  if (method === "stream-next" || method === "stream-return") {
    return await consumeStream(invocation, method, args);
  }
  if (!permitted(invocation, method) || STREAM_METHODS.has(method)) {
    throw new ExecutionError("PERMISSION_DENIED", "SDK method is not allowed");
  }
  if (args.length > 1)
    throw new ExecutionError("INVALID_ARGUMENT", "SDK accepts at most one argument");
  return encode(
    await invoke(invocation.client, method, args[0], { signal: invocation.controller.signal })
  );
}

async function dispatchWithBudget(invocation: Invocation, request: string): Promise<string> {
  if (invocation.pending >= MAX_PENDING_SDK) {
    throw new ExecutionError("RESOURCE_ERROR", "Too many concurrent SDK calls");
  }
  invocation.pending += 1;
  try {
    return await dispatch(invocation, request);
  } finally {
    invocation.pending -= 1;
  }
}

type Finish = (error?: Error, value?: JsonValue) => void;

function dispatchWorkerCall(
  invocation: Invocation,
  worker: Worker,
  message: WorkerCall,
  finish: Finish
): void {
  void dispatchWithBudget(invocation, message.request).then(
    (json) => {
      if (!invocation.closed) worker.postMessage({ type: "resolve", id: message.id, json });
    },
    (error: unknown) => {
      if (invocation.closed) return;
      const publicError = normalizeError(error);
      if (publicError.code === "RESOURCE_ERROR") {
        finish(
          new ExecutionError(
            "RESOURCE_ERROR",
            publicError.message + (invocation.writable ? "; writes may have completed" : "")
          )
        );
      } else {
        worker.postMessage({ type: "reject", id: message.id, ...publicError });
      }
    }
  );
}

function handleWorkerMessage(
  invocation: Invocation,
  worker: Worker,
  message: WorkerMessage,
  finish: Finish
): void {
  if (invocation.closed) return;
  if (message.type === "complete") {
    try {
      finish(
        undefined,
        parseInvocationResult(message.json, invocation.limits.scriptMaxOutputBytes)
      );
    } catch (error) {
      finish(
        error instanceof Error ? error : new ExecutionError("SCRIPT_ERROR", "Invalid Sandbox JSON")
      );
    }
    return;
  }
  if (message.type === "failure") {
    const uncertainWrite =
      invocation.writable && (message.code === "RESOURCE_ERROR" || message.code === "CANCELLED");
    finish(
      new ExecutionError(
        message.code,
        message.message + (uncertainWrite ? "; writes may have completed" : "")
      )
    );
    return;
  }
  if (!Number.isSafeInteger(message.id)) {
    finish(new ExecutionError("SCRIPT_ERROR", "Invalid Sandbox message"));
    return;
  }
  dispatchWorkerCall(invocation, worker, message, finish);
}

function workerFor(code: string, limits: SandboxLimits): Worker {
  const compiled = new URL("./sandbox-worker.js", import.meta.url);
  const entry = existsSync(compiled) ? compiled : new URL("./sandbox-worker.ts", import.meta.url);
  return new Worker(entry, {
    workerData: {
      code,
      deadline: Date.now() + limits.scriptTimeoutMs,
      memoryBytes: limits.scriptMemoryMb * 1024 * 1024
    }
  });
}

function runInvocation(
  invocation: Invocation,
  code: string,
  signal?: AbortSignal
): Promise<JsonValue> {
  const worker = workerFor(code, invocation.limits);
  return new Promise<JsonValue>((resolve, reject) => {
    const finish: Finish = (error, value) => {
      if (invocation.closed) return;
      invocation.closed = true;
      invocation.controller.abort();
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancelled);
      for (const stream of invocation.streams.values()) {
        void stream.iterator.return?.().catch(() => undefined);
      }
      invocation.streams.clear();
      void worker.terminate().catch(() => undefined);
      if (error !== undefined) reject(error);
      else resolve(value ?? null);
    };
    const timer = setTimeout(() => {
      finish(
        new ExecutionError(
          "RESOURCE_ERROR",
          "Sandbox deadline exceeded" + (invocation.writable ? "; writes may have completed" : "")
        )
      );
    }, invocation.limits.scriptTimeoutMs);
    const cancelled = () => {
      finish(
        new ExecutionError(
          "CANCELLED",
          "Invocation cancelled" + (invocation.writable ? "; writes may have completed" : "")
        )
      );
    };
    signal?.addEventListener("abort", cancelled, { once: true });
    worker.on("message", (message: WorkerMessage) => {
      handleWorkerMessage(invocation, worker, message, finish);
    });
    worker.once("error", () => {
      finish(new ExecutionError("SCRIPT_ERROR", "Sandbox Worker failed"));
    });
    worker.once("exit", () => {
      finish(new ExecutionError("RESOURCE_ERROR", "Sandbox Worker exited without a result"));
    });
    if (signal?.aborted === true) cancelled();
  });
}

export interface ExecutionOptions {
  signal?: AbortSignal;
  limits?: SandboxLimits;
}

export async function executeScript(
  client: KGOSClient,
  code: string,
  writable: boolean,
  options: ExecutionOptions = {}
): Promise<JsonValue> {
  const { signal, limits = DEFAULT_SANDBOX_LIMITS } = options;
  if (byteLength(code) > limits.scriptMaxCodeBytes) {
    throw new ExecutionError("RESOURCE_ERROR", "Script exceeds size limit");
  }
  if (signal?.aborted === true) throw new ExecutionError("CANCELLED", "Invocation cancelled");
  const invocation: Invocation = {
    client,
    writable,
    limits,
    controller: new AbortController(),
    streams: new Map(),
    calls: 0,
    pending: 0,
    closed: false
  };
  return await runInvocation(invocation, code, signal);
}
