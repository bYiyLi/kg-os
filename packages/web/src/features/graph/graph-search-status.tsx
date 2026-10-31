import { useTranslation } from "react-i18next";
import type { ResolvedState } from "@kgos/sdk";

import type { GraphData } from "./graph-data.js";
import type { SearchRoute } from "./graph-search.js";

export function GraphSearchStatus({
  data,
  routes,
  failed,
  state,
  domainLabel
}: {
  data: GraphData;
  routes: SearchRoute[] | null;
  failed: boolean;
  state: ResolvedState | null;
  domainLabel?: string | null;
}) {
  const { t } = useTranslation();
  const pending = routes?.some((route) => route.status === "loading") ?? false;
  const partial = routes?.some((route) => route.status === "error") ?? false;
  const searchRoutes =
    routes?.filter((route) => route.kind !== "recent" && route.kind !== "related") ?? [];
  const noMatches =
    searchRoutes.length > 0 && !pending && searchRoutes.every((route) => route.count === 0);
  const unsuccessful =
    routes !== null &&
    !pending &&
    (searchRoutes.length > 0 ? searchRoutes : routes).every(
      (route) => route.status !== "ok" && route.count === 0
    );
  const emptyKnowledge =
    routes?.length === 1 &&
    routes[0]?.kind === "recent" &&
    routes[0].status === "ok" &&
    routes[0].count === 0;
  let emptyMessage = "graph.noMatches";
  if (partial) emptyMessage = "graph.emptyPartial";
  return (
    <>
      {(failed || unsuccessful) && (
        <p className="graph-search-message" role="alert">
          {t("graph.searchFailed")}
        </p>
      )}
      {noMatches && !unsuccessful && (
        <p className="graph-search-message" role="status">
          {t(emptyMessage)}
        </p>
      )}
      {emptyKnowledge && (
        <p className="graph-search-message" role="status">
          {t("graph.emptyKnowledge")}
        </p>
      )}
      {routes !== null && (
        <div className="graph-read-status" role="status">
          <p>
            {t("graph.shown", {
              nodes: data.nodes.length,
              relationships: data.relationships.length
            })}
            {(data.limited || pending) && <span> · {t("graph.displayLimited")}</span>}
          </p>
          <div className="graph-route-status">
            {routes.map((route) => {
              let description = t("graph.routeStatus." + route.status);
              if (route.status === "ok") {
                let key = "graph.routeCount";
                if (route.kind === "recent") key = "graph.recentCount";
                if (route.kind === "related") key = "graph.relatedCount";
                description = t(key, { count: route.count });
              }
              return (
                <span key={route.kind} data-status={route.status}>
                  {t("graph.route." + route.kind)} · {description}
                  {route.limited ? " · " + t("graph.limited") : ""}
                </span>
              );
            })}
          </div>
          {typeof domainLabel === "string" && domainLabel !== "" && <small>{domainLabel}</small>}
          {state !== null && <small title={state}>{state.slice(7, 14)}</small>}
        </div>
      )}
    </>
  );
}
