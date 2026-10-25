import { readFile } from "node:fs/promises";
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

async function prepareWorlds(post: RuntimePost) {
  const before = await post("overview", {});
  if (before.defaultBranch === undefined) throw new Error("Runtime omitted its default world");
  await post("branch/create", { name: NOVEL_WORLD, from: before.state });
  await post("branch/create", { name: LEARNING_WORLD, from: before.state });
  const baseline = await post("state/create", { branch: NOVEL_WORLD, message: BASELINE });
  const latest = await post("state/create", { branch: NOVEL_WORLD, message: EVOLVED });
  await post("state/create", { branch: LEARNING_WORLD, message: LEARNING });
  await post("branch/create", { name: SHARED_WORLD, from: latest.state });
  expect(latest.state).not.toBe(baseline.state);
  return { before, baseline, latest, defaultWorld: before.defaultBranch };
}

async function expandWorld(sidebar: Locator, name: string) {
  await sidebar.getByRole("searchbox", { name: "Search knowledge worlds..." }).clear();
  const world = sidebar.getByRole("button", { name, exact: true });
  if ((await world.getAttribute("aria-expanded")) !== "true") await world.click();
  const history = sidebar.getByRole("region", { name: "Version history: " + name, exact: true });
  await expect(history).toBeVisible();
  return history;
}

async function chooseWorldVersion(sidebar: Locator, name: string, title: string) {
  const history = await expandWorld(sidebar, name);
  const version = history.getByRole("button", { name: new RegExp(title) });
  await version.click();
  await expect(version).toHaveAttribute(PRESSED, "true");
  return history;
}

async function openRuntimeWorld(page: Page, endpoint: string, token: string, defaultWorld: string) {
  await page.goto(endpoint + "/");
  await page.getByLabel("Access Token", { exact: true }).fill(token);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator(".authentication-dialog")).toHaveCount(0);
  const sidebar = page.locator(".version-sidebar");
  await expect(sidebar.getByRole("button", { name: defaultWorld, exact: true })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  const search = sidebar.getByRole("searchbox", { name: "Search knowledge worlds..." });
  await search.fill(NOVEL_WORLD);
  await expect(sidebar.locator(".world-section-trigger")).toHaveCount(1);
  await sidebar.getByRole("button", { name: NOVEL_WORLD, exact: true }).click();
  const history = sidebar.getByRole("region", {
    name: "Version history: " + NOVEL_WORLD,
    exact: true
  });
  await expect(history.locator('.commit-row[aria-pressed="true"]')).toHaveCount(0);
  await history.getByRole("button", { name: new RegExp(EVOLVED) }).click();
  await expect(history.locator('.commit-row[aria-pressed="true"]')).toContainText(EVOLVED);
  await search.clear();
  return sidebar;
}

async function expectHistoricalBrowsing(sidebar: Locator) {
  const history = await expandWorld(sidebar, NOVEL_WORLD);
  const evolved = history.getByRole("button", { name: new RegExp(EVOLVED) });
  await expect(evolved).toHaveAttribute(PRESSED, "true");
  await expect(evolved).toContainText("Latest");
  await history.getByRole("button", { name: new RegExp(BASELINE) }).click();
  await expect(history.locator('.commit-row[aria-pressed="true"]')).toContainText(BASELINE);
  await expect(history.getByText("Viewing a historical version")).toBeVisible();
  await expect(evolved).toContainText("Latest");
  await history.getByRole("button", { name: "Back to latest" }).click();
  await expect(evolved).toHaveAttribute(PRESSED, "true");
}

async function expectSharedHeadWorlds(sidebar: Locator) {
  const shared = await expandWorld(sidebar, SHARED_WORLD);
  await expect(shared.getByRole("button", { name: new RegExp(EVOLVED) })).toHaveAttribute(
    PRESSED,
    "false"
  );
  await chooseWorldVersion(sidebar, SHARED_WORLD, EVOLVED);
  const novel = await expandWorld(sidebar, NOVEL_WORLD);
  await expect(novel.getByRole("button", { name: new RegExp(EVOLVED) })).toHaveAttribute(
    PRESSED,
    "false"
  );
  await chooseWorldVersion(sidebar, LEARNING_WORLD, LEARNING);
  await chooseWorldVersion(sidebar, NOVEL_WORLD, EVOLVED);
}

async function expectRealRelationships(
  page: Page,
  sidebar: Locator,
  latest: string,
  baseline: string
) {
  await sidebar.getByRole("button", { name: "Knowledge world actions" }).click();
  await page.getByRole("menuitem", { name: "View version relationships" }).click();
  const relationships = page.getByRole("dialog", { name: "Version relationships", exact: true });
  await expect(relationships).toBeVisible();
  await expect(
    relationships.locator(`path[data-child="${latest}"][data-parent="${baseline}"]`)
  ).toHaveCount(1);
  await relationships.getByRole("button", { name: new RegExp(BASELINE) }).click();
  await page.keyboard.press("Escape");
  await expect(relationships).toBeHidden();
  await expect(sidebar.locator('.commit-row[aria-pressed="true"]')).toContainText(BASELINE);
}

// This acceptance uses the setup suite's isolated, initialized Go/Lithograph
// Instance. No version route or authentication response is intercepted.
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
    const response = await request.post(endpoint + "/api/v1/evolution/" + path, {
      headers: { Authorization: "Bearer " + credential.token },
      data
    });
    await expect(response).toBeOK();
    return (await response.json()) as { state: string; defaultBranch?: string };
  };
  const { before, baseline, latest, defaultWorld } = await prepareWorlds(post);
  const requests: string[] = [];
  page.on("request", (outgoing) => {
    if (outgoing.url().startsWith(endpoint + "/api/v1/evolution/")) requests.push(outgoing.url());
  });
  const sidebar = await openRuntimeWorld(page, endpoint, credential.token, defaultWorld);
  await expectHistoricalBrowsing(sidebar);
  await expectSharedHeadWorlds(sidebar);
  await expectRealRelationships(page, sidebar, latest.state, baseline.state);
  for (const path of ["/branch/list", "/ancestry", "/get"])
    expect(requests.some((url) => url.endsWith(path))).toBe(true);
  const after = await post("overview", {});
  expect(after.state).toBe(before.state);
}
