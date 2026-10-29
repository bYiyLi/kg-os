import type { Page, Route } from "@playwright/test";

import {
  connectQuery,
  fulltextQuery,
  indexQuery,
  keywordQuery,
  neighborQuery,
  recentQuery,
  semanticQuery
} from "../../packages/web/src/features/graph/graph-queries.js";

// Non-graph E2E fixtures intentionally contain no Knowledge. The Web now
// performs a recent graph read after login, so each simulated authenticated
// Instance must handle that request instead of allowing a real-daemon 401.
const graphColumns = new Map<string, string[]>([
  [recentQuery, ["n"]],
  [keywordQuery, ["n"]],
  [indexQuery, ["name", "type", "labelsOrTypes"]],
  [fulltextQuery, ["node", "score"]],
  [semanticQuery, ["node", "score"]],
  [neighborQuery, ["n", "r", "m"]],
  [connectQuery, ["a", "r", "b"]]
]);

export async function mockEmptyGraphQuery(
  page: Page,
  respond: (route: Route, body: object) => Promise<void>
) {
  await page.route("**/api/v1/graph/query", async (route) => {
    const request = route.request().postDataJSON() as { at?: string; cypher?: string };
    const columns = graphColumns.get(request.cypher ?? "");
    if (typeof request.at !== "string" || columns === undefined) {
      await route.fulfill({
        status: 400,
        json: { code: "INVALID_ARGUMENT", message: "Unexpected mock Graph query" }
      });
      return;
    }
    await respond(route, { state: request.at, columns, rows: [] });
  });
}
