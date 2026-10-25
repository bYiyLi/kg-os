import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  SetupAuthenticationRequired,
  loginSetup,
  readSetupStatus,
  restoreSetup,
  rotateSetupToken,
  submitSetup
} from "./setup-api.js";
import type { SetupAccess, SetupConfig, SetupStatus } from "./setup-api.js";
import type { Draft } from "./setup-steps.js";

function useSetupStatusPoll(
  status: SetupStatus,
  previewOnly: boolean,
  setStatus: (value: SetupStatus) => void,
  access: SetupAccess | null
) {
  useEffect(() => {
    if (previewOnly || status.state === "ready" || (status.credentialConfigured && access === null))
      return;
    const controller = new AbortController();
    const handle = setInterval(() => {
      void readSetupStatus(controller.signal, access ?? undefined).then(
        (next) => {
          if (controller.signal.aborted) return;
          setStatus(next);
          if (next.state === "ready") window.location.replace("/");
        },
        (error: unknown) => {
          // A second browser may have claimed the Token after this page loaded.
          if (
            !controller.signal.aborted &&
            access === null &&
            error instanceof SetupAuthenticationRequired
          ) {
            setStatus({ ...status, credentialConfigured: true });
          }
        }
      );
    }, 1200);
    return () => {
      controller.abort();
      clearInterval(handle);
    };
  }, [status.state, status.credentialConfigured, previewOnly, access]);
}

function useRestoreSetupSession(
  initialStatus: SetupStatus,
  previewOnly: boolean,
  setAccess: (value: SetupAccess | null) => void,
  setStatus: (value: SetupStatus) => void
) {
  useEffect(() => {
    if (previewOnly || !initialStatus.credentialConfigured) return;
    void restoreSetup().then(
      (next) => {
        setAccess(next);
        void readSetupStatus(undefined, next).then(
          (current) => {
            setStatus(current);
            if (current.state === "ready") window.location.replace("/");
          },
          () => undefined
        );
      },
      () => undefined
    );
  }, [initialStatus.credentialConfigured, previewOnly]);
}

function setupConfigFromDraft(draft: Draft): SetupConfig {
  return {
    server: { public_origin: draft.publicOrigin },
    embedding: {
      base_url: draft.url,
      model: draft.model,
      dimensions: Number(draft.dimensions),
      similarity: draft.similarity
    },
    cache: { path: "cache/openai-compatible.db", max_size_mb: 4096 },
    fulltext: { analyzer: "jieba" },
    sqlite: { extensions: [] }
  };
}

async function regenerateAuthenticatedToken(
  setAccess: (value: SetupAccess | null) => void,
  setClaimedToken: (value: string | null) => void,
  access: SetupAccess
) {
  let token: string;
  try {
    token = await rotateSetupToken(access);
  } catch (cause) {
    // A lost rotation response may mean the old Token was replaced already.
    setAccess(null);
    setClaimedToken(null);
    throw cause;
  }
  // Preserve the newly created Token even if the automatic Web login fails:
  // the user must still be able to copy it and retry without losing the secret.
  setAccess(null);
  setClaimedToken(token);
  setAccess(await loginSetup(token));
}

async function claimInitialToken(
  setStatus: (update: (status: SetupStatus) => SetupStatus) => void,
  setClaimedToken: (token: string) => void,
  setAccess: (access: SetupAccess) => void
) {
  let token: string;
  try {
    token = await rotateSetupToken();
  } catch (cause) {
    if (cause instanceof SetupAuthenticationRequired) {
      setStatus((previous) => ({ ...previous, credentialConfigured: true }));
    }
    throw cause;
  }
  setClaimedToken(token);
  setStatus((previous) => ({ ...previous, credentialConfigured: true }));
  setAccess(await loginSetup(token));
}

export function useSetupSession(initialStatus: SetupStatus, previewOnly: boolean) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(initialStatus);
  const [access, setAccess] = useState<SetupAccess | null>(null);
  const [claimedToken, setClaimedToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useRestoreSetupSession(initialStatus, previewOnly, setAccess, setStatus);
  useSetupStatusPoll(status, previewOnly, setStatus, access);

  async function perform(job: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await job();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("setup.actionFailed"));
    } finally {
      setBusy(false);
    }
  }

  function create() {
    if (previewOnly) {
      setError(t("setup.previewAction"));
      return;
    }
    void perform(() => claimInitialToken(setStatus, setClaimedToken, setAccess));
  }

  function login(token: string) {
    if (previewOnly) {
      setError(t("setup.previewAction"));
      return;
    }
    void perform(async () => {
      const next = await loginSetup(token);
      setAccess(next);
      const current = await readSetupStatus(undefined, next);
      setStatus(current);
      if (current.state === "ready") window.location.replace("/");
    });
  }

  function rotate() {
    if (previewOnly || status.state !== "setup_required") {
      setError(t(previewOnly ? "setup.previewAction" : "setup.authRequired"));
      return;
    }
    if (access === null) {
      setError(t("setup.authRequired"));
      return;
    }
    void perform(() => regenerateAuthenticatedToken(setAccess, setClaimedToken, access));
  }

  function initialize(draft: Draft) {
    if (previewOnly) {
      setError(t("setup.previewAction"));
      return;
    }
    if (access === null) {
      setError(t("setup.authRequired"));
      return;
    }
    void perform(async () => {
      const resuming = status.state === "error";
      const secret = draft.key.trim() === "" ? null : draft.key;
      await submitSetup(
        access,
        resuming ? undefined : setupConfigFromDraft(draft),
        resuming ? undefined : secret
      );
      setStatus((previous) => ({ ...previous, state: "initializing", phase: "configuration" }));
    });
  }

  return {
    status,
    access,
    claimedToken,
    error,
    busy,
    setError,
    setClaimedToken,
    create,
    rotate,
    login,
    initialize
  };
}
