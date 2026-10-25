import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Activity, Boxes, Cable, Database, Info, Monitor, Settings2, X } from "lucide-react";

import type { Connection } from "../../core/client/connect.js";
import type { ThemePreference } from "../../shared/lib/use-theme-preference.js";
import { Button } from "../../shared/ui/button.js";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../shared/ui/dialog.js";
import { SettingsConnection } from "./settings-connection.js";
import { SettingsDisplay } from "./settings-display.js";
import { SettingsRetrieval } from "./settings-retrieval.js";
import { SettingsRuntime } from "./settings-runtime.js";
import { SettingsStorage } from "./settings-storage.js";
import { SettingsNotice } from "./settings-ui.js";
import { useSettingsData } from "./use-settings-data.js";
import { useSettingsDraft } from "./use-settings-draft.js";
import type { SettingsCategory } from "./settings-types.js";
import "./settings.css";

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: Connection | null;
  preference: ThemePreference;
  onSelectTheme: (value: ThemePreference) => void;
  languageControl: ReactNode;
  onDisconnect?: (() => void) | undefined;
}

const categories = [
  { key: "display", Icon: Monitor },
  { key: "connection", Icon: Cable },
  { key: "retrieval", Icon: Boxes },
  { key: "storage", Icon: Database },
  { key: "runtime", Icon: Activity }
] as const;
type PendingAction = SettingsCategory | "close" | "logout";
type SettingsData = ReturnType<typeof useSettingsData>;
type Draft = ReturnType<typeof useSettingsDraft>;

function SettingsNavigation({
  category,
  onSelect,
  disabled
}: {
  category: SettingsCategory;
  onSelect: (value: SettingsCategory) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <nav className="settings-nav" aria-label={t("settings.navigation")}>
      {categories.map(({ key, Icon }) => (
        <Button
          variant="ghost"
          type="button"
          key={key}
          className="settings-nav-item"
          data-settings-category={key}
          aria-current={category === key ? "page" : undefined}
          disabled={disabled}
          onClick={() => {
            onSelect(key);
          }}
        >
          <Icon aria-hidden="true" />
          {t("settings." + key)}
        </Button>
      ))}
      <span className="settings-brand" aria-hidden="true">
        KG OS
      </span>
    </nav>
  );
}

function SettingsBody({
  category,
  props,
  data,
  draft,
  onLogout
}: {
  category: SettingsCategory;
  props: SettingsDialogProps;
  data: SettingsData;
  draft: Draft;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  if (category === "display")
    return (
      <SettingsDisplay
        preference={props.preference}
        onSelectTheme={props.onSelectTheme}
        languageControl={props.languageControl}
      />
    );
  if (props.connection === null)
    return <SettingsNotice>{t("settings.unavailable")}</SettingsNotice>;
  if (data.loading)
    return (
      <p className="settings-loading" role="status">
        {t("settings.loading")}
      </p>
    );
  if (data.snapshot === null)
    return (
      <Button type="button" variant="outline" onClick={data.reload}>
        {t("settings.retry")}
      </Button>
    );
  const snapshot = data.snapshot;
  const fetcher = props.connection.settingsFetch;
  switch (category) {
    case "connection":
      return (
        <SettingsConnection
          snapshot={snapshot}
          draft={draft}
          busy={data.busy}
          onDisconnect={onLogout}
        />
      );
    case "storage":
      return <SettingsStorage snapshot={snapshot} draft={draft} busy={data.busy} />;
    case "runtime":
      return <SettingsRuntime snapshot={snapshot} fetcher={fetcher} />;
    case "retrieval":
      return (
        <SettingsRetrieval
          snapshot={snapshot}
          draft={draft}
          fetcher={fetcher}
          busy={data.busy}
          blocked={data.writeBlocked}
          onSaveKey={() => {
            if (draft.validateKey()) void data.write(draft.newKey);
          }}
        />
      );
  }
}

function SettingsFeedback({ data, draft }: { data: SettingsData; draft: Draft }) {
  const { t } = useTranslation();
  const needsReload = data.message === "conflict" || data.message === "unknownResult";
  return (
    <>
      {data.message !== null && (
        <p
          className={data.message === "saved" ? "settings-success" : "settings-error"}
          role="status"
        >
          {t("settings." + data.message)}
          {needsReload && (
            <Button type="button" variant="link" onClick={data.reload}>
              {t("settings.reload")}
            </Button>
          )}
        </p>
      )}
      {draft.error !== null && (
        <p className="settings-error" role="alert">
          {t("settings." + draft.error)}
        </p>
      )}
    </>
  );
}

function SettingsFooter({
  category,
  data,
  draft,
  onClose
}: {
  category: SettingsCategory;
  data: SettingsData;
  draft: Draft;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const canSave = (category === "connection" || category === "storage") && draft.dirty;
  const reloadRequired = data.message === "conflict" || data.message === "unknownResult";
  function save() {
    const patch = draft.patch();
    if (patch !== null) void data.write(patch);
  }
  return (
    <footer className="settings-footer">
      <p className="settings-footer-note">
        <Info aria-hidden="true" />
        {t("settings." + (category === "display" ? "preferenceFooter" : category + "Footer"))}
      </p>
      <div className="settings-actions">
        {canSave ? (
          <>
            <Button type="button" variant="outline" disabled={data.busy} onClick={draft.reset}>
              {t("settings.cancel")}
            </Button>
            <Button type="button" disabled={data.busy || reloadRequired} onClick={save}>
              {t(data.busy ? "settings.saving" : "settings.save")}
            </Button>
          </>
        ) : (
          <Button type="button" disabled={data.busy} onClick={onClose}>
            {t("settings.done")}
          </Button>
        )}
      </div>
    </footer>
  );
}

function DiscardConfirmation({ onDiscard, onKeep }: { onDiscard: () => void; onKeep: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      className="settings-confirm"
      role="alertdialog"
      aria-labelledby="settings-discard-title"
      aria-describedby="settings-discard-description"
    >
      <h2 id="settings-discard-title">{t("settings.discardTitle")}</h2>
      <p id="settings-discard-description">{t("settings.discardDescription")}</p>
      <div className="settings-actions">
        <Button type="button" variant="outline" onClick={onKeep}>
          {t("settings.keepEditing")}
        </Button>
        <Button type="button" onClick={onDiscard}>
          {t("settings.discard")}
        </Button>
      </div>
    </div>
  );
}

function SettingsHeader({ busy, onClose }: { busy: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <header className="settings-header">
      <DialogTitle className="settings-title">
        <Settings2 aria-hidden="true" />
        {t("settings.title")}
      </DialogTitle>
      <DialogDescription className="sr-only">{t("settings.navigation")}</DialogDescription>
      <Button
        variant="ghost"
        type="button"
        className="settings-close"
        aria-label={t("settings.close")}
        disabled={busy}
        onClick={() => {
          onClose();
        }}
      >
        <X aria-hidden="true" />
      </Button>
    </header>
  );
}

function SettingsPanelHeading({
  category,
  pendingRestart
}: {
  category: SettingsCategory;
  pendingRestart: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="settings-panel-heading">
        <h2 className="settings-heading">{t("settings." + category)}</h2>
        <span className="settings-scope">
          {t(category === "display" ? "settings.browserScope" : "settings.instanceScope")}
        </span>
      </div>
      <p className="settings-description">{t("settings." + category + "Description")}</p>
      {category !== "display" && pendingRestart && (
        <SettingsNotice>{t("settings.pending")}</SettingsNotice>
      )}
    </>
  );
}

export function SettingsDialog(props: SettingsDialogProps) {
  const [category, setCategory] = useState<SettingsCategory>("display");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const data = useSettingsData(props.open, props.connection?.settingsFetch ?? null);
  const draft = useSettingsDraft(data.snapshot, category);
  function execute(action: PendingAction) {
    draft.reset();
    setPending(null);
    if (action === "close" || action === "logout") props.onOpenChange(false);
    else setCategory(action);
    if (action === "logout") props.onDisconnect?.();
  }
  function request(action: PendingAction) {
    if (data.busy || action === category) return;
    if (draft.dirty) setPending(action);
    else execute(action);
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={(next, details) => {
        if (!next) {
          details.cancel();
          request("close");
        }
      }}
    >
      <DialogContent className="settings-dialog" overlayClassName="settings-backdrop">
        <SettingsHeader
          busy={data.busy}
          onClose={() => {
            request("close");
          }}
        />
        <div className="settings-layout">
          <SettingsNavigation
            category={category}
            disabled={data.busy || pending !== null}
            onSelect={request}
          />
          <div className="settings-content">
            {pending !== null ? (
              <DiscardConfirmation
                onDiscard={() => {
                  execute(pending);
                }}
                onKeep={() => {
                  setPending(null);
                }}
              />
            ) : (
              <div className="settings-panel">
                <SettingsPanelHeading
                  category={category}
                  pendingRestart={data.snapshot?.pendingRestart === true}
                />
                <SettingsFeedback data={data} draft={draft} />
                <SettingsBody
                  category={category}
                  props={props}
                  data={data}
                  draft={draft}
                  onLogout={() => {
                    request("logout");
                  }}
                />
              </div>
            )}
          </div>
        </div>
        {pending === null && (
          <SettingsFooter
            category={category}
            data={data}
            draft={draft}
            onClose={() => {
              request("close");
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
