import { expect } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

import { mockVersionRoutes, states } from "./version-fixture.js";

const testBootID = "e48245ac-51a4-4b6b-93ba-07bb4d0626a6";
export const secondBootID = "b6f0ba69-d40a-4819-9ed0-f09759c17292";
const webAccess = "kgws_" + "A".repeat(43);

export async function mockInstance(page: Page) {
  const state = {
    bootID: testBootID,
    online: true,
    token: "valid-token",
    rootAtLogin: "valid-token",
    sessionValid: false
  };
  async function respond(route: Route, kind: "info" | "overview") {
    const headers = route.request().headers();
    if (!state.online) {
      await route.abort("failed");
    } else if (
      headers["authorization"] !== "Bearer " + webAccess ||
      state.rootAtLogin !== state.token
    ) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ code: "AUTHENTICATION_FAILED", message: "authentication failed" })
      });
    } else if (
      headers["x-kgos-expected-daemon-boot"] !== undefined &&
      headers["x-kgos-expected-daemon-boot"] !== state.bootID
    ) {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ code: "WEB_CONNECTION_CHANGED", message: "web connection changed" })
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          kind === "info"
            ? { daemonBootId: state.bootID, storageStatus: "unsupported" }
            : { defaultBranch: "main", state: states.main }
        )
      });
    }
  }
  await page.route("**/api/v1/web/auth/*", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    const headers = route.request().headers();
    if (name === "login" && headers["authorization"] === "Bearer " + state.token) {
      state.sessionValid = true;
      state.rootAtLogin = state.token;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "Set-Cookie":
            "kgos_ws_fixture=" +
            "B".repeat(43) +
            "; Path=/api/v1/web/auth; HttpOnly; SameSite=Strict; Max-Age=2592000"
        },
        body: JSON.stringify({ accessToken: webAccess, daemonBootId: state.bootID })
      });
    } else if (
      name === "session" &&
      state.sessionValid &&
      state.rootAtLogin === state.token &&
      headers["cookie"]?.includes("kgos_ws_fixture=") === true
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accessToken: webAccess, daemonBootId: state.bootID })
      });
    } else if (name === "logout") {
      state.sessionValid = false;
      await route.fulfill({
        status: 204,
        headers: { "Set-Cookie": "kgos_ws_fixture=; Path=/api/v1/web/auth; Max-Age=0" }
      });
    } else {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ code: "AUTHENTICATION_FAILED", message: "authentication failed" })
      });
    }
  });
  await page.route("**/api/v1/web/data/info", async (route) => respond(route, "info"));
  await page.route("**/api/v1/evolution/overview", async (route) => respond(route, "overview"));
  await mockVersionRoutes(page);
  return state;
}

export async function authenticate(page: Page) {
  await mockInstance(page);
  await page.goto("/");
  await page.getByLabel("Access Token", { exact: true }).fill("valid-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Authentication Required" })).toHaveCount(0);
}
