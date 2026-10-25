import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Plug } from "lucide-react";

import { Button } from "../../shared/ui/button.js";
import { Input } from "../../shared/ui/input.js";
import { testEmbedding } from "./settings-api.js";
import type { EmbeddingTestResult, SettingsFetch, SettingsSnapshot } from "./settings-types.js";
import type { SettingsDraft } from "./use-settings-draft.js";
import { SettingsInfo, SettingsSection } from "./settings-ui.js";

const knownReasons = new Set([
  "busy",
  "connection_failed",
  "invalid_fields",
  "invalid_response",
  "provider_error",
  "redirect_not_allowed",
  "timeout",
  "authentication_failed",
  "dimensions_mismatch",
  "credential_missing"
]);

function SettingsVerification({ fetcher, revision }: { fetcher: SettingsFetch; revision: string }) {
  const { t } = useTranslation();
  const [result, setResult] = useState<EmbeddingTestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    setResult(null);
    return () => {
      controller.current?.abort();
    };
  }, [revision]);
  async function verify() {
    if (controller.current !== null) return;
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setResult(null);
    try {
      const next = await testEmbedding(fetcher, current.signal);
      if (!current.signal.aborted) setResult(next);
    } catch {
      if (!current.signal.aborted) setResult({ ok: false });
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  const reasonKey =
    result?.reason !== undefined && knownReasons.has(result.reason)
      ? "settings.test_" + result.reason
      : "settings.testFailed";
  return (
    <div className="settings-verification">
      <Button
        variant="outline"
        type="button"
        disabled={busy}
        onClick={() => {
          void verify();
        }}
      >
        <Plug aria-hidden="true" />
        {t(busy ? "settings.testing" : "settings.test")}
      </Button>
      <p className="settings-hint">{t("settings.testCurrent")}</p>
      {result !== null && (
        <p className={result.ok ? "settings-success" : "settings-error"} role="status">
          {result.ok
            ? t("settings.testSucceeded", { dimensions: result.dimensions })
            : t(reasonKey)}
        </p>
      )}
    </div>
  );
}

function SettingsKey({
  snapshot,
  draft,
  busy,
  blocked,
  onSaveKey
}: {
  snapshot: SettingsSnapshot;
  draft: SettingsDraft;
  busy: boolean;
  blocked: boolean;
  onSaveKey: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <SettingsInfo
        label={t("settings.key")}
        action={
          snapshot.credential.canUpdate && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                draft.setEditingKey(true);
              }}
            >
              {t("settings.updateKey")}
            </Button>
          )
        }
      >
        <span>
          <KeyRound aria-hidden="true" />{" "}
          {t(snapshot.credential.configured ? "settings.configured" : "settings.notConfigured")}
        </span>
        <small>{t("settings.source_" + snapshot.credential.source)}</small>
        {snapshot.effective.embedding.api_key_env !== "" && (
          <code className="settings-code">{snapshot.effective.embedding.api_key_env}</code>
        )}
      </SettingsInfo>
      {draft.editingKey && (
        <div className="settings-key-form">
          <label className="settings-field">
            <span>{t("settings.newKey")}</span>
            <Input
              type="password"
              value={draft.newKey}
              autoComplete="new-password"
              spellCheck={false}
              disabled={busy}
              onChange={(event) => {
                draft.setNewKey(event.currentTarget.value);
              }}
            />
          </label>
          <p className="settings-hint">{t("settings.keyHint")}</p>
          <div className="settings-actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                draft.setNewKey("");
                draft.setEditingKey(false);
              }}
            >
              {t("settings.cancel")}
            </Button>
            <Button
              type="button"
              disabled={busy || blocked || draft.newKey === ""}
              onClick={onSaveKey}
            >
              {t(busy ? "settings.saving" : "settings.applyKey")}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

export function SettingsRetrieval({
  snapshot,
  draft,
  fetcher,
  busy,
  blocked,
  onSaveKey
}: {
  snapshot: SettingsSnapshot;
  draft: SettingsDraft;
  fetcher: SettingsFetch;
  busy: boolean;
  blocked: boolean;
  onSaveKey: () => void;
}) {
  const { t } = useTranslation();
  const embedding = snapshot.effective.embedding;
  return (
    <>
      <SettingsSection
        title={t("settings.vectorTitle")}
        description={t("settings.vectorDescription")}
      >
        <SettingsVerification fetcher={fetcher} revision={snapshot.revision} />
        <SettingsInfo label={t("settings.serviceAddress")}>
          <code>{embedding.base_url}</code>
        </SettingsInfo>
        <SettingsInfo
          label={t("settings.model")}
          action={<span className="settings-badge">{t("settings.fixed")}</span>}
        >
          <code>{embedding.model}</code>
        </SettingsInfo>
        <SettingsKey
          snapshot={snapshot}
          draft={draft}
          busy={busy}
          blocked={blocked}
          onSaveKey={onSaveKey}
        />
        <details className="settings-section">
          <summary>{t("settings.professional")}</summary>
          <div className="settings-runtime-grid">
            <SettingsInfo label={t("settings.dimensions")}>
              {embedding.dimensions}
              <code className="settings-code">embedding.dimensions</code>
            </SettingsInfo>
            <SettingsInfo label={t("settings.similarity")}>
              {embedding.similarity}
              <code className="settings-code">embedding.similarity</code>
            </SettingsInfo>
          </div>
          <p className="settings-hint">{t("settings.fixedHint")}</p>
        </details>
      </SettingsSection>
      <SettingsSection
        title={t("settings.fulltextTitle")}
        description={t("settings.fulltextDescription")}
      >
        <SettingsInfo
          label={t("settings.analyzer")}
          action={<span className="settings-badge">{t("settings.fixed")}</span>}
        >
          {snapshot.effective.fulltext.analyzer}
        </SettingsInfo>
      </SettingsSection>
      <p className="settings-code">{t("settings.configSource")}</p>
    </>
  );
}
