import { useEffect, useRef, useState } from "react";

import { testEmbeddingProvider } from "./setup-api.js";
import type { EmbeddingTestResult } from "./setup-api.js";
import type { SetupAccess } from "./setup-api.js";
import { isValidVectorDraft } from "./setup-steps.js";
import type { Draft } from "./setup-steps.js";

export type VerificationFailure =
  { kind: "invalid" | "preview" | "network" } | { kind: "probe"; result: EmbeddingTestResult };

export function useEmbeddingVerification(
  draft: Draft,
  previewOnly: boolean,
  access: SetupAccess | null
) {
  const [verificationError, setVerificationError] = useState<VerificationFailure | null>(null);
  const [checkedDraft, setCheckedDraft] = useState<Draft | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [verifiedDimensions, setVerifiedDimensions] = useState<number | null>(null);
  const active = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      active.current?.abort();
    },
    []
  );

  function invalidate() {
    active.current?.abort();
    active.current = null;
    setCheckedDraft(null);
    setVerifiedDimensions(null);
    setVerifying(false);
    setFailed(false);
    setVerificationError(null);
  }

  function verify() {
    if (!isValidVectorDraft(draft)) {
      setVerificationError({ kind: "invalid" });
      return;
    }
    if (previewOnly) {
      setVerificationError({ kind: "preview" });
      return;
    }
    if (access === null) {
      setVerificationError({ kind: "network" });
      return;
    }
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setVerifying(true);
    setFailed(false);
    setVerificationError(null);
    void testEmbeddingProvider(draft, controller.signal, access).then(
      (result) => {
        if (active.current !== controller) return;
        if (result.ok && result.dimensions === Number(draft.dimensions)) {
          setCheckedDraft(draft);
          setVerifiedDimensions(result.dimensions);
        } else {
          setFailed(true);
          setVerificationError({ kind: "probe", result });
        }
        setVerifying(false);
      },
      () => {
        if (active.current !== controller || controller.signal.aborted) return;
        setFailed(true);
        setVerificationError({ kind: "network" });
        setVerifying(false);
      }
    );
  }

  return {
    verificationError,
    verified:
      checkedDraft !== null &&
      checkedDraft.url === draft.url &&
      checkedDraft.key === draft.key &&
      checkedDraft.model === draft.model &&
      checkedDraft.dimensions === draft.dimensions &&
      checkedDraft.similarity === draft.similarity,
    verifying,
    failed,
    verifiedDimensions,
    invalidate,
    verify
  };
}
