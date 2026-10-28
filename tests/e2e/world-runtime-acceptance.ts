import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect } from "@playwright/test";
import type { APIRequestContext, Locator, Page } from "@playwright/test";

const NOVEL_WORLD = "qa-novel";
const LEARNING_WORLD = "qa-learning";
const SHARED_WORLD = "qa-shared";
const BASELINE = "Novel world baseline";
const EVOLVED = "Novel world evolved";
const LEARNING = "Learning world baseline";
const PRESSED = "aria-pressed";
type RuntimePost = (
  path: string,
  data: object
) => Promise<{ state: string; defaultBranch?: string }>;

function addDomain(target: string, name: string, includes: string[]) {
  const body = [
    `name: ${JSON.stringify(name)}`,
    `title: ${JSON.stringify(name)}`,
    ...(includes.length === 0
      ? ["includes: []"]
      : ["includes:", ...includes.map((ref) => "  - " + JSON.stringify(ref))])
  ];
  return [
    `diff --git a/${target} b/${target}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${target}`,
    `@@ -0,0 +1,${String(body.length)} @@`,
    ...body.map((line) => "+" + line),
    ""
  ].join("\n");
}

async function prepareWorlds(post: RuntimePost) {
  const before = await post("evolution/overview", {});
  if (before.defaultBranch === undefined) throw new Error("Runtime omitted its default world");
  await post("evolution/branch/create", { name: NOVEL_WORLD, from: before.state });
  await post("evolution/branch/create", { name: LEARNING_WORLD, from: before.state });
  const baseline = await post("evolution/state/create", { branch: NOVEL_WORLD, message: BASELINE });
  const latest = await post("object/patch", {
    branch: NOVEL_WORLD,
    baseState: baseline.state,
    message: EVOLVED,
    patch:
      addDomain("new:domain:writing", "Writing", ["new:domain:characters"]) +
      addDomain("new:domain:characters", "Characters", [])
  });
  await post("evolution/state/create", { branch: LEARNING_WORLD, message: LEARNING });
  await post("evolution/branch/create", { name: SHARED_WORLD, from: latest.state });
  expect(latest.state).not.toBe(baseline.state);
  return { before, baseline, latest, defaultWorld: before.defaultBranch };
}

async function openHistory(page: Page, sidebar: Locator, name: string) {
  await sidebar.getByRole("searchbox", { name: "Search knowledge worlds..." }).clear();
  await sidebar.getByRole("button", { name: "View history: " + name, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Version relationships", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".version-dag-world")).toHaveText(name);
  return dialog;
}

async function openRuntimeWorld(page: Page, endpoint: string, token: string, defaultWorld: string) {
  await page.goto(endpoint + "/");
  await page.getByLabel("Access Token", { exact: true }).fill(token);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator(".authentication-dialog")).toHaveCount(0);
  const sidebar = page.locator(".version-sidebar");
  await expect(sidebar.getByRole("button", { name: defaultWorld, exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(sidebar.locator(".commit-item")).toHaveCount(0);
  const search = sidebar.getByRole("searchbox", { name: "Search knowledge worlds..." });
  await search.fill(NOVEL_WORLD);
  await expect(sidebar.locator(".world-section-trigger")).toHaveCount(1);
  await sidebar.getByRole("button", { name: NOVEL_WORLD, exact: true }).click();
  await expect(sidebar.getByRole("button", { name: NOVEL_WORLD, exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await search.clear();
  const tree = sidebar.getByRole("region", { name: "Domains: " + NOVEL_WORLD, exact: true });
  await expect(tree.getByRole("button", { name: "Writing", exact: true })).toBeVisible();
  await tree.getByRole("button", { name: "Expand domain: Writing", exact: true }).click();
  await tree.getByRole("button", { name: "Characters", exact: true }).click();
  await expect(tree.getByRole("button", { name: "Characters", exact: true })).toHaveAttribute(
    PRESSED,
    "true"
  );
  return sidebar;
}

async function expectHistoricalBrowsing(
  page: Page,
  sidebar: Locator,
  latest: string,
  baseline: string
) {
  const dialog = await openHistory(page, sidebar, NOVEL_WORLD);
  const evolved = dialog.getByRole("button", { name: new RegExp(EVOLVED) });
  await expect(evolved).toHaveAttribute(PRESSED, "true");
  await expect(evolved).toContainText("Latest");
  await expect(
    dialog.locator(`path[data-child="${latest}"][data-parent="${baseline}"]`)
  ).toHaveCount(1);
  await page.screenshot({ path: ".cache/domain-tree-navigation/runtime-history-dialog.png" });
  await dialog.getByRole("button", { name: new RegExp(BASELINE) }).click();
  await expect(dialog.getByRole("button", { name: new RegExp(BASELINE) })).toHaveAttribute(
    PRESSED,
    "true"
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(sidebar.getByText("Viewing a historical version")).toBeVisible();
  const tree = sidebar.getByRole("region", { name: "Domains: " + NOVEL_WORLD, exact: true });
  await expect(tree.getByRole("button", { name: "Writing", exact: true })).toHaveCount(0);
  await expect(
    sidebar.getByRole("button", { name: "Expand knowledge world: " + NOVEL_WORLD, exact: true })
  ).toHaveCount(0);
  await sidebar.getByRole("button", { name: "Back to latest", exact: true }).click();
  await expect(tree.getByRole("button", { name: "Writing", exact: true })).toBeVisible();
  await expect(sidebar.getByText("Viewing a historical version")).toHaveCount(0);
}

async function expectSharedHeadWorlds(page: Page, sidebar: Locator) {
  const shared = await openHistory(page, sidebar, SHARED_WORLD);
  await expect(shared.getByRole("button", { name: new RegExp(EVOLVED) })).toHaveAttribute(
    PRESSED,
    "false"
  );
  await shared.getByRole("button", { name: new RegExp(EVOLVED) }).click();
  await expect(shared.getByRole("button", { name: new RegExp(EVOLVED) })).toHaveAttribute(
    PRESSED,
    "true"
  );
  await page.keyboard.press("Escape");
  await expect(sidebar.getByRole("button", { name: SHARED_WORLD, exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  const novel = await openHistory(page, sidebar, NOVEL_WORLD);
  await expect(novel.getByRole("button", { name: new RegExp(EVOLVED) })).toHaveAttribute(
    PRESSED,
    "false"
  );
  await page.keyboard.press("Escape");
  await sidebar.getByRole("button", { name: LEARNING_WORLD, exact: true }).click();
  await expect(sidebar.getByRole("button", { name: LEARNING_WORLD, exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(
    sidebar.getByRole("button", { name: "Expand knowledge world: " + LEARNING_WORLD, exact: true })
  ).toHaveCount(0);
  await sidebar.getByRole("button", { name: NOVEL_WORLD, exact: true }).click();
}

// Runs only against the setup suite's isolated Go/Lithograph Instance. No route,
// token, snapshot, or model in the developer's existing Instance is replaced.
export async function expectRuntimeWorldNavigation(
  page: Page,
  request: APIRequestContext,
  endpoint: string,
  workspace: string
) {
  const credential = JSON.parse(await readFile(join(workspace, ".kgos", "auth.json"), "utf8")) as {
    token: string;
  };
  const post: RuntimePost = async (path, data) => {
    const response = await request.post(endpoint + "/api/v1/" + path, {
      headers: { Authorization: "Bearer " + credential.token },
      data
    });
    await expect(response).toBeOK();
    return (await response.json()) as { state: string; defaultBranch?: string };
  };
  const { before, baseline, latest, defaultWorld } = await prepareWorlds(post);
  await mkdir(".cache/domain-tree-navigation", { recursive: true });
  const requests: { path: string; data: object }[] = [];
  page.on("request", (outgoing) => {
    if (outgoing.url().startsWith(endpoint + "/api/v1/") && outgoing.method() === "POST")
      requests.push({
        path: new URL(outgoing.url()).pathname,
        data: outgoing.postDataJSON() as object
      });
  });
  const sidebar = await openRuntimeWorld(page, endpoint, credential.token, defaultWorld);
  await page.screenshot({ path: ".cache/domain-tree-navigation/runtime-domain-tree.png" });
  await expectHistoricalBrowsing(page, sidebar, latest.state, baseline.state);
  await expectSharedHeadWorlds(page, sidebar);
  for (const path of [
    "/evolution/branch/list",
    "/evolution/ancestry",
    "/evolution/get",
    "/ontology/read",
    "/object/read"
  ])
    expect(requests.some((outgoing) => outgoing.path.endsWith(path))).toBe(true);
  const domainReads = requests.filter(
    (outgoing) => outgoing.path.endsWith("/ontology/read") || outgoing.path.endsWith("/object/read")
  );
  expect(
    domainReads.every(
      (outgoing) =>
        "at" in outgoing.data &&
        typeof outgoing.data.at === "string" &&
        /^commit\/[0-9a-f]{64}$/.test(outgoing.data.at)
    )
  ).toBe(true);
  expect(
    domainReads.some((outgoing) => "at" in outgoing.data && outgoing.data.at === latest.state)
  ).toBe(true);
  expect(
    domainReads.some((outgoing) => "at" in outgoing.data && outgoing.data.at === baseline.state)
  ).toBe(true);
  const after = await post("evolution/overview", {});
  expect(after.state).toBe(before.state);
}
