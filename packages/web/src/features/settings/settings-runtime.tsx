import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";

import { Button } from "../../shared/ui/button.js";
import { readDiagnostics } from "./settings-api.js";
import type { SettingsFetch, SettingsSnapshot } from "./settings-types.js";
import { SettingsInfo, SettingsNotice, SettingsSection } from "./settings-ui.js";

function ProcessDiagnostics({ fetcher }: { fetcher: SettingsFetch }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [readAt, setReadAt] = useState<Date | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
    },
    []
  );
  async function refresh() {
    if (request.current !== null) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setFailed(false);
    try {
      const next = await readDiagnostics(fetcher, controller.signal);
      if (!controller.signal.aborted) {
        setData(next);
        setReadAt(new Date());
      }
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      request.current = null;
    }
  }
  return (
    <SettingsSection
      title={t("settings.diagnostics")}
      action={
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            void refresh();
          }}
        >
          <RefreshCw aria-hidden="true" />
          {t("settings.refreshDiagnostics")}
        </Button>
      }
    >
      {data === null && !failed && <p className="settings-hint">{t("settings.diagnosticEmpty")}</p>}
      {failed && (
        <p className="settings-error" role="alert">
          {t("settings.diagnosticFailed")}
        </p>
      )}
      {readAt !== null && (
        <p className="settings-hint" role="status">
          {t("settings.diagnosticTime", { time: readAt.toLocaleTimeString(i18n.language) })}
        </p>
      )}
      {data !== null && (
        <details>
          <summary>{t("settings.diagnosticDetails")}</summary>
          <pre className="settings-code">{JSON.stringify(data, null, 2)}</pre>
        </details>
      )}
    </SettingsSection>
  );
}

function RuntimeHighlights({ snapshot }: { snapshot: SettingsSnapshot }) {
  const { t } = useTranslation();
  const fields = [
    { key: "mcp-request-timeout-ms", label: "requestTimeout", unit: "seconds" },
    { key: "mcp-max-concurrency", label: "maxConcurrency", unit: "count" },
    { key: "mcp-max-request-bytes", label: "maxRequestSize", unit: "bytes" },
    { key: "log-level", label: "logLevel", unit: "text" }
  ];
  function formatted(value: string, unit: string) {
    if (unit === "seconds") return t("settings.seconds", { value: Number(value) / 1000 });
    if (unit === "bytes") return String(Number(value) / (1024 * 1024)) + " MiB";
    return value;
  }
  return (
    <div className="settings-runtime-grid">
      {fields.map((field) => {
        const parameter = snapshot.runtime.parameters.find((item) => item.key === field.key);
        if (parameter === undefined) return null;
        return (
          <SettingsInfo key={field.key} label={t("settings." + field.label)}>
            {formatted(parameter.value, field.unit)}
          </SettingsInfo>
        );
      })}
    </div>
  );
}

export function SettingsRuntime({
  snapshot,
  fetcher
}: {
  snapshot: SettingsSnapshot;
  fetcher: SettingsFetch;
}) {
  const { t } = useTranslation();
  return (
    <>
      <SettingsSection title={t("settings.serviceInfo")}>
        <div className="settings-runtime-grid">
          <SettingsInfo label={t("settings.version")}>{snapshot.runtime.version}</SettingsInfo>
          <SettingsInfo label={t("settings.platform")}>{snapshot.runtime.platform}</SettingsInfo>
          <SettingsInfo label={t("settings.endpoint")}>
            <code>{snapshot.runtime.endpoint || t("settings.sourceUnavailable")}</code>
          </SettingsInfo>
          <SettingsInfo label={t("settings.mcpAddress")}>
            <code>{snapshot.runtime.mcpPath}</code>
          </SettingsInfo>
        </div>
      </SettingsSection>
      <SettingsSection
        title={t("settings.runtimeParameters")}
        description={t("settings.deploymentHint")}
      >
        <RuntimeHighlights snapshot={snapshot} />
        <details>
          <summary>{t("settings.allParameters")}</summary>
          <div className="settings-table">
            <table>
              <thead>
                <tr>
                  <th>{t("settings.parameter")}</th>
                  <th>{t("settings.value")}</th>
                  <th>{t("settings.source")}</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.runtime.parameters.map((parameter) => (
                  <tr key={parameter.key}>
                    <td>
                      <code>{parameter.key}</code>
                    </td>
                    <td>{parameter.value}</td>
                    <td>
                      <code>{parameter.source}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </SettingsSection>
      <ProcessDiagnostics fetcher={fetcher} />
      <SettingsNotice>{t("settings.deploymentHint")}</SettingsNotice>
    </>
  );
}
