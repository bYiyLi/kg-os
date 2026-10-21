import { Info, Link2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Input } from "../../shared/ui/input.js";

// Accept a bare HTTPS origin. Only local loopback can use HTTP.
export function normalizePublicOrigin(value: string): string | null {
  if (value.includes("?") || value.includes("#")) return null;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      !url.host ||
      url.username !== "" ||
      url.password !== "" ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search !== "" ||
      url.hash !== ""
    )
      return null;
    if (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function SetupPublicOrigin({
  value,
  onChange,
  mcpPath
}: {
  value: string;
  onChange: (value: string) => void;
  mcpPath: string;
}) {
  const { t } = useTranslation();
  const origin = normalizePublicOrigin(value);
  const localOnly = origin?.startsWith("http:") ?? false;
  return (
    <div className="setup-fields setup-public-fields">
      <section
        className="setup-vector-card setup-public-card"
        aria-labelledby="setup-public-address-heading"
      >
        <header className="setup-vector-card-header">
          <h2 id="setup-public-address-heading">{t("setup.publicOrigin.connectionTitle")}</h2>
          <p>{t("setup.publicOrigin.connectionDescription")}</p>
        </header>
        <div className="setup-field">
          <label htmlFor="setup-public-origin">{t("setup.publicOrigin.label")}</label>
          <Input
            id="setup-public-origin"
            type="url"
            required
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="url"
            value={value}
            aria-invalid={value !== "" && origin === null}
            aria-describedby="setup-public-origin-hint"
            onChange={(event) => {
              onChange(event.currentTarget.value);
            }}
            onBlur={() => {
              if (origin !== null) onChange(origin);
            }}
          />
          <p id="setup-public-origin-hint">
            {origin === null ? t("setup.publicOrigin.invalid") : t("setup.publicOrigin.hint")}
          </p>
        </div>
        {origin !== null && (
          <div className="setup-public-preview">
            <div className="setup-public-preview-label">
              <Link2 aria-hidden="true" /> {t("setup.publicOrigin.mcpLabel")}
            </div>
            <code>{origin + mcpPath}</code>
          </div>
        )}
      </section>
      <div className="setup-public-guidance" role={localOnly ? "status" : undefined}>
        <Info aria-hidden="true" />
        <p>{t(localOnly ? "setup.publicOrigin.localWarning" : "setup.publicOrigin.help")}</p>
      </div>
    </div>
  );
}
