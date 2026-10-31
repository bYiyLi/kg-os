import { expect, test } from "@playwright/test";

import { createGraphRuntime, signInGraph } from "./graph-runtime.js";

test.use({ colorScheme: "light", reducedMotion: "reduce" });
test.setTimeout(90_000);

function addition(ref: string, content: string[]): string {
  return [
    "diff --git a/" + ref + " b/" + ref,
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/" + ref,
    "@@ -0,0 +1," + String(content.length) + " @@",
    ...content.map((line) => "+" + line),
    ""
  ].join("\n");
}

test("selecting a Domain scopes search and related enrichment and resets to Branch", async ({
  page,
  request
}) => {
  const runtime = await createGraphRuntime(request);
  const graphReads: { at: string; domain?: string; cypher: string }[] = [];
  page.on("request", (req) => {
    if (req.url().endsWith("/api/v1/graph/query")) {
      graphReads.push(req.postDataJSON() as { at: string; domain?: string; cypher: string });
    }
  });
  const post = async (path: string, data: object): Promise<{ state: string }> => {
    const response = await request.post(runtime.endpoint + "/api/v1/" + path, {
      headers: { Authorization: "Bearer " + runtime.token },
      data
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as { state: string };
  };
  try {
    const model = await post("object/patch", {
      branch: "main",
      baseState: runtime.latestState,
      patch:
        addition("new:node-definition:outside", [
          'name: "OutsideScope"',
          "properties:",
          '  - name: "value"',
          '    type: "STRING"',
          "constraints: []"
        ]) +
        addition("new:domain:child", ['name: "ScopedChild"', "includes:", '  - "node:GraphDoc"']) +
        addition("new:domain:parent", [
          'name: "ScopedParent"',
          "includes:",
          '  - "new:domain:child"'
        ]) +
        addition("new:domain:empty", ['name: "ScopedEmpty"', "includes: []"])
    });
    const created = await post("graph/execute", {
      branch: "main",
      cypher: "CREATE (:OutsideScope {value:'outside'})"
    });
    expect(created.state).not.toBe(model.state);

    await signInGraph(page, runtime);
    const sidebar = page.getByRole("region", { name: "Domains: main", exact: true });
    const status = page.locator(".graph-route-status");
    await expect(sidebar.getByRole("button", { name: "ScopedParent", exact: true })).toBeVisible();
    await expect(status).toContainText("4 recent nodes");
    await expect(page.locator(".graph-node")).toHaveCount(4);

    await sidebar.getByRole("button", { name: "ScopedParent", exact: true }).click();
    await expect(
      sidebar.getByRole("button", { name: "ScopedParent", exact: true })
    ).toHaveAttribute("aria-pressed", "true");
    await expect(status).toContainText("3 recent nodes");
    await expect(page.locator(".graph-node")).toHaveCount(3);
    await expect(page.locator(".graph-read-status")).toContainText("ScopedParent");
    expect(graphReads.some((item) => item.domain === "domain:ScopedParent")).toBe(true);

    const search = page.getByRole("searchbox", { name: "Search knowledge", exact: true });
    await search.fill("needle");
    await search.press("Enter");
    await expect(status.locator('[data-status="ok"]')).toHaveCount(4);
    await expect(status).not.toContainText("Recent");
    await expect(status).toContainText("Related");
    const candidates = graphReads.filter(
      (item) =>
        item.cypher.includes("queryNodes") ||
        item.cypher.includes("any(key IN keys(n)") ||
        item.cypher.includes("size(elementId(n)) DESC")
    );
    expect(
      candidates
        .filter((item) => item.cypher.includes("queryNodes"))
        .every((item) => item.domain === "domain:ScopedParent")
    ).toBe(true);
    expect(
      graphReads
        .filter((item) => item.cypher.includes("UNWIND $seeds"))
        .every((item) => item.domain === "domain:ScopedParent")
    ).toBe(true);
    expect(
      graphReads
        .filter((item) => item.cypher.includes("SHOW ALL INDEXES"))
        .every((item) => item.domain === undefined)
    ).toBe(true);

    await sidebar.getByRole("button", { name: "ScopedEmpty" }).click();
    await expect(page.locator(".graph-node")).toHaveCount(0);
    await expect(status).toContainText("0 recent nodes");

    await page
      .locator(".version-sidebar")
      .getByRole("button", { name: "main", exact: true })
      .click();
    await expect(status).toContainText("4 recent nodes");
    await expect(page.locator(".graph-node")).toHaveCount(4);
  } finally {
    await runtime.close();
  }
});
