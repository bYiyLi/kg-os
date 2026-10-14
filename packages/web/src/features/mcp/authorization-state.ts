import { useEffect, useRef, useState } from "react";

import type { Connection } from "../../core/client/connect.js";

interface AuthorizationDetails {
  client_id: string;
  client_name: string;
  resource: string;
  scope: string;
  canWrite: boolean;
  expires_at: string;
}

function isAuthorizationDetails(value: unknown): value is AuthorizationDetails {
  if (value === null || typeof value !== "object") return false;
  const record = value as Partial<AuthorizationDetails>;
  return (
    record.client_name === "ChatGPT" &&
    record.client_id?.startsWith("https://chatgpt.com/oauth/") === true &&
    typeof record.resource === "string" &&
    record.scope === "kgos:access" &&
    record.canWrite === true &&
    typeof record.expires_at === "string"
  );
}

function trustedRedirect(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.host === "chatgpt.com" && url.username === "";
  } catch {
    return false;
  }
}

export function useConnectionAuthorization(connection: Connection, requestId: string | null) {
  const ref = useRef<HTMLDialogElement>(null);
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<"unavailable" | "failed" | null>(null);
  const [loading, setLoading] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const decisionPending = useRef(false);

  useEffect(() => {
    if (requestId === null) return;
    const dialog = ref.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open === true) dialog.close();
    };
  }, [requestId]);

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
      if (!trustedRedirect(destination)) throw new Error("Invalid OAuth redirect");
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
    ref.current?.close();
    setDismissed(true);
  }

  return { ref, details, error, loading, deciding, dismissed, decide, cancel };
}
