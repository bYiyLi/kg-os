import { useEffect } from "react";

import type { Connection } from "./connect.js";

// Only poll the visible tab. Every request carries the pinned daemon boot and
// is never automatically retried against a restarted or relocated process.
export function useConnectionHeartbeat(connection: Connection | null) {
  useEffect(() => {
    if (connection === null) return;
    let checking = false;
    async function checkConnection() {
      if (document.hidden || checking) return;
      checking = true;
      try {
        await connection?.check();
      } catch {
        // The guarded SDK adapter handles invalidated/offline connections.
      } finally {
        checking = false;
      }
    }
    function onVisible() {
      void checkConnection();
    }
    const timer = window.setInterval(onVisible, 15_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [connection]);
}
