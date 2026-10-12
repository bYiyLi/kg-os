import { getQuickJS, type QuickJSContext, type QuickJSRuntime } from "quickjs-emscripten";

export interface WorkerInput {
  code: string;
  deadline: number;
  memoryBytes: number;
}

export interface BridgeReply {
  type: "resolve" | "reject";
  id: number;
  json?: string;
  code?: string;
  message?: string;
  details?: unknown;
}

export interface BridgeChannel {
  postMessage(value: Record<string, unknown>): void;
  onMessage(listener: (message: BridgeReply) => void): void;
  removeMessageListeners(): void;
}

const bootstrap = `
(() => {
  const call = async (method, ...args) => {
    try {
      return JSON.parse(await __kgos_bridge(JSON.stringify({ method, args })));
    } catch (error) {
      if (error && typeof error.detailsJson === "string") {
        error.details = JSON.parse(error.detailsJson);
      }
      throw error;
    }
  };
  const stream = async function* (method, request) {
    const { streamId } = await call("stream-open", method, request);
    try {
      for (;;) {
        const next = await call("stream-next", streamId);
        if (next.done) return;
        yield next.value;
      }
    } finally {
      await call("stream-return", streamId);
    }
  };
  const freeze = (value) => Object.freeze(value);
  globalThis.ontology = freeze({
    read: (request) => call("ontology.read", request),
    patch: (request) => call("ontology.patch", request)
  });
  globalThis.object = freeze({
    read: (request) => call("object.read", request),
    readText: (request) => call("object.readText", request),
    patch: (request) => call("object.patch", request)
  });
  globalThis.graph = freeze({
    query: (request) => call("graph.query", request),
    execute: (request) => call("graph.execute", request),
    streamQuery: (request) => stream("graph.streamQuery", request),
    streamExecute: (request) => stream("graph.streamExecute", request)
  });
  globalThis.evolution = freeze({
    overview: () => call("evolution.overview"),
    get: (request) => call("evolution.get", request),
    ancestry: (request) => call("evolution.ancestry", request),
    history: (request) => call("evolution.history", request),
    diff: (request) => call("evolution.diff", request),
    state: freeze({
      create: (request) => call("evolution.state.create", request),
      setData: (request) => call("evolution.state.setData", request),
      clearData: (request) => call("evolution.state.clearData", request)
    }),
    branch: freeze({
      list: () => call("evolution.branch.list"),
      create: (request) => call("evolution.branch.create", request),
      delete: (request) => call("evolution.branch.delete", request)
    }),
    tag: freeze({
      list: () => call("evolution.tag.list"),
      create: (request) => call("evolution.tag.create", request),
      move: (request) => call("evolution.tag.move", request),
      delete: (request) => call("evolution.tag.delete", request)
    }),
    merge: freeze({
      list: (request) => call("evolution.merge.list", request ?? {}),
      get: (request) => call("evolution.merge.get", request),
      conflicts: (request) => call("evolution.merge.conflicts", request),
      start: (request) => call("evolution.merge.start", request),
      resolve: (request) => call("evolution.merge.resolve", request),
      finalize: (request) => call("evolution.merge.finalize", request),
      abort: (request) => call("evolution.merge.abort", request)
    })
  });
})()
`;

const wrapper = (code: string): string => `
(async () => {
  const stringify = JSON.stringify.bind(JSON);
  const ownKeys = Reflect.ownKeys.bind(Reflect);
  const descriptors = Object.getOwnPropertyDescriptors.bind(Object);
  const prototype = Object.getPrototypeOf.bind(Object);
  const isArray = Array.isArray.bind(Array);
  const plain = Object.prototype;
  const arrayProto = Array.prototype;
  Object.freeze(plain);
  Object.freeze(arrayProto);
  const inspect = (value, stack = new Set(), depth = 0) => {
    if (depth > 64) throw new TypeError("Result exceeds JSON depth limit");
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number" && Number.isFinite(value)) return;
    if (typeof value !== "object") throw new TypeError("Result is not JSON-compatible");
    if (stack.has(value)) throw new TypeError("Result contains circular references");
    if (!isArray(value) && prototype(value) !== plain && prototype(value) !== null) {
      throw new TypeError("Result contains a non-plain object");
    }
    stack.add(value);
    const props = descriptors(value);
    for (const key of ownKeys(props)) {
      if (typeof key !== "string" || key === "__proto__" || key === "toJSON") {
        throw new TypeError("Result contains an unsupported property");
      }
      if (isArray(value) && key === "length") continue;
      const descriptor = props[key];
      if (!descriptor || !("value" in descriptor)) {
        throw new TypeError("Result contains an accessor");
      }
      inspect(descriptor.value, stack, depth + 1);
    }
    if (isArray(value)) {
      for (let index = 0; index < value.length; index++) {
        if (!(index in value)) throw new TypeError("Result contains a sparse array");
      }
    }
    stack.delete(value);
  };
  const user = async () => {
${code}
  };
  try {
    const value = await user();
    inspect(value);
    return stringify({ ok: true, value });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Script threw a non-Error value";
    const code = error && typeof error.code === "string" ? error.code : "SCRIPT_ERROR";
    return stringify({
      ok: false, code, message: String(message).slice(0, 1024),
      ...(error && error.details !== undefined ? { details: error.details } : {})
    });
  }
})()`;

async function evaluateGuest(
  vm: QuickJSContext,
  runtime: QuickJSRuntime,
  input: WorkerInput,
  report: (value: Record<string, unknown>) => void
): Promise<void> {
  const start = vm.evalCode(wrapper(input.code), "kgos-invocation.js");
  const handle = vm.unwrapResult(start);
  try {
    // Subscribe before draining jobs: a settled guest Promise can be missed.
    const waiting = vm.resolvePromise(handle);
    const initialJobs = runtime.executePendingJobs();
    if (initialJobs.error !== undefined) {
      initialJobs.error.dispose();
      throw new Error("QuickJS pending job failed");
    }
    const settled = await waiting;
    const value = vm.unwrapResult(settled);
    try {
      if (Date.now() >= input.deadline) {
        report({ type: "failure", code: "RESOURCE_ERROR", message: "Sandbox deadline exceeded" });
      } else {
        report({ type: "complete", json: vm.getString(value) });
      }
    } finally {
      value.dispose();
    }
  } finally {
    handle.dispose();
  }
}

async function runEngine(
  input: WorkerInput,
  channel: BridgeChannel,
  report: (value: Record<string, unknown>) => void
): Promise<void> {
  const quickJS = await getQuickJS();
  const runtime = quickJS.newRuntime();
  runtime.setMemoryLimit(input.memoryBytes);
  runtime.setMaxStackSize(512 * 1024);
  runtime.setInterruptHandler(() => Date.now() >= input.deadline);
  const vm = runtime.newContext();
  const pending = new Map<number, ReturnType<typeof vm.newPromise>>();
  let callId = 0;

  try {
    const bridge = vm.newFunction("__kgos_bridge", (payload) => {
      const request = vm.getString(payload);
      const promise = vm.newPromise();
      const id = ++callId;
      pending.set(id, promise);
      void promise.settled
        .then(() => {
          const jobs = runtime.executePendingJobs();
          if (jobs.error !== undefined) {
            jobs.error.dispose();
            report({ type: "failure", code: "SCRIPT_ERROR", message: "Guest promise failed" });
          }
        })
        .catch(() => {
          report({ type: "failure", code: "SCRIPT_ERROR", message: "Guest promise failed" });
        });
      channel.postMessage({ type: "call", id, request });
      return promise.handle;
    });
    vm.setProp(vm.global, "__kgos_bridge", bridge);
    bridge.dispose();
    vm.unwrapResult(vm.evalCode(bootstrap)).dispose();

    channel.onMessage((message: BridgeReply) => {
      const promise = pending.get(message.id);
      if (promise === undefined) return;
      pending.delete(message.id);
      if (message.type === "resolve" && typeof message.json === "string") {
        const handle = vm.newString(message.json);
        promise.resolve(handle);
        handle.dispose();
      } else {
        const error = vm.newError();
        const msg = vm.newString(message.message ?? "SDK call failed");
        vm.setProp(error, "message", msg);
        msg.dispose();
        if (message.code !== undefined) {
          const code = vm.newString(message.code);
          vm.setProp(error, "code", code);
          code.dispose();
        }
        if (message.details !== undefined) {
          const details = vm.newString(JSON.stringify(message.details));
          vm.setProp(error, "detailsJson", details);
          details.dispose();
        }
        promise.reject(error);
        error.dispose();
      }
    });

    await evaluateGuest(vm, runtime, input, report);
  } finally {
    channel.removeMessageListeners();
    for (const promise of pending.values()) {
      promise.dispose();
    }
    vm.dispose();
    runtime.dispose();
  }
}

export async function runSandboxEngine(input: WorkerInput, channel: BridgeChannel): Promise<void> {
  let completed = false;
  const report = (value: Record<string, unknown>) => {
    if (completed) return;
    completed = true;
    channel.postMessage(value);
  };
  try {
    await runEngine(input, channel, report);
  } catch {
    report({
      type: "failure",
      code: Date.now() >= input.deadline ? "RESOURCE_ERROR" : "SCRIPT_ERROR",
      message: "Sandbox execution failed"
    });
  }
}
