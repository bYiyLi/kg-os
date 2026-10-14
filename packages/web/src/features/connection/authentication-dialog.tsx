import { KGOSDaemonError, KGOSTransportError } from "@kgos/sdk";
import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject, SyntheticEvent } from "react";

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

function useMandatoryDialog(
  dialogRef: RefObject<HTMLDialogElement | null>,
  requestRef: RefObject<AbortController | null>
) {
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) {
      dialog.showModal();
      dialog.querySelector("input")?.focus();
    }
    return () => {
      requestRef.current?.abort();
      if (dialog?.open === true) dialog.close();
    };
  }, [dialogRef, requestRef]);
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<AuthenticationError | null>(null);

  useMandatoryDialog(dialogRef, requestRef);

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
    <dialog
      ref={dialogRef}
      className="authentication-dialog"
      aria-labelledby="authentication-title"
      aria-describedby="authentication-description"
      onCancel={(event) => {
        event.preventDefault();
      }}
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
    </dialog>
  );
}
