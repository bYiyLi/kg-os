import { useTranslation } from "react-i18next";
import { Plus, Puzzle, Trash2 } from "lucide-react";

import { Button } from "../../shared/ui/button.js";
import { Input } from "../../shared/ui/input.js";
import type { SettingsExtension, SettingsSnapshot } from "./settings-types.js";
import type { SettingsDraft } from "./use-settings-draft.js";
import { SettingsInfo, SettingsNotice, SettingsSection } from "./settings-ui.js";

function ExtensionFields({
  extension,
  index,
  draft,
  busy
}: {
  extension: SettingsExtension;
  index: number;
  draft: SettingsDraft;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const fields = [
    { key: "source", label: "extensionSource" },
    { key: "entrypoint", label: "entrypoint" },
    { key: "library", label: "library" },
    { key: "sha256", label: "sha256" }
  ] as const;
  function update(key: keyof SettingsExtension, value: string) {
    draft.setExtensions((items) =>
      items.map((item, offset) => (offset === index ? { ...item, [key]: value } : item))
    );
  }
  return (
    <div className="settings-extension">
      <div className="settings-extension-fields">
        {fields.map(({ key, label }) => (
          <label key={key} className="settings-field">
            <span>{t("settings." + label)}</span>
            <Input
              value={extension[key] ?? ""}
              disabled={busy}
              spellCheck={false}
              onChange={(event) => {
                update(key, event.currentTarget.value);
              }}
            />
          </label>
        ))}
      </div>
      <Button
        variant="ghost"
        type="button"
        disabled={busy}
        aria-label={t("settings.removeExtension", { number: index + 1 })}
        onClick={() => {
          draft.setExtensions((items) => items.filter((_, offset) => offset !== index));
        }}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  );
}

export function SettingsStorage({
  snapshot,
  draft,
  busy
}: {
  snapshot: SettingsSnapshot;
  draft: SettingsDraft;
  busy: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <SettingsSection title={t("settings.dataTitle")} description={t("settings.dataDescription")}>
        <SettingsInfo
          label={t("settings.databasePath")}
          action={<span className="settings-badge">{t("settings.readonly")}</span>}
        >
          <code>{snapshot.databasePath}</code>
        </SettingsInfo>
      </SettingsSection>
      <SettingsSection
        title={t("settings.cacheTitle")}
        description={t("settings.cacheDescription")}
      >
        <label className="settings-field">
          <span>{t("settings.cacheBudget")} (MiB)</span>
          <Input
            type="number"
            min="1"
            step="1"
            value={draft.budget}
            disabled={busy}
            onChange={(event) => {
              draft.setBudget(event.currentTarget.value);
            }}
          />
          <span className="settings-code">cache.max_size_mb</span>
        </label>
        <p className="settings-hint">{t("settings.budgetHint")}</p>
        <label className="settings-field">
          <span>{t("settings.cachePath")}</span>
          <Input
            value={draft.path}
            disabled={busy}
            onChange={(event) => {
              draft.setPath(event.currentTarget.value);
            }}
          />
          <span className="settings-code">cache.path</span>
        </label>
        <SettingsNotice>{t("settings.cacheHint")}</SettingsNotice>
      </SettingsSection>
      <SettingsSection
        title={t("settings.extensions")}
        description={t("settings.extensionsDescription")}
        action={
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              draft.setExtensions((items) => [...items, { source: "", entrypoint: "" }]);
            }}
          >
            <Plus aria-hidden="true" />
            {t("settings.addExtension")}
          </Button>
        }
      >
        {draft.extensions.length === 0 && (
          <div className="settings-empty">
            <Puzzle aria-hidden="true" />
            {t("settings.noExtensions")}
          </div>
        )}
        {draft.extensions.map((extension, index) => (
          <ExtensionFields
            key={index}
            extension={extension}
            index={index}
            draft={draft}
            busy={busy}
          />
        ))}
        <p className="settings-hint">{t("settings.officialHint")}</p>
        <p className="settings-hint">{t("settings.extensionHint")}</p>
      </SettingsSection>
    </>
  );
}
