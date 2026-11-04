import { UiProvider } from "../shared/ui/ui-provider.js";
import { Button } from "../shared/ui/button.js";
import { App as McpApp } from "@modelcontextprotocol/ext-apps";
import { useCallback, useEffect, useRef, useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";

// cspell:words hostcontextchanged toolresult

import { readMcpResult } from "../core/client/mcp-read.js";
import { createMcpVersionReader } from "../features/version/mcp-version-reader.js";
import type { DomainReader } from "../features/domain/domain-data.js";
import type { VersionReader } from "../features/version/version-data.js";
import type { GraphReader } from "../features/graph/graph-search.js";
import { i18n, synchronizeHostLocale } from "./i18n/index.js";
import { WorkspaceShell } from "./layout/workspace-shell.js";
import type { Theme } from "../shared/lib/use-theme-preference.js";

const overviewCode = "return await evolution.overview()";

interface Overview {
  state: string;
  defaultBranch: string;
}

type Connection =
  | { status: "loading" }
  | {
      status: "ready";
      data: Overview;
      versionReader: VersionReader & DomainReader & { graph: GraphReader };
    }
  | { status: "error" };

export function readOverview(result: unknown): Overview {
  const value = readMcpResult(result);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid overview");
  }
  const overview = value as Record<string, unknown>;
  if (
    typeof overview["state"] !== "string" ||
    !/^commit\/[0-9a-f]{64}$/.test(overview["state"]) ||
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
      <UiProvider>
        <EmbeddedWorkspace />
      </UiProvider>
    </I18nextProvider>
  );
}

function applyHostPreferences(app: McpApp, setTheme: (theme: Theme | undefined) => void) {
  const context = app.getHostContext();
  setTheme(context?.theme === "light" || context?.theme === "dark" ? context.theme : undefined);
  synchronizeHostLocale(typeof context?.locale === "string" ? context.locale : undefined);
}

function refreshBridge(app: McpApp | null, refresh: (app: McpApp) => Promise<void>) {
  if (app !== null) void refresh(app);
}

function isWorkspaceResult(result: unknown): boolean {
  try {
    const data = readMcpResult(result);
    return (
      typeof data === "object" &&
      data !== null &&
      !Array.isArray(data) &&
      "view" in data &&
      data.view === "workspace"
    );
  } catch {
    return false;
  }
}

function EmbeddedWorkspace() {
  const [connection, setConnection] = useState<Connection>({ status: "loading" });
  const [hostTheme, setHostTheme] = useState<Theme | undefined>();
  const appRef = useRef<McpApp | null>(null);
  const readerRef = useRef<(VersionReader & DomainReader & { graph: GraphReader }) | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async (app: McpApp) => {
    const current = ++generation.current;
    setConnection({ status: "loading" });
    try {
      const result = await app.callServerTool({
        name: "kgos_query",
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
      if (!isWorkspaceResult(result)) {
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
      synchronizeHostLocale(undefined);
      void app.close().catch(() => {
        // Host disconnect is best-effort during teardown.
      });
    };
  }, [refresh]);
  return (
    <WorkspaceShell
      hostTheme={hostTheme}
      versionReader={connection.status === "ready" ? connection.versionReader : null}
      domainReader={connection.status === "ready" ? connection.versionReader : null}
      graphReader={connection.status === "ready" ? connection.versionReader.graph : null}
      initialVersionState={connection.status === "ready" ? connection.data.state : null}
      defaultVersionBranch={connection.status === "ready" ? connection.data.defaultBranch : null}
      canvasChildren={
        <ConnectionPanel
          connection={connection}
          disabled={connection.status === "loading" || appRef.current === null}
          onRefresh={refreshBridge.bind(null, appRef.current, refresh)}
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
    <section
      className={"embedded-connection" + (connection.status === "ready" ? " is-ready" : "")}
      aria-label={t("embedded.title")}
    >
      <header className="embedded-connection-header">
        <h2>{t("embedded.title")}</h2>
        <Button variant="ghost" type="button" onClick={onRefresh} disabled={disabled}>
          {t("embedded.refresh")}
        </Button>
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
