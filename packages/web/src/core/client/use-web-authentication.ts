import { useEffect, useRef, useState } from "react";

import { restoreCurrentInstanceSession } from "./connect.js";
import type { Connection, ConnectionLossReason } from "./connect.js";
import { useConnectionHeartbeat } from "./use-connection-heartbeat.js";
import { logoutWebSession } from "./web-session.js";

// Session lifetime, the browser's ephemeral access credential and connection
// invalidation belong to the Web client layer, not to individual UI features.
export function useWebAuthentication() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [logoutError, setLogoutError] = useState(false);
  const [lostReason, setLostReason] = useState<ConnectionLossReason | null>(null);
  const activeConnection = useRef<Connection | null>(null);
  const pendingLogout = useRef(false);

  function onLost(reason: ConnectionLossReason) {
    if (activeConnection.current === null) return;
    activeConnection.current.close();
    activeConnection.current = null;
    setLostReason(reason);
    setConnection(null);
  }

  function authenticated(next: Connection) {
    activeConnection.current?.close();
    activeConnection.current = next;
    setLostReason(null);
    setConnection(next);
  }

  async function disconnect() {
    if (pendingLogout.current) return;
    pendingLogout.current = true;
    setLogoutError(false);
    try {
      await logoutWebSession();
      activeConnection.current?.close();
      activeConnection.current = null;
      setLostReason(null);
      setConnection(null);
    } catch {
      // A failed HTTP call does not revoke a persistent cookie on the daemon.
      setLogoutError(true);
    } finally {
      pendingLogout.current = false;
    }
  }

  useConnectionHeartbeat(connection);
  useEffect(() => {
    const controller = new AbortController();
    void restoreCurrentInstanceSession(controller.signal, onLost).then(
      (next) => {
        if (controller.signal.aborted) {
          next.close();
          return;
        }
        authenticated(next);
        setRestoring(false);
      },
      () => {
        if (!controller.signal.aborted) setRestoring(false);
      }
    );
    return () => {
      controller.abort();
    };
  }, []);

  return { connection, restoring, logoutError, lostReason, onLost, authenticated, disconnect };
}
