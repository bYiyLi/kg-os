import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";

// Only the disposable Docker instance receives synthetic approvals.
// Use real DCR instead of relying on ChatGPT's public metadata/network.
// Real ChatGPT and Muse host acceptance is a separate Phase 36 gate.
const scope = "mcp offline_access";

async function request(base, path, options = {}) {
  return fetch(base + path, { ...options, signal: AbortSignal.timeout(15_000) });
}

async function listTools(base, bearer, expectedStatus = 200) {
  const response = await request(base, "/mcp", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + bearer,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25"
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 34, method: "tools/list", params: {} })
  });
  assert.equal(response.status, expectedStatus, "OAuth fixture MCP authorization mismatch");
  if (expectedStatus === 401) {
    assert.ok(
      response.headers.get("www-authenticate")?.includes('error="invalid_token"'),
      "Revoked OAuth fixture credential did not return invalid_token"
    );
    await response.body?.cancel();
    return;
  }
  const value = await response.json();
  assert.ok(Array.isArray(value.result?.tools), "OAuth fixture could not discover MCP tools");
  assert.ok(value.result.tools.length >= 5, "OAuth fixture tool discovery was incomplete");
}

function assertTokenPair(pair) {
  assert.ok(
    typeof pair.access_token === "string" && /^[A-Za-z0-9_-]{43}$/.test(pair.access_token),
    "OAuth fixture access token shape was invalid"
  );
  assert.ok(
    typeof pair.refresh_token === "string" && /^[A-Za-z0-9_-]{43}$/.test(pair.refresh_token),
    "OAuth fixture refresh token shape was invalid"
  );
  assert.equal(pair.token_type, "Bearer");
  assert.equal(pair.expires_in, 840, "OAuth fixture did not advertise the 14-minute refresh hint");
  assert.equal(pair.scope, scope, "OAuth fixture lost its granted scope");
}

async function tokenRequest(base, issuer, clientID, values) {
  return request(base, "/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientID, resource: issuer + "/mcp", ...values })
  });
}

export async function prepareOAuthRestart({ base, rootToken, issuer }) {
  const redirectURI = "http://127.0.0.1:49179/callback";
  const metadataResponse = await request(base, "/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "KG OS isolated Docker MCP Client",
      redirect_uris: [redirectURI],
      token_endpoint_auth_method: "none",
      scope
    })
  });
  assert.equal(metadataResponse.status, 201, "OAuth DCR public client registration failed");
  const metadata = await metadataResponse.json();
  const clientID = metadata.client_id;
  assert.match(clientID, /^kg_mcp_[A-Za-z0-9_-]{43}$/, "DCR did not issue a public client ID");
  assert.equal(metadata.client_secret, undefined, "DCR leaked a client secret");
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const parameters = new URLSearchParams({
    response_type: "code",
    client_id: clientID,
    redirect_uri: redirectURI,
    state,
    resource: issuer + "/mcp",
    scope,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256"
  });
  const pending = await request(base, "/oauth/authorize?" + parameters, { redirect: "manual" });
  assert.equal(pending.status, 303, "OAuth fixture authorization was not accepted");
  const location = pending.headers.get("location");
  assert.ok(location, "OAuth fixture authorization had no Web location");
  const ticket = new URL(location, base).searchParams.get("mcp_authorization");
  assert.ok(ticket, "OAuth fixture authorization had no pending request");
  await pending.body?.cancel();

  const approval = await request(base, "/oauth/decision", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + rootToken,
      Origin: issuer,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ request_id: ticket, decision: "approve" })
  });
  assert.equal(approval.status, 200, "OAuth fixture approval failed");
  const approved = await approval.json();
  const callback = new URL(approved.redirect_url);
  assert.equal(callback.searchParams.get("state"), state, "OAuth fixture state changed");
  const code = callback.searchParams.get("code");
  assert.ok(code, "OAuth fixture approval did not issue a code");
  const exchanged = await tokenRequest(base, issuer, clientID, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectURI,
    code_verifier: verifier
  });
  assert.equal(exchanged.status, 200, "OAuth fixture code exchange failed");
  const pair = await exchanged.json();
  assertTokenPair(pair);
  await listTools(base, pair.access_token);
  return { ...pair, client_id: clientID };
}

export async function verifyOAuthRestart({ base, rootToken, issuer, session }) {
  await listTools(base, session.access_token);
  const refreshed = await tokenRequest(base, issuer, session.client_id, {
    grant_type: "refresh_token",
    refresh_token: session.refresh_token
  });
  assert.equal(refreshed.status, 200, "OAuth fixture refresh did not survive restart");
  const pair = await refreshed.json();
  assertTokenPair(pair);
  assert.ok(pair.access_token !== session.access_token, "OAuth access token did not rotate");
  assert.ok(pair.refresh_token !== session.refresh_token, "OAuth refresh token did not rotate");
  await listTools(base, pair.access_token);

  // The consumed refresh still identifies its family for explicit revocation.
  const revoke = () =>
    request(base, "/oauth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: session.client_id,
        token: session.refresh_token,
        token_type_hint: "refresh_token"
      })
    });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const revoked = await revoke();
    assert.equal(revoked.status, 200, "OAuth fixture family revocation failed");
    await revoked.body?.cancel();
  }
  await listTools(base, session.access_token, 401);
  await listTools(base, pair.access_token, 401);
  const deniedRefresh = await tokenRequest(base, issuer, session.client_id, {
    grant_type: "refresh_token",
    refresh_token: pair.refresh_token
  });
  assert.equal(deniedRefresh.status, 400, "Revoked OAuth family still refreshed");
  assert.equal((await deniedRefresh.json()).error, "invalid_grant");
  await listTools(base, rootToken);
}
