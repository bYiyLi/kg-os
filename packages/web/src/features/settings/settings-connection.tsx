import { useTranslation } from "react-i18next";

import { Button } from "../../shared/ui/button.js";
import { Input } from "../../shared/ui/input.js";
import type { SettingsSnapshot } from "./settings-types.js";
import type { SettingsDraft } from "./use-settings-draft.js";
import { SettingsCopy, SettingsInfo, SettingsSection } from "./settings-ui.js";

export function SettingsConnection({
  snapshot,
  draft,
  busy,
  onDisconnect
}: {
  snapshot: SettingsSnapshot;
  draft: SettingsDraft;
  busy: boolean;
  onDisconnect?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const effectiveOrigin = snapshot.effective.server?.public_origin ?? "";
  const mcpAddress = effectiveOrigin === "" ? "" : effectiveOrigin + snapshot.runtime.mcpPath;
  return (
    <>
      <SettingsSection
        title={t("settings.accessTitle")}
        description={t("settings.accessDescription")}
      >
        <label className="settings-field">
          <span>{t("settings.origin")}</span>
          <Input
            value={draft.origin}
            type="url"
            disabled={busy}
            onChange={(event) => {
              draft.setOrigin(event.currentTarget.value);
            }}
          />
          <span className="settings-code">server.public_origin</span>
        </label>
        <p className="settings-hint">{t("settings.originHint")}</p>
        <p className="settings-hint">
          {t("settings.effectiveValue")}:{" "}
          <code>{effectiveOrigin || t("settings.notConfigured")}</code>
        </p>
      </SettingsSection>
      <SettingsSection title={t("settings.aiTitle")} description={t("settings.aiDescription")}>
        <SettingsInfo
          label={t("settings.mcpAddress")}
          action={mcpAddress !== "" && <SettingsCopy value={mcpAddress} />}
        >
          <code>{mcpAddress || t("settings.notConfigured")}</code>
        </SettingsInfo>
      </SettingsSection>
      <SettingsSection title={t("settings.loginTitle")}>
        <SettingsInfo label={t("settings.credential")}>
          <span>{t("settings.configured")}</span>
          <small>{t("settings.credentialHint")}</small>
        </SettingsInfo>
        <SettingsInfo
          label={t("settings.session")}
          action={
            onDisconnect !== undefined && (
              <Button variant="outline" type="button" disabled={busy} onClick={onDisconnect}>
                {t("settings.logout")}
              </Button>
            )
          }
        >
          {t("settings.loggedIn")}
        </SettingsInfo>
      </SettingsSection>
    </>
  );
}
