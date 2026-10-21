import { useTranslation } from "react-i18next";

import { Icon } from "../../shared/ui/icon.js";

const capabilities = [
  { key: "structure", icon: "graph" },
  { key: "discovery", icon: "search" },
  { key: "evolution", icon: "branch" },
  { key: "ai", icon: "pointer" }
] as const;

const nextSteps = [
  { number: "02", stage: "publicOrigin" },
  { number: "03", stage: "vector" },
  { number: "04", stage: "auth" },
  { number: "05", stage: "initialize" }
] as const;

export function SetupWelcome() {
  const { t } = useTranslation();

  return (
    <section className="setup-welcome" aria-labelledby="setup-welcome-heading">
      <h1 id="setup-welcome-heading">{t("setup.stages.welcome")}</h1>
      <p className="setup-welcome-tagline">{t("setup.welcome.tagline")}</p>
      <p className="setup-welcome-lead">{t("setup.welcome.intro")}</p>
      <p className="setup-welcome-lead">{t("setup.welcome.evolution")}</p>

      <section className="setup-welcome-features" aria-labelledby="setup-welcome-features-title">
        <h2 id="setup-welcome-features-title">{t("setup.welcome.featuresTitle")}</h2>
        <ul className="setup-welcome-cards">
          {capabilities.map(({ key, icon }) => (
            <li key={key} className="setup-welcome-card">
              <span className="setup-welcome-card-icon">
                <Icon name={icon} />
              </span>
              <div>
                <h3>{t("setup.welcome.features." + key + ".title")}</h3>
                <p>{t("setup.welcome.features." + key + ".description")}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="setup-welcome-next" aria-labelledby="setup-welcome-next-title">
        <h2 id="setup-welcome-next-title">{t("setup.welcome.nextTitle")}</h2>
        <ol>
          {nextSteps.map(({ number, stage }) => (
            <li key={stage}>
              <span className="setup-welcome-step-number" aria-hidden="true">
                {number}
              </span>
              <span>{t("setup.stages." + stage)}</span>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
