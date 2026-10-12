import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { fail, formBody, invalidAuthorizationTicket, json, oauthHeaders } from "./oauth-http.js";

const SCOPE = "kgos:access";
const AUTH_TICKET_MS = 5 * 60_000;
const CODE_MS = 60_000;
const ACCESS_MS = 60 * 60_000;
const REFRESH_MS = 30 * 24 * 60 * 60_000;
const MAX_PENDING = 128;
const MAX_TOKENS = 256;
const CLIENT_DOCUMENT_MAX_BYTES = 16_384;
const CLIENT_METADATA_TTL_MS = 5 * 60_000;

interface Authorization {
  clientId: string;
  redirectUri: string;
  resource: string;
  state: string;
  challenge: string;
  expires: number;
}

interface Ticket extends Authorization {
  failures: number;
}

interface Grant {
  clientId: string;
  resource: string;
  issuer: string;
  scope: string;
  expires: number;
}

function digest(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function secret(): string {
  return randomBytes(32).toString("base64url");
}

function valid(value: string | null, pattern: RegExp, max = 512): value is string {
  return value !== null && value.length <= max && pattern.test(value);
}

function only(search: URLSearchParams, key: string): string | null {
  const values = search.getAll(key);
  return values.length === 1 ? (values[0] ?? null) : null;
}

export function validateOAuthIssuer(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("OAuth issuer must be an absolute HTTPS origin");
  }
  const local =
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]");
  if (
    (url.protocol !== "https:" && !local) ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.origin === "null"
  ) {
    throw new Error(
      "OAuth issuer must be a public HTTPS origin (or loopback HTTP for development)"
    );
  }
  return url.origin;
}

function clientDocumentId(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "chatgpt.com" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      /^\/oauth\/(?:client\.json|[A-Za-z0-9_-]{1,100}\/client\.json)$/.test(url.pathname) &&
      url.href === value
    );
  } catch {
    return false;
  }
}

function safeRedirect(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri);
    return (
      url.protocol === "https:" &&
      url.origin === "https://chatgpt.com" &&
      url.username === "" &&
      url.password === "" &&
      url.hash === "" &&
      redirectUri === url.href &&
      redirectUri.length <= 2048
    );
  } catch {
    return false;
  }
}

export class OAuthBroker {
  readonly issuer: string;
  private readonly resourcePath: string;
  private readonly adminDigest: Buffer;
  private readonly tickets = new Map<string, Ticket>();
  private readonly codes = new Map<string, Authorization>();
  private readonly access = new Map<string, Grant>();
  private readonly refresh = new Map<string, Grant>();
  private readonly clientDocuments = new Map<string, { redirects: string[]; expires: number }>();
  private metadataRequests = 0;

  constructor(issuer: string, adminToken: string, resourcePath = "/mcp") {
    this.issuer = validateOAuthIssuer(issuer);
    this.resourcePath = resourcePath;
    this.adminDigest = createHash("sha256").update(adminToken).digest();
  }

  get resource(): string {
    return this.issuer;
  }

  get resourceMetadataUrl(): string {
    return this.issuer + this.resourceMetadataPath;
  }

  private get resourceMetadataPath(): string {
    return "/.well-known/oauth-protected-resource" + this.resourcePath;
  }

  principal(bearer: string): string | undefined {
    if (!valid(bearer, /^[A-Za-z0-9_-]{32,512}$/, 512)) return undefined;
    this.prune();
    const key = digest(bearer);
    const grant = this.access.get(key);
    if (
      grant?.resource !== this.resource ||
      grant.issuer !== this.issuer ||
      grant.scope !== SCOPE ||
      grant.expires <= Date.now()
    ) {
      return undefined;
    }
    // This deployment has one administrator. Keep Preview revisions stable across refreshes
    // and across the equivalent static-Bearer and OAuth transport credentials.
    return this.adminDigest.toString("hex");
  }

  private prune(): void {
    const now = Date.now();
    for (const collection of [
      this.tickets,
      this.codes,
      this.access,
      this.refresh,
      this.clientDocuments
    ]) {
      for (const [key, value] of collection) {
        if (value.expires <= now) collection.delete(key);
      }
    }
  }

  private async redirectsFor(clientId: string): Promise<string[] | undefined> {
    if (!clientDocumentId(clientId)) return undefined;
    const cached = this.clientDocuments.get(clientId);
    if (cached !== undefined && cached.expires > Date.now()) return cached.redirects;
    if (this.metadataRequests >= 8 || this.clientDocuments.size >= MAX_PENDING) return undefined;
    this.metadataRequests += 1;
    try {
      return await this.fetchClientDocument(clientId);
    } finally {
      this.metadataRequests -= 1;
    }
  }

  private async fetchClientDocument(clientId: string): Promise<string[] | undefined> {
    const response = await fetch(clientId, {
      redirect: "error",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000)
    });
    if (
      !response.ok ||
      Number(response.headers.get("content-length") ?? "0") > CLIENT_DOCUMENT_MAX_BYTES
    ) {
      return undefined;
    }
    const reader = response.body?.getReader();
    if (reader === undefined) return undefined;
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        length += result.value.byteLength;
        if (length > CLIENT_DOCUMENT_MAX_BYTES) return undefined;
        chunks.push(result.value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    const document = JSON.parse(
      Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8")
    ) as unknown;
    if (typeof document !== "object" || document === null || Array.isArray(document))
      return undefined;
    const info = document as Record<string, unknown>;
    const methods = info["token_endpoint_auth_methods_supported"];
    const supportsNone = Array.isArray(methods)
      ? methods.includes("none")
      : info["token_endpoint_auth_method"] === "none";
    if (
      info["client_id"] !== clientId ||
      !Array.isArray(info["redirect_uris"]) ||
      !info["redirect_uris"].every(
        (uri: unknown) => typeof uri === "string" && safeRedirect(uri)
      ) ||
      info["redirect_uris"].length < 1 ||
      !supportsNone
    ) {
      return undefined;
    }
    const redirects = info["redirect_uris"] as string[];
    this.clientDocuments.set(clientId, { redirects, expires: Date.now() + CLIENT_METADATA_TTL_MS });
    return redirects;
  }

  private html(res: ServerResponse, ticket: string, invalid: boolean): void {
    oauthHeaders(res);
    // Chromium sends Origin: null for a same-origin HTML form POST when
    // Referrer-Policy is no-referrer. Keep the strict Origin CSRF check while
    // revealing only the public origin, never the OAuth query parameters.
    res.setHeader("Referrer-Policy", "strict-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
    );
    res.writeHead(invalid ? 401 : 200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      '<!doctype html><html lang="en"><meta charset="utf-8"><title>KG OS authorization</title>' +
        "<h1>Authorize ChatGPT to access KG OS</h1><p>This grants access to all four MCP tools, including writes.</p>" +
        "<p>This authorization page expires after five minutes. If it expires, restart authorization from ChatGPT.</p>" +
        (invalid ? "<p>Invalid administrator token.</p>" : "") +
        '<form method="POST" action="/oauth/authorize">' +
        '<input type="hidden" name="ticket" value="' +
        ticket +
        '">' +
        '<label>KG OS MCP administrator token <input name="token" type="password" autocomplete="off" required></label>' +
        '<button name="decision" value="approve">Authorize</button>' +
        '<button name="decision" value="deny" formnovalidate>Cancel</button></form></html>'
    );
  }

  private redirect(res: ServerResponse, item: Authorization, values: Record<string, string>): void {
    const location = new URL(item.redirectUri);
    for (const [key, value] of Object.entries({ ...values, state: item.state, iss: this.issuer })) {
      location.searchParams.set(key, value);
    }
    oauthHeaders(res);
    res.writeHead(302, { Location: location.href }).end();
  }

  private async authorize(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    if (req.method === "GET") {
      await this.beginAuthorization(res, url.searchParams);
      return;
    }
    if (req.method !== "POST") {
      fail(res, 405);
      return;
    }
    await this.finishAuthorization(req, res);
  }

  private async beginAuthorization(res: ServerResponse, q: URLSearchParams): Promise<void> {
    this.prune();
    if (this.codes.size >= MAX_PENDING) {
      fail(res, 429, "temporarily_unavailable");
      return;
    }
    const clientId = only(q, "client_id");
    const redirect = only(q, "redirect_uri");
    const state = only(q, "state");
    const challenge = only(q, "code_challenge");
    if (
      !valid(clientId, /^https:\/\/[\x21-\x7e]+$/, 512) ||
      !valid(redirect, /^https:\/\/[\x21-\x7e]+$/, 2048) ||
      !valid(state, /^[\x21-\x7e]{1,512}$/) ||
      !valid(challenge, /^[A-Za-z0-9_-]{43}$/) ||
      only(q, "response_type") !== "code" ||
      only(q, "code_challenge_method") !== "S256" ||
      only(q, "resource") !== this.resource ||
      (q.has("scope") && only(q, "scope") !== SCOPE)
    ) {
      fail(res, 400);
      return;
    }
    const redirects = await this.redirectsFor(clientId);
    if (redirects?.includes(redirect) !== true) {
      fail(res, 400, "invalid_client");
      return;
    }
    if (this.tickets.size >= MAX_PENDING) {
      const oldest = this.tickets.keys().next().value;
      if (oldest !== undefined) this.tickets.delete(oldest);
    }
    const ticket = secret();
    this.tickets.set(digest(ticket), {
      clientId,
      redirectUri: redirect,
      resource: this.resource,
      state,
      challenge,
      expires: Date.now() + AUTH_TICKET_MS,
      failures: 0
    });
    this.html(res, ticket, false);
  }

  private async finishAuthorization(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.headers.origin !== undefined && req.headers.origin !== this.issuer) {
      fail(res, 403);
      return;
    }
    const q = await formBody(req);
    const ticket = only(q, "ticket");
    const decision = only(q, "decision");
    if (!valid(ticket, /^[A-Za-z0-9_-]{43}$/) || (decision !== "approve" && decision !== "deny")) {
      fail(res, 400);
      return;
    }
    this.prune();
    const key = digest(ticket);
    const item = this.tickets.get(key);
    if (item === undefined) {
      invalidAuthorizationTicket(req, res);
      return;
    }
    if (decision === "deny") {
      this.tickets.delete(key);
      this.redirect(res, item, { error: "access_denied" });
      return;
    }
    const supplied = only(q, "token");
    const candidate = createHash("sha256")
      .update(supplied ?? "")
      .digest();
    if (
      supplied === null ||
      Buffer.byteLength(supplied, "utf8") > 4096 ||
      !timingSafeEqual(candidate, this.adminDigest)
    ) {
      item.failures += 1;
      if (item.failures >= 5) {
        this.tickets.delete(key);
        fail(res, 429, "access_denied");
      } else this.html(res, ticket, true);
      return;
    }
    this.tickets.delete(key);
    const code = secret();
    this.codes.set(digest(code), { ...item, expires: Date.now() + CODE_MS });
    this.redirect(res, item, { code });
  }

  private issue(res: ServerResponse, grant: Grant): void {
    this.prune();
    if (this.access.size >= MAX_TOKENS || this.refresh.size >= MAX_TOKENS) {
      fail(res, 503, "temporarily_unavailable");
      return;
    }
    const accessToken = secret();
    const refreshToken = secret();
    this.access.set(digest(accessToken), { ...grant, expires: Date.now() + ACCESS_MS });
    this.refresh.set(digest(refreshToken), { ...grant, expires: Date.now() + REFRESH_MS });
    json(res, 200, {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_MS / 1000,
      refresh_token: refreshToken,
      scope: SCOPE
    });
  }

  private async token(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST") {
      fail(res, 405);
      return;
    }
    if (req.headers.authorization !== undefined) {
      fail(res, 401, "invalid_client");
      return;
    }
    const q = await formBody(req);
    const grantType = only(q, "grant_type");
    const clientId = only(q, "client_id");
    const resource = only(q, "resource");
    if (
      !valid(clientId, /^https:\/\/[\x21-\x7e]+$/, 512) ||
      !clientDocumentId(clientId) ||
      resource !== this.resource ||
      q.has("client_secret") ||
      q.has("client_assertion")
    ) {
      fail(res, 400, "invalid_client");
      return;
    }
    this.prune();
    if (grantType === "authorization_code") {
      this.redeemAuthorizationCode(res, q, {
        clientId,
        resource,
        issuer: this.issuer,
        scope: SCOPE,
        expires: 0
      });
      return;
    }
    if (grantType === "refresh_token") {
      this.rotateRefreshToken(res, q, clientId, resource);
      return;
    }
    fail(res, 400, "unsupported_grant_type");
  }

  private redeemAuthorizationCode(res: ServerResponse, q: URLSearchParams, grant: Grant): void {
    const code = only(q, "code");
    const redirect = only(q, "redirect_uri");
    const verifier = only(q, "code_verifier");
    if (!valid(code, /^[A-Za-z0-9_-]{43}$/)) {
      fail(res, 400, "invalid_grant");
      return;
    }
    const key = digest(code);
    const pending = this.codes.get(key);
    this.codes.delete(key);
    if (
      pending?.clientId !== grant.clientId ||
      pending.resource !== grant.resource ||
      pending.redirectUri !== redirect ||
      !valid(verifier, /^[A-Za-z0-9._~-]{43,128}$/, 128) ||
      createHash("sha256").update(verifier).digest("base64url") !== pending.challenge
    ) {
      fail(res, 400, "invalid_grant");
      return;
    }
    this.issue(res, grant);
  }

  private rotateRefreshToken(
    res: ServerResponse,
    q: URLSearchParams,
    clientId: string,
    resource: string
  ): void {
    const refresh = only(q, "refresh_token");
    if (!valid(refresh, /^[A-Za-z0-9_-]{43}$/)) {
      fail(res, 400, "invalid_grant");
      return;
    }
    const key = digest(refresh);
    const previous = this.refresh.get(key);
    this.refresh.delete(key);
    if (previous?.clientId !== clientId || previous.resource !== resource) {
      fail(res, 400, "invalid_grant");
      return;
    }
    this.issue(res, previous);
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", this.issuer);
    const pathname = url.pathname;
    if (
      pathname !== "/.well-known/oauth-protected-resource" &&
      pathname !== this.resourceMetadataPath &&
      pathname !== "/.well-known/oauth-authorization-server" &&
      pathname !== "/oauth/authorize" &&
      pathname !== "/oauth/token"
    ) {
      return false;
    }
    try {
      if (
        pathname === "/.well-known/oauth-protected-resource" ||
        pathname === this.resourceMetadataPath
      ) {
        if (req.method !== "GET") fail(res, 405);
        else
          json(res, 200, {
            resource: this.resource,
            authorization_servers: [this.issuer],
            scopes_supported: [SCOPE]
          });
      } else if (pathname === "/.well-known/oauth-authorization-server") {
        if (req.method !== "GET") fail(res, 405);
        else
          json(res, 200, {
            issuer: this.issuer,
            authorization_endpoint: this.issuer + "/oauth/authorize",
            token_endpoint: this.issuer + "/oauth/token",
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token"],
            code_challenge_methods_supported: ["S256"],
            token_endpoint_auth_methods_supported: ["none"],
            client_id_metadata_document_supported: true,
            authorization_response_iss_parameter_supported: true,
            scopes_supported: [SCOPE]
          });
      } else if (pathname === "/oauth/authorize") {
        await this.authorize(req, res, url);
      } else {
        await this.token(req, res);
      }
    } catch {
      if (!res.headersSent) fail(res, 400);
    }
    return true;
  }
}
