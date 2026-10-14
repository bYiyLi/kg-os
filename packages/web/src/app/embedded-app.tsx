import { App as McpApp } from "@modelcontextprotocol/ext-apps";
import { useCallback, useEffect, useRef, useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";

// cspell:words hostcontextchanged toolresult

import { detectLocale, i18n } from "./i18n/index.js";
import { WorkspaceShell } from "./layout/workspace-shell.js";
import type { Theme } from "./layout/version-sidebar.js";

const overviewCode = "return await evolution.overview()";

interface Overview {
  state: string;
  defaultBranch: string;
}

type Connection = { status: "loading" } | { status: "ready"; data: Overview } | { status: "error" };

export function readOverview(result: unknown): Overview {
  if (typeof result !== "object" || result === null) throw new Error("Invalid MCP result");
  const call = result as Record<string, unknown>;
  if (call["isError"] === true) throw new Error("MCP read failed");
  const content = call["content"];
  if (!Array.isArray(content)) throw new Error("MCP result has no content");
  const item = content.find(
    (entry: unknown) =>
      typeof entry === "object" &&
      entry !== null &&
      (entry as Record<string, unknown>)["type"] === "text"
  ) as Record<string, unknown> | undefined;
  const text = item?.["text"];
  if (typeof text !== "string") throw new Error("MCP result has no text");
  const response: unknown = JSON.parse(text);
  if (typeof response !== "object" || response === null || Array.isArray(response)) {
    throw new Error("Invalid MCP envelope");
  }
  const value: unknown = (response as Record<string, unknown>)["result"];
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

function EmbeddedWorkspace() {
  const [connection, setConnection] = useState<Connection>({ status: "loading" });
  const [hostTheme, setHostTheme] = useState<Theme | undefined>();
  const appRef = useRef<McpApp | null>(null);
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
      if (generation.current === current) setConnection({ status: "ready", data });
    } catch {
      if (generation.current === current) setConnection({ status: "error" });
    }
  }, []);

  useEffect(() => {
    const app = new McpApp({ name: "KG OS Workspace", version: "1.0.0" }, {});
    appRef.current = app;
    const started = generation.current;

    const updateHost = () => {
      if (appRef.current !== app) return;
      const context = app.getHostContext();
      if (context?.theme === "light" || context?.theme === "dark") {
        setHostTheme(context.theme);
      }
      if (typeof context?.locale === "string") {
        void i18n.changeLanguage(detectLocale(null, [context.locale]));
      }
    };
    app.addEventListener("hostcontextchanged", updateHost);
    app.addEventListener("toolresult", (result) => {
      // Only the entrypoint result is delivered here; never repeat the call.
      if (result.isError === true) {
        generation.current++;
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
      void app.close().catch(() => {
        // Host disconnect is best-effort during teardown.
      });
    };
  }, [refresh]);

  return (
    <WorkspaceShell
      hostTheme={hostTheme}
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
