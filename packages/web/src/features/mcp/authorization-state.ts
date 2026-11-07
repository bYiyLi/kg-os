import { useEffect, useRef, useState } from "react";

import type { Connection } from "../../core/client/connect.js";

interface AuthorizationDetails {
  client_id: string;
  client_name: string;
  client_kind: "cimd" | "dcr";
  redirect_host: string;
  redirect_origin: string;
  redirect_path: string;
  loopback: boolean;
  resource: string;
  scope: string;
  canWrite: boolean;
  expires_at: string;
}

function isAuthorizationDetails(value: unknown): value is AuthorizationDetails {
  if (value === null || typeof value !== "object") return false;
  const record = value as Partial<AuthorizationDetails>;
  let validClient = false;
  if (record.client_kind === "dcr") {
    validClient = /^kg_mcp_[A-Za-z0-9_-]{43}$/.test(record.client_id ?? "");
  } else if (record.client_kind === "cimd" && typeof record.client_id === "string") {
    try {
      const identity = new URL(record.client_id);
      validClient =
        identity.protocol === "https:" &&
        identity.pathname !== "/" &&
        identity.username === "" &&
        identity.password === "" &&
        identity.search === "" &&
        identity.hash === "" &&
        identity.toString() === record.client_id;
    } catch {
      validClient = false;
    }
  }
  let callback: URL;
  let declaredHost: URL;
  try {
    callback = new URL(record.redirect_origin ?? "");
    declaredHost = new URL(callback.protocol + "//" + (record.redirect_host ?? ""));
  } catch {
    return false;
  }
  const host = callback.hostname.toLowerCase();
  const loopbackHost =
    host === "localhost" || host === "[::1]" || /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(host);
  const validCallbackOrigin =
    callback.username === "" &&
    callback.password === "" &&
    callback.pathname === "/" &&
    callback.search === "" &&
    callback.hash === "" &&
    declaredHost.username === "" &&
    declaredHost.password === "" &&
    declaredHost.pathname === "/" &&
    declaredHost.search === "" &&
    declaredHost.hash === "" &&
    declaredHost.host === callback.host &&
    (callback.protocol === "https:" || (callback.protocol === "http:" && loopbackHost));
  return (
    typeof record.client_name === "string" &&
    record.client_name.trim().length > 0 &&
    record.client_name.length <= 512 &&
    typeof record.client_id === "string" &&
    record.client_id.length > 0 &&
    record.client_id.length <= 2048 &&
    validClient &&
    (record.client_kind === "cimd" || record.client_kind === "dcr") &&
    typeof record.redirect_host === "string" &&
    record.redirect_host.length > 0 &&
    typeof record.redirect_path === "string" &&
    record.redirect_path.startsWith("/") &&
    typeof record.loopback === "boolean" &&
    record.loopback === (callback.protocol === "http:") &&
    validCallbackOrigin &&
    typeof record.resource === "string" &&
    (record.scope === "mcp" || record.scope === "mcp offline_access") &&
    record.canWrite === true &&
    typeof record.expires_at === "string"
  );
}

function trustedRedirect(value: unknown, details: AuthorizationDetails): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    const expected = new URL(details.redirect_origin);
    return (
      url.protocol === expected.protocol &&
      url.origin === expected.origin &&
      url.host === expected.host &&
      url.pathname === details.redirect_path &&
      url.username === "" &&
      url.password === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

export function useConnectionAuthorization(connection: Connection, requestId: string | null) {
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<"unavailable" | "failed" | null>(null);
  const [loading, setLoading] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const decisionPending = useRef(false);

  useEffect(() => {
    if (requestId === null) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const response = await connection.oauthFetch(
          "/oauth/request?request_id=" + encodeURIComponent(requestId),
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error("Authorization unavailable");
        const result: unknown = await response.json();
        if (!isAuthorizationDetails(result)) {
          throw new Error("Invalid authorization request");
        }
        const expiresAt = Date.parse(result.expires_at);
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
          throw new Error("Expired authorization request");
        }
        if (!controller.signal.aborted) setDetails(result);
      } catch {
        if (!controller.signal.aborted) {
          setError("unavailable");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [connection, requestId]);

  async function decide(decision: "approve" | "deny") {
    if (decisionPending.current || requestId === null || details === null) return;
    decisionPending.current = true;
    setDeciding(true);
    setError(null);
    try {
      const response = await connection.oauthFetch("/oauth/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, decision })
      });
      if (!response.ok) throw new Error("Authorization failed");
      const result: unknown = await response.json();
      const destination =
        result !== null && typeof result === "object" && "redirect_url" in result
          ? result.redirect_url
          : undefined;
      if (!trustedRedirect(destination, details)) throw new Error("Invalid OAuth redirect");
      window.location.assign(destination);
    } catch {
      decisionPending.current = false;
      setError("failed");
      setDeciding(false);
    }
  }

  function cancel() {
    if (decisionPending.current) return;
    if (details !== null && error !== "failed") {
      void decide("deny");
      return;
    }
    // An expired or failed decision has no usable verified OAuth callback.
    // Let the user leave without repeatedly attempting the failed decision.
    const url = new URL(window.location.href);
    url.searchParams.delete("mcp_authorization");
    window.history.replaceState(window.history.state, "", url);
    setDismissed(true);
  }

  return { details, error, loading, deciding, dismissed, decide, cancel };
}
