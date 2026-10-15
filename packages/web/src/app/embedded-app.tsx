import { App as McpApp } from "@modelcontextprotocol/ext-apps";
import { useCallback, useEffect, useRef, useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";

// cspell:words hostcontextchanged toolresult

import { readMcpResult } from "../core/client/mcp-read.js";
import { createMcpVersionReader } from "../features/version/mcp-version-reader.js";
import type { VersionReader } from "../features/version/version-data.js";
import { detectLocale, i18n } from "./i18n/index.js";
import { WorkspaceShell } from "./layout/workspace-shell.js";
import type { Theme } from "./layout/version-sidebar.js";

const overviewCode = "return await evolution.overview()";

interface Overview {
  state: string;
  defaultBranch: string;
}

type Connection =
  | { status: "loading" }
  | { status: "ready"; data: Overview; versionReader: VersionReader }
  | { status: "error" };

export function readOverview(result: unknown): Overview {
  const value = readMcpResult(result);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid overview");
  }
  const overview = value as Record<string, unknown>;
  if (
    typeof overview["state"] !== "string" ||
    overview["state"].length === 0 ||
    typeof overview["defaultBranch"] !== "string" ||
    overview["defaultBranch"].length === 0
  ) {
    throw new Error("Incomplete overview");
  }
  return { state: overview["state"], defaultBranch: overview["defaultBranch"] };
}

export function EmbeddedApp() {
  return (
    <I18nextProvider i18n={i18n}>
      <EmbeddedWorkspace />
    </I18nextProvider>
  );
}

function applyHostPreferences(app: McpApp, setTheme: (theme: Theme) => void) {
  const context = app.getHostContext();
  if (context?.theme === "light" || context?.theme === "dark") {
    setTheme(context.theme);
  }
  if (typeof context?.locale === "string") {
    void i18n.changeLanguage(detectLocale(null, [context.locale]));
  }
}

function EmbeddedWorkspace() {
  const [connection, setConnection] = useState<Connection>({ status: "loading" });
  const [hostTheme, setHostTheme] = useState<Theme | undefined>();
  const appRef = useRef<McpApp | null>(null);
  const readerRef = useRef<VersionReader | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async (app: McpApp) => {
    const current = ++generation.current;
    setConnection({ status: "loading" });
    try {
      const result = await app.callServerTool({
        name: "kgos_read",
        arguments: { code: overviewCode }
      });
      const data = readOverview(result);
      if (generation.current === current) {
        const versionReader = createMcpVersionReader(app, () => {
          // Host Bridge failure/revocation invalidates all old version data.
          if (appRef.current !== app || readerRef.current !== versionReader) return;
          generation.current++;
          readerRef.current = null;
          setConnection({ status: "error" });
        });
        readerRef.current = versionReader;
        setConnection({ status: "ready", data, versionReader });
      }
    } catch {
      if (generation.current === current) {
        readerRef.current = null;
        setConnection({ status: "error" });
      }
    }
  }, []);
  useEffect(() => {
    const app = new McpApp({ name: "KG OS Workspace", version: "1.0.0" }, {});
    appRef.current = app;
    const started = generation.current;
    const updateHost = () => {
      if (appRef.current !== app) return;
      applyHostPreferences(app, setHostTheme);
    };
    app.addEventListener("hostcontextchanged", updateHost);
    app.addEventListener("toolresult", (result) => {
      // Only the entrypoint result is delivered here; never repeat the call.
      if (result.isError === true) {
        generation.current++;
        readerRef.current = null;
        setConnection({ status: "error" });
      }
    });
    void (async () => {
      try {
        await app.connect();
        if (generation.current !== started) return;
        updateHost();
        if (!app.getHostCapabilities()?.serverTools) {
          setConnection({ status: "error" });
          return;
        }
        await refresh(app);
      } catch {
        if (generation.current === started) setConnection({ status: "error" });
      }
    })();
    return () => {
      generation.current++;
      appRef.current = null;
      readerRef.current = null;
      void app.close().catch(() => {
        // Host disconnect is best-effort during teardown.
      });
    };
  }, [refresh]);
  return (
    <WorkspaceShell
      hostTheme={hostTheme}
      versionReader={connection.status === "ready" ? connection.versionReader : null}
      initialVersionState={connection.status === "ready" ? connection.data.state : null}
      canvasChildren={
        <ConnectionPanel
          connection={connection}
          disabled={connection.status === "loading" || appRef.current === null}
          onRefresh={() => {
            if (appRef.current !== null) void refresh(appRef.current);
          }}
        />
      }
    />
  );
}

function ConnectionPanel({
  connection,
  disabled,
  onRefresh
}: {
  connection: Connection;
  disabled: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="embedded-connection" aria-label={t("embedded.title")}>
      <header className="embedded-connection-header">
        <h2>{t("embedded.title")}</h2>
        <button type="button" onClick={onRefresh} disabled={disabled}>
          {t("embedded.refresh")}
        </button>
      </header>
      {connection.status === "loading" && <p role="status">{t("embedded.loading")}</p>}
      {connection.status === "error" && <p role="alert">{t("embedded.unavailable")}</p>}
      {connection.status === "ready" && (
        <dl>
          <dt>{t("embedded.branch")}</dt>
          <dd>{connection.data.defaultBranch}</dd>
          <dt>{t("embedded.commit")}</dt>
          <dd title={connection.data.state}>{connection.data.state}</dd>
        </dl>
      )}
    </section>
  );
}
