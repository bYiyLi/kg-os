import { useEffect, useId } from "react";
import { useTranslation } from "react-i18next";

import { useToastManager } from "../../shared/ui/toast.js";
import type { VerificationFailure } from "./use-embedding-verification.js";
import type { useSetupFlow } from "./use-setup-flow.js";

const reasons = [
  "invalid_fields",
  "timeout",
  "connection_failed",
  "redirect_not_allowed",
  "authentication_failed",
  "endpoint_or_model_not_found",
  "rate_limited",
  "provider_error",
  "provider_unavailable",
  "invalid_response",
  "dimensions_mismatch",
  "busy",
  "setup_unavailable"
] as const;

// React content stays subscribed to i18next without restarting the toast's timer or request.
function VerificationTitle({ type, dimensions }: { type: string; dimensions: number | null }) {
  const { t } = useTranslation();
  if (type === "loading") return t("setup.vector.validationStates.testing");
  if (type === "success") return t("setup.vector.validationStates.success", { dimensions });
  return t("setup.vector.validationStates.failed");
}

function VerificationDescription({ failure }: { failure: VerificationFailure }) {
  const { t } = useTranslation();
  switch (failure.kind) {
    case "invalid":
      return t("setup.vectorInvalid");
    case "preview":
      return t("setup.previewAction");
    case "network":
      return t("setup.vector.testNetworkError");
    case "probe": {
      const reason = reasons.find((known) => known === failure.result.reason) ?? "unknown";
      return t("setup.vector.testErrors." + reason, {
        status: failure.result.httpStatus ?? 0,
        dimensions: failure.result.dimensions ?? 0
      });
    }
  }
}

export function SetupVectorMessage({ flow }: { flow: ReturnType<typeof useSetupFlow> }) {
  const { step, verifying, verified, verifiedDimensions, verificationError } = flow;
  const { add, close } = useToastManager<Record<string, never>>();
  const id = useId();
  useEffect(() => {
    if (step !== 2 || (!verifying && !verified && verificationError === null)) {
      close(id);
      return;
    }
    let type = "error";
    if (verifying) type = "loading";
    else if (verified) type = "success";
    add({
      id,
      type,
      title: <VerificationTitle type={type} dimensions={verifiedDimensions} />,
      description:
        verificationError === null ? undefined : (
          <VerificationDescription failure={verificationError} />
        ),
      timeout: type === "success" ? 3500 : 0,
      priority: type === "error" ? "high" : "low"
    });
  }, [step, verifying, verified, verifiedDimensions, verificationError, id, add, close]);
  useEffect(
    () => () => {
      close(id);
    },
    [id, close]
  );
  return null;
}
