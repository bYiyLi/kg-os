import { useThemePreference } from "../../shared/lib/use-theme-preference.js";
import { Button } from "../../shared/ui/button.js";
import { ThemeToggle } from "../../shared/ui/theme-toggle.js";
import type { ThemePreference } from "../../shared/lib/use-theme-preference.js";
import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SetupVectorMessage } from "./setup-vector-message.js";

import { Icon } from "../../shared/ui/icon.js";
import { VectorFields } from "./setup-steps.js";
import { SetupAuthFields } from "./setup-auth.js";
import { SetupInitializeFields } from "./setup-initialize.js";
import { SetupPublicOrigin, normalizePublicOrigin } from "./setup-public-origin.js";
import { useSetupFlow } from "./use-setup-flow.js";
import type { SetupStatus } from "./setup-api.js";
import "./setup-wizard.css";

const stages = ["auth", "publicOrigin", "vector", "initialize"] as const;

function SetupArt() {
  return (
    <svg className="setup-art" viewBox="0 0 350 360" aria-hidden="true">
      <defs>
        <linearGradient id="setup-cube-a" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#c1aaff" stopOpacity=".9" />
          <stop offset="1" stopColor="#4743ea" stopOpacity=".7" />
        </linearGradient>
        <linearGradient id="setup-cube-b" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#7a62ff" stopOpacity=".8" />
          <stop offset="1" stopColor="#2937cb" stopOpacity=".4" />
        </linearGradient>
        <g id="setup-cube">
          <path d="M0 26 48 0l48 26-48 26Z" fill="url(#setup-cube-a)" />
          <path d="M0 26 48 52v59L0 85Z" fill="url(#setup-cube-b)" />
          <path d="M96 26 48 52v59l48-26Z" fill="#3851e2" fillOpacity=".58" />
          <path
            d="M0 26 48 0l48 26-48 26Zm0 0v59l48 26 48-26V26M48 52v59"
            fill="none"
            stroke="#a8b3ff"
            strokeOpacity=".7"
          />
        </g>
      </defs>
      <use href="#setup-cube" x="120" y="104" />
      <use href="#setup-cube" x="44" y="172" />
      <use href="#setup-cube" x="140" y="172" />
      <path d="m168 8 31 34-31 35-30-35Z" fill="url(#setup-cube-a)" stroke="#9a8dff" />
      <path d="m168 8v69m-30-35h61" stroke="#c0b5ff" strokeOpacity=".45" />
    </svg>
  );
}

interface HeaderProps {
  preference: ThemePreference;
  languageControl?: ReactNode;
  onSelectTheme: (value: ThemePreference) => void;
}

function SetupHeader({ preference, languageControl, onSelectTheme }: HeaderProps) {
  return (
    <header className="setup-header">
      <div className="setup-brand">
        <svg className="setup-brand-mark" viewBox="0 0 48 48" aria-hidden="true" fill="none">
          <path
            d="M24 3.5 44.5 24 24 44.5 3.5 24 24 3.5Z"
            stroke="currentColor"
            strokeWidth="4.4"
            strokeLinejoin="round"
          />
          <path d="m24 14-7 10 7 10 7-10-7-10Z" fill="currentColor" opacity=".95" />
          <circle cx="24" cy="24" r="2.7" fill="var(--color-page)" />
        </svg>
        KG OS
      </div>
      <div className="setup-header-tools">
        {languageControl}
        <ThemeToggle preference={preference} onSelect={onSelectTheme} />
      </div>
    </header>
  );
}

function stepClass(index: number, current: number) {
  if (index === current) return "is-current";
  if (index < current) return "is-complete";
  return "";
}

function SetupStepper({ step }: { step: number }) {
  const { t } = useTranslation();
  return (
    <nav className="setup-stepper" aria-label={t("setup.stepNavigation")}>
      <ol>
        {stages.map((stage, index) => (
          <li
            key={stage}
            className={stepClass(index, step)}
            aria-current={index === step ? "step" : undefined}
          >
            <span className="setup-step-dot" aria-hidden="true">
              {index + 1}
            </span>
            <span className="sr-only">{t("setup.stages." + stage)}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function SetupProgress({ step }: { step: number }) {
  const { t } = useTranslation();
  return (
    <div className="setup-page-progress" aria-live="polite" aria-atomic="true">
      <p className="setup-eyebrow">
        {t("setup.progress", { current: step + 1, total: stages.length })}
        <span aria-hidden="true"> · </span>
        {t("setup.setupLabel")}
      </p>
      <div className="setup-progress" aria-hidden="true">
        <span style={{ width: String(((step + 1) / stages.length) * 100) + "%" }} />
      </div>
    </div>
  );
}

function reviewCopy(state: SetupStatus["state"]) {
  if (state === "initializing")
    return {
      title: "setup.review.runningTitle",
      tagline: "setup.review.runningTagline",
      description: "setup.review.runningDescription"
    };
  if (state === "error")
    return {
      title: "setup.review.failedTitle",
      tagline: "setup.review.failedTagline",
      description: "setup.review.failedDescription"
    };
  return {
    title: "setup.review.title",
    tagline: "setup.review.tagline",
    description: "setup.review.description"
  };
}

function SetupHeading({
  stage,
  state
}: {
  stage: (typeof stages)[number];
  state: SetupStatus["state"];
}) {
  const { t } = useTranslation();
  const title = stage === "initialize" ? reviewCopy(state).title : "setup.stages." + stage;
  return <h1>{t(title)}</h1>;
}

function SetupStepDescription({
  flow,
  stage
}: {
  flow: ReturnType<typeof useSetupFlow>;
  stage: (typeof stages)[number];
}) {
  const { t } = useTranslation();
  if (flow.step === 1) {
    return (
      <>
        <p className="setup-vector-tagline">{t("setup.publicOrigin.tagline")}</p>
        <p className="setup-vector-intro">{t("setup.description.publicOrigin")}</p>
        <p className="setup-vector-intro">{t("setup.publicOrigin.context")}</p>
      </>
    );
  }
  if (flow.step === 2) {
    return (
      <>
        <p className="setup-vector-tagline">{t("setup.vector.tagline")}</p>
        <p className="setup-vector-intro">{t("setup.vector.intro")}</p>
        <p className="setup-vector-intro">{t("setup.vector.context")}</p>
      </>
    );
  }
  if (flow.step === 0) {
    return (
      <>
        <p className="setup-auth-tagline">{t("setup.authTagline")}</p>
        <p className="setup-auth-intro">{t("setup.description.auth")}</p>
        <p className="setup-auth-intro">{t("setup.authIntroductionSecond")}</p>
      </>
    );
  }
  if (flow.step === 3) {
    const copy = reviewCopy(flow.status.state);
    return (
      <>
        <p className="setup-vector-tagline">{t(copy.tagline)}</p>
        <p className="setup-vector-intro">{t(copy.description)}</p>
      </>
    );
  }
  return <p>{t("setup.description." + stage)}</p>;
}

interface SetupFormProps {
  flow: ReturnType<typeof useSetupFlow>;
}

function SetupFooter({
  flow,
  primaryAction
}: {
  flow: ReturnType<typeof useSetupFlow>;
  primaryAction: string;
}) {
  const { t } = useTranslation();
  const { step, draft, status, access } = flow;
  const disabled = flow.busy || status.state === "initializing";
  return (
    <footer className="setup-footer">
      <SetupProgress step={step} />
      <div className="setup-footer-actions">
        <Button
          variant="ghost"
          type="button"
          className="setup-button setup-button-secondary"
          disabled={step === 0 || disabled || (step === 1 && access === null)}
          onClick={flow.back}
        >
          <Icon name="chevronLeft" /> {t("setup.back")}
        </Button>
        <Button
          variant="ghost"
          type="submit"
          className="setup-button setup-button-primary"
          onClick={(event) => {
            // A second click in the same double-click gesture must not
            // submit the newly rendered action on the next Setup step.
            if (event.detail > 1) event.preventDefault();
          }}
          disabled={
            disabled ||
            (step === 0 && access === null && !flow.previewOnly) ||
            (step === 1 && normalizePublicOrigin(draft.publicOrigin) === null) ||
            (step === 3 && access === null)
          }
        >
          {t(primaryAction)}
          <Icon name={step === 2 && !flow.verified ? "refresh" : "arrowRight"} />
        </Button>
      </div>
    </footer>
  );
}

function SetupForm({ flow }: SetupFormProps) {
  const [showKey, setShowKey] = useState(false);
  const { step, draft, status, access, claimedToken, busy, error } = flow;
  const stage = stages[step] ?? stages[0];
  let primaryAction = "setup.next";
  if (step === 2 && !flow.verified)
    primaryAction = flow.verifying ? "setup.vector.testing" : "setup.vector.test";
  if (step === 3) primaryAction = "setup.initialize";

  return (
    <form noValidate onSubmit={flow.forward}>
      <SetupVectorMessage flow={flow} />
      <div key={stage} className="setup-form-content">
        <div className="setup-form-inner">
          <div
            className={
              step === 1 || step === 2 || step === 3
                ? "setup-title setup-title-vector"
                : "setup-title"
            }
          >
            <SetupHeading stage={stage} state={status.state} />
            <SetupStepDescription flow={flow} stage={stage} />
          </div>
          {step === 1 && (
            <SetupPublicOrigin
              value={draft.publicOrigin}
              onChange={(value) => {
                flow.update("publicOrigin", value);
              }}
              mcpPath={status.mcpPath ?? "/mcp"}
            />
          )}
          {step === 2 && (
            <VectorFields
              draft={draft}
              update={flow.update}
              showKey={showKey}
              onToggleKey={() => {
                setShowKey((previous) => !previous);
              }}
            />
          )}
          {step === 0 && (
            <SetupAuthFields
              status={status}
              access={access}
              claimedToken={claimedToken}
              busy={busy}
              onCreate={flow.create}
              onRotate={flow.rotate}
              onLogin={flow.login}
            />
          )}
          {step === 3 && (
            <SetupInitializeFields status={status} draft={draft} verified={flow.verified} />
          )}
          {step !== 2 && error !== "" && (
            <p role="alert" className="setup-error">
              {error}
            </p>
          )}
        </div>
      </div>
      <SetupFooter flow={flow} primaryAction={primaryAction} />
    </form>
  );
}

function SetupUnavailable({ status }: { status: SetupStatus }) {
  const { t } = useTranslation();
  return (
    <div className="setup-unavailable" role="alert">
      <h1>{t("setup.unavailableTitle")}</h1>
      <p>{status.message ?? t("setup.unavailableDescription")}</p>
      <p>{t("setup.unavailableHelp")}</p>
    </div>
  );
}

export function SetupWizard({
  languageControl,
  initialStatus,
  previewOnly = false,
  previewStep
}: {
  languageControl?: ReactNode;
  initialStatus: SetupStatus;
  previewOnly?: boolean;
  previewStep?: number;
}) {
  const { t } = useTranslation();
  const { theme, preference, selectTheme } = useThemePreference();
  const flow = useSetupFlow(initialStatus, previewOnly, previewStep);
  const unavailable = flow.status.state === "error" && !flow.status.credentialConfigured;
  return (
    <div className={"setup-page theme-" + theme} data-theme={theme}>
      <SetupArt />
      <SetupHeader
        preference={preference}
        languageControl={languageControl}
        onSelectTheme={selectTheme}
      />
      <main className="setup-flow" aria-label={t("setup.landmark")}>
        <SetupStepper step={unavailable ? -1 : flow.step} />
        <div className="setup-work">
          {unavailable ? <SetupUnavailable status={flow.status} /> : <SetupForm flow={flow} />}
        </div>
      </main>
    </div>
  );
}
