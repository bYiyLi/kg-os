import { useTranslation } from "react-i18next";
import type { ResolvedState } from "@kgos/sdk";

import type { GraphData } from "./graph-data.js";
import type { SearchRoute } from "./graph-search.js";

export function GraphSearchStatus({
  data,
  routes,
  failed,
  state
}: {
  data: GraphData;
  routes: SearchRoute[] | null;
  failed: boolean;
  state: ResolvedState | null;
}) {
  const { t } = useTranslation();
  const pending = routes?.some((route) => route.status === "loading") ?? false;
  const partial = routes?.some((route) => route.status === "error") ?? false;
  const noMatches = routes !== null && !pending && routes.every((route) => route.count === 0);
  const unsuccessful = noMatches && routes.every((route) => route.status !== "ok");
  return (
    <>
      {(failed || unsuccessful) && (
        <p className="graph-search-message" role="alert">
          {t("graph.searchFailed")}
        </p>
      )}
      {noMatches && !unsuccessful && (
        <p className="graph-search-message" role="status">
          {t(partial ? "graph.emptyPartial" : "graph.noMatches")}
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
            {routes.map((route) => (
              <span key={route.kind} data-status={route.status}>
                {t("graph.route." + route.kind)} ·{" "}
                {route.status === "ok"
                  ? t("graph.routeCount", { count: route.count })
                  : t("graph.routeStatus." + route.status)}
                {route.limited ? " · " + t("graph.limited") : ""}
              </span>
            ))}
          </div>
          {state !== null && <small title={state}>{state.slice(7, 14)}</small>}
        </div>
      )}
    </>
  );
}
