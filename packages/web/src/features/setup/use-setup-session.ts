import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  claimSetupToken,
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
  setStatus: (value: SetupStatus) => void
) {
  useEffect(() => {
    if (previewOnly || status.state === "ready") return;
    const controller = new AbortController();
    const handle = setInterval(() => {
      void readSetupStatus(controller.signal).then(
        (next) => {
          if (controller.signal.aborted) return;
          setStatus(next);
          if (next.state === "ready") window.location.replace("/");
        },
        () => undefined
      );
    }, 1200);
    return () => {
      controller.abort();
      clearInterval(handle);
    };
  }, [status.state, previewOnly]);
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
  setClaimedToken: (value: string | null) => void
) {
  let token: string;
  try {
    token = await rotateSetupToken();
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

export function useSetupSession(initialStatus: SetupStatus, previewOnly: boolean) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(initialStatus);
  const [access, setAccess] = useState<SetupAccess | null>(null);
  const [claimedToken, setClaimedToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (previewOnly || !initialStatus.credentialConfigured) return;
    void restoreSetup().then(
      (next) => {
        setAccess(next);
      },
      () => undefined
    );
  }, [initialStatus.credentialConfigured, previewOnly]);

  useSetupStatusPoll(status, previewOnly, setStatus);

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

  function claim() {
    if (previewOnly) {
      setError(t("setup.previewAction"));
      return;
    }
    void perform(async () => {
      const token = await claimSetupToken();
      setClaimedToken(token);
      setStatus((previous) => ({ ...previous, credentialConfigured: true }));
      setAccess(await loginSetup(token));
    });
  }

  function login(token: string) {
    if (previewOnly) {
      setError(t("setup.previewAction"));
      return;
    }
    void perform(async () => {
      setAccess(await loginSetup(token));
    });
  }

  function rotate() {
    if (previewOnly || status.state !== "setup_required") {
      setError(t(previewOnly ? "setup.previewAction" : "setup.authRequired"));
      return;
    }
    void perform(() => regenerateAuthenticatedToken(setAccess, setClaimedToken));
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
    claim,
    rotate,
    login,
    initialize
  };
}
