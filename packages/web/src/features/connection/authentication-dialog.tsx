import { Dialog, DialogContent } from "../../shared/ui/dialog.js";
import { KGOSDaemonError, KGOSTransportError } from "@kgos/sdk";
import { useEffect, useRef, useState } from "react";
import type { ReactNode, SyntheticEvent } from "react";

import { connectToCurrentInstance } from "../../core/client/connect.js";
import type { Connection } from "../../core/client/connect.js";
import type { ConnectionLossReason } from "../../core/client/connect.js";
import {
  AuthenticationForm,
  AuthenticationHelp,
  AuthenticationIntroduction
} from "./authentication-content.js";
import type { AuthenticationError } from "./authentication-content.js";

function errorMessage(error: unknown): AuthenticationError {
  if (error instanceof KGOSDaemonError && error.status === 401) {
    return "invalid";
  }
  if (error instanceof KGOSTransportError) {
    return "transport";
  }
  return "unknown";
}

export function AuthenticationDialog({
  onAuthenticated,
  onConnectionLost,
  reason,
  languageControl
}: {
  onAuthenticated: (connection: Connection) => void;
  onConnectionLost?: (reason: ConnectionLossReason) => void;
  reason?: ConnectionLossReason | null;
  languageControl?: ReactNode;
}) {
  const requestRef = useRef<AbortController | null>(null);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<AuthenticationError | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    // A synchronous ref blocks double-submit before React renders disabled UI.
    if (requestRef.current !== null) return;
    const value = token.trim();
    if (value.length === 0) {
      setError("required");
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setConnecting(true);
    setError(null);
    try {
      const connection = await connectToCurrentInstance(value, controller.signal, (loss) => {
        onConnectionLost?.(loss);
      });
      if (!controller.signal.aborted) {
        onAuthenticated(connection);
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        if (failure instanceof KGOSDaemonError && failure.status === 401) {
          setToken("");
        }
        setError(errorMessage(failure));
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        if (!controller.signal.aborted) {
          setConnecting(false);
        }
      }
    }
  }

  return (
    <Dialog
      open
      disablePointerDismissal
      onOpenChange={(_, details) => {
        details.cancel();
      }}
    >
      <DialogContent
        overlayClassName="authentication-backdrop"
        initialFocus={() => document.getElementById("kgos-access-token")}
        className="authentication-dialog"
        aria-labelledby="authentication-title"
        aria-describedby="authentication-description"
      >
        <AuthenticationIntroduction reason={reason} languageControl={languageControl} />
        <AuthenticationForm
          token={token}
          showToken={showToken}
          connecting={connecting}
          error={error}
          onSubmit={(event) => {
            void submit(event);
          }}
          onTokenChange={(value) => {
            setToken(value);
            setError(null);
          }}
          onToggleVisibility={() => {
            setShowToken((shown) => !shown);
          }}
        />
        <AuthenticationHelp />
      </DialogContent>
    </Dialog>
  );
}
