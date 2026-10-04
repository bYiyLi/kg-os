export const RESPONSE_LIMITS = { chunk: 32 << 10, event: 1 << 20, json: 16 << 20 };

export class ResponseBudgetError extends Error {
  constructor() {
    super("响应超过前端接收预算，结果未完整");
    this.name = "ResponseBudgetError";
  }
}

interface AdapterOptions {
  boot: () => string | undefined;
  valid?: () => boolean;
  fetch?: typeof fetch;
  onUnauthorized: () => void;
  abort: (signal: AbortSignal | null | undefined, reason: Error) => void;
}

function scanBytes(bytes: Uint8Array, pending: number): number {
  for (const byte of bytes) {
    pending = byte === 10 ? 0 : pending + 1;
    if (pending > RESPONSE_LIMITS.event) throw new ResponseBudgetError();
  }
  return pending;
}

function boundedBody(
  response: Response,
  ndjson: boolean,
  options: AdapterOptions,
  signal?: AbortSignal | null
) {
  const reader = response.body?.getReader();
  if (reader === undefined) return null;
  let pending = new Uint8Array(0);
  let total = 0;
  let eventBytes = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (pending.byteLength === 0) {
          const next = await reader.read();
          if (next.done) {
            controller.close();
            reader.releaseLock();
            return;
          }
          pending = next.value;
        }
        const piece = pending.subarray(0, RESPONSE_LIMITS.chunk);
        pending = pending.subarray(piece.byteLength);
        total += piece.byteLength;
        if (ndjson) eventBytes = scanBytes(piece, eventBytes);
        else if (total > RESPONSE_LIMITS.json) throw new ResponseBudgetError();
        controller.enqueue(piece);
      } catch (error) {
        pending = new Uint8Array(0);
        if (error instanceof ResponseBudgetError) options.abort(signal, error);
        await reader.cancel().catch(() => undefined);
        controller.error(error);
      }
    },
    async cancel(reason: unknown) {
      pending = new Uint8Array(0);
      await reader.cancel(reason);
    }
  });
}

export function createWebFetch(options: AdapterOptions): typeof fetch {
  const implementation = options.fetch ?? globalThis.fetch;
  return async (input, init) => {
    if (options.valid?.() === false) throw new Error("连接已变化，旧操作未发送");
    const headers = new Headers(init?.headers);
    const boot = options.boot();
    if (boot !== undefined) headers.set("X-KGOS-Expected-Daemon-Boot", boot);
    const response = await implementation(input, { ...init, headers });
    if (options.valid?.() === false) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("连接已变化，已停止读取旧响应");
    }
    if (response.status === 401) options.onUnauthorized();
    if (headers.get("Accept") === "application/vnd.sqlite3") return response;
    const ndjson = response.headers.get("Content-Type")?.includes("application/x-ndjson") === true;
    return new Response(boundedBody(response, ndjson, options, init?.signal), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  };
}
