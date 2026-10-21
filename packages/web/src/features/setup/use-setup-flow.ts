import { useState } from "react";
import type { SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";

import type { SetupStatus } from "./setup-api.js";
import { initialDraft } from "./setup-steps.js";
import { normalizePublicOrigin } from "./setup-public-origin.js";
import type { Draft } from "./setup-steps.js";
import { useEmbeddingVerification } from "./use-embedding-verification.js";
import { useSetupSession } from "./use-setup-session.js";

function firstStep(state: SetupStatus["state"]) {
  if (state === "initializing") return 4;
  if (state === "error") return 3;
  return 0;
}

export function useSetupFlow(
  initialStatus: SetupStatus,
  previewOnly: boolean,
  previewStep?: number
) {
  const { t } = useTranslation();
  const session = useSetupSession(initialStatus, previewOnly);
  const [step, setStep] = useState(
    previewOnly && previewStep === 4 ? 4 : firstStep(initialStatus.state)
  );
  const [draft, setDraft] = useState(() => ({
    ...initialDraft,
    publicOrigin: window.location.origin
  }));
  const verification = useEmbeddingVerification(draft, previewOnly);
  const busy = session.busy || verification.verifying;

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    if (key !== "publicOrigin") verification.invalidate();
    setDraft((previous) => ({ ...previous, [key]: value }));
    session.setError("");
  }

  function back() {
    if (busy || session.status.state === "initializing") return;
    session.setError("");
    setStep((current) => Math.max(0, current - 1));
  }

  function forward(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || session.status.state === "initializing") return;
    if (step === 1) {
      const origin = normalizePublicOrigin(draft.publicOrigin);
      if (origin === null) return;
      if (origin !== draft.publicOrigin)
        setDraft((previous) => ({ ...previous, publicOrigin: origin }));
    }
    if (step === 2 && !verification.verified) {
      verification.verify();
      return;
    }
    if (step === 3 && session.access === null) {
      session.setError(t("setup.authRequired"));
      return;
    }
    if (step < 4) {
      if (step === 3) session.setClaimedToken(null);
      setStep(step + 1);
      return;
    }
    session.initialize(draft);
  }

  return { ...session, ...verification, busy, step, draft, update, back, forward };
}
