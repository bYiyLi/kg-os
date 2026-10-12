import type { IncomingMessage, ServerResponse } from "node:http";

export function oauthHeaders(res: ServerResponse): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export function json(res: ServerResponse, status: number, body: unknown): void {
  oauthHeaders(res);
  res
    .writeHead(status, { "Content-Type": "application/json; charset=utf-8" })
    .end(JSON.stringify(body));
}

export function fail(res: ServerResponse, status: number, error = "invalid_request"): void {
  json(res, status, { error });
}

export function invalidAuthorizationTicket(req: IncomingMessage, res: ServerResponse): void {
  if (!/(?:^|,)\s*text\/html(?:[;,]|$)/i.test(req.headers.accept ?? "")) {
    fail(res, 400);
    return;
  }
  oauthHeaders(res);
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  );
  res
    .writeHead(400, { "Content-Type": "text/html; charset=utf-8" })
    .end(
      '<!doctype html><html lang="en"><meta charset="utf-8"><title>KG OS authorization expired</title>' +
        "<h1>Authorization request expired</h1>" +
        "<p>This authorization page is no longer valid. Return to ChatGPT and start the connection authorization again.</p></html>"
    );
}

export async function formBody(req: IncomingMessage): Promise<URLSearchParams> {
  if (
    !/^application\/x-www-form-urlencoded(?:\s*;\s*charset=UTF-8)?$/i.test(
      req.headers["content-type"] ?? ""
    )
  ) {
    throw new Error("unsupported_media_type");
  }
  const length = Number(req.headers["content-length"] ?? 0);
  if (length > 8192 || !Number.isSafeInteger(length) || length < 0) {
    throw new Error("invalid_request");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    if (!Buffer.isBuffer(chunk)) throw new Error("invalid_request");
    size += chunk.byteLength;
    if (size > 8192) throw new Error("invalid_request");
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}
