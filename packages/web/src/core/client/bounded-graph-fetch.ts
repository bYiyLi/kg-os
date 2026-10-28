export const MAX_GRAPH_RESPONSE_BYTES = 16 * 1024 * 1024;

function requestAddress(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function isJsonGraphQuery(input: RequestInfo | URL, init: RequestInit | undefined): boolean {
  const request = typeof input === "string" || input instanceof URL ? undefined : input;
  const method = init?.method ?? request?.method ?? "GET";
  const accept = new Headers(init?.headers ?? request?.headers).get("Accept");
  return (
    method.toUpperCase() === "POST" &&
    new URL(requestAddress(input), "http://kgos.invalid").pathname === "/api/v1/graph/query" &&
    accept
      ?.split(",")
      .some((type) => type.split(";")[0]?.trim().toLowerCase() === "application/json") === true
  );
}

function responseTooLarge(): RangeError {
  return new RangeError("Graph response exceeds the 16 MiB browser limit");
}

// Read a bounded byte buffer before the SDK's unchanged JSON decoder sees it.
// This adapter only covers non-streaming read queries; other routes and error
// responses retain their original body and authentication handling.
export async function boundedGraphResponse(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  response: Response,
  signal: AbortSignal
): Promise<Response> {
  if (!response.ok || !isJsonGraphQuery(input, init) || response.body === null) return response;

  const reader = response.body.getReader();
  const cancel = (reason: unknown) => {
    // Cancellation must not delay an abort/limit error if the transport's
    // underlying cancellation is slow or itself fails.
    void reader.cancel(reason).catch(() => undefined);
  };
  const onAbort = () => {
    cancel(signal.reason);
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    signal.throwIfAborted();
    const declaredLength = response.headers.get("Content-Length");
    if (
      declaredLength !== null &&
      /^\d+$/.test(declaredLength) &&
      Number(declaredLength) > MAX_GRAPH_RESPONSE_BYTES
    ) {
      throw responseTooLarge();
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_GRAPH_RESPONSE_BYTES) throw responseTooLarge();
      chunks.push(value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new Response(bytes, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText
    });
  } catch (error) {
    cancel(error);
    throw error;
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}
