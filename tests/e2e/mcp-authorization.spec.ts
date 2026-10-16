import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

import { mockVersionRoutes, states } from "./version-fixture.js";

const bootID = "69b27834-2c34-4e80-a9c2-b5ac05867e1b";
const requestID = "a".repeat(43);
const webToken = "kgws_" + "b".repeat(43);
const details = {
  client_id: "https://chatgpt.com/oauth/client.json",
  client_name: "ChatGPT",
  resource: "https://kgos.example.com",
  scope: "kgos:access",
  canWrite: true,
  expires_at: "2099-01-01T00:00:00Z"
};

async function mockWebConnection(page: Page, loggedIn: boolean, validDetails = true) {
  let restored = 0;
  let decisions = 0;
  let detailReads = 0;
  await page.route("**/api/v1/web/auth/session", async (route) => {
    restored++;
    await route.fulfill({
      status: loggedIn ? 200 : 401,
      contentType: "application/json",
      body: JSON.stringify(
        loggedIn
          ? { accessToken: webToken, daemonBootId: bootID }
          : { code: "AUTHENTICATION_FAILED", message: "Web session missing" }
      )
    });
  });
  await page.route("**/api/v1/web/auth/login", async (route) => {
    expect(route.request().headers()["authorization"]).toBe("Bearer existing-instance-token");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ accessToken: webToken, daemonBootId: bootID })
    });
  });
  await page.route("**/api/v1/web/data/info", async (route) => {
    expect(route.request().headers()["authorization"]).toBe("Bearer " + webToken);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ daemonBootId: bootID, storageStatus: "unsupported" })
    });
  });
  await page.route("**/api/v1/evolution/overview", async (route) => {
    expect(route.request().headers()["authorization"]).toBe("Bearer " + webToken);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ defaultBranch: "main", state: "commit/" + states.main })
    });
  });
  await mockVersionRoutes(page);
  await page.route("**/oauth/request?*", async (route) => {
    detailReads++;
    expect(route.request().headers()["authorization"]).toBe("Bearer " + webToken);
    expect(route.request().headers()["x-kgos-expected-daemon-boot"]).toBe(bootID);
    await route.fulfill({
      status: validDetails ? 200 : 410,
      contentType: "application/json",
      body: JSON.stringify(validDetails ? details : { error: "invalid_request" })
    });
  });
  await page.route("**/oauth/decision", async (route) => {
    decisions++;
    const request = route.request();
    expect(request.headers()["authorization"]).toBe("Bearer " + webToken);
    expect(request.headers()["x-kgos-expected-daemon-boot"]).toBe(bootID);
    expect(request.headers()["origin"]).toBe("http://127.0.0.1:4173");
    const body = JSON.parse(request.postData() ?? "{}") as {
      request_id: string;
      decision: "approve" | "deny";
    };
    expect(body.request_id).toBe(requestID);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        redirect_url:
          "https://chatgpt.com/connector_platform_oauth_redirect?" +
          (body.decision === "approve" ? "code=" + "c".repeat(43) : "error=access_denied")
      })
    });
  });
  await page.route("https://chatgpt.com/**", async (route: Route) => {
    await route.fulfill({ contentType: "text/html", body: "<title>ChatGPT callback</title>" });
  });
  return {
    restored: () => restored,
    decisions: () => decisions,
    details: () => detailReads
  };
}

test("restored Web login displays the high-fidelity MCP dialog without another token", async ({
  page
}) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  const calls = await mockWebConnection(page, true);
  await page.goto("/?mcp_authorization=" + requestID);
  const dialog = page.getByRole("dialog", { name: "Authorize Connection" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("ChatGPT", { exact: true })).toBeVisible();
  await expect(dialog.getByText("https://kgos.example.com")).toBeVisible();
  await expect(dialog.getByText("Read knowledge")).toBeVisible();
  await expect(dialog.getByText("Modify knowledge")).toBeVisible();
  await expect(dialog.getByText("Manage branches")).toBeVisible();
  await expect(dialog.getByText("Execute operations")).toBeVisible();
  await expect(dialog.getByText("This connection includes write access.")).toBeVisible();
  await expect(page.locator(".authentication-dialog")).toHaveCount(0);
  expect(calls.restored()).toBe(1);
  expect(calls.details()).toBe(1);
  expect(calls.decisions()).toBe(0);
  await dialog.screenshot({ path: "test-results/mcp-authorization-dialog.png" });
  await dialog.getByRole("button", { name: "Authorize Connection" }).click();
  await expect(page).toHaveURL(/chatgpt\.com\/connector_platform_oauth_redirect/);
  expect(calls.decisions()).toBe(1);
});

test("without a Web login the existing authentication dialog precedes MCP consent", async ({
  page
}) => {
  const calls = await mockWebConnection(page, false);
  await page.goto("/?mcp_authorization=" + requestID);
  const login = page.getByRole("dialog", { name: "Authentication Required" });
  await expect(login).toBeVisible();
  await expect(page.locator(".mcp-authorization-dialog")).toHaveCount(0);
  await login.getByLabel("Access Token", { exact: true }).fill("existing-instance-token");
  await login.getByRole("button", { name: "Connect" }).click();
  const oauth = page.getByRole("dialog", { name: "Authorize Connection" });
  await expect(oauth).toBeVisible();
  expect(calls.details()).toBe(1);
  expect(calls.decisions()).toBe(0);
  expect(calls.restored()).toBe(1);
});

test("explicit refusal returns access_denied to the verified OAuth client", async ({ page }) => {
  const calls = await mockWebConnection(page, true);
  await page.goto("/?mcp_authorization=" + requestID);
  const dialog = page.getByRole("dialog", { name: "Authorize Connection" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(
    /chatgpt\.com\/connector_platform_oauth_redirect\?error=access_denied/
  );
  expect(calls.decisions()).toBe(1);
});

test("an expired request can be dismissed without issuing any grant", async ({ page }) => {
  const calls = await mockWebConnection(page, true, false);
  await page.goto("/?mcp_authorization=" + requestID);
  const dialog = page.getByRole("dialog", { name: "Authorize Connection" });
  await expect(dialog.getByRole("alert")).toContainText("unavailable");
  await expect(dialog.getByRole("button", { name: "Authorize Connection" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL("http://127.0.0.1:4173/");
  expect(calls.decisions()).toBe(0);
});

test("authorization surfaces and actions inherit both Web theme token sets", async ({ page }) => {
  await mockWebConnection(page, true);
  const inspect = () =>
    page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".app-shell");
      const dialog = document.querySelector<HTMLDialogElement>(".mcp-authorization-dialog");
      const permissions = document.querySelector<HTMLElement>(".mcp-authorization-permissions");
      const notice = document.querySelector<HTMLElement>(".mcp-authorization-notice");
      const approve = document.querySelector<HTMLButtonElement>(".mcp-authorization-approve");
      const cancel = document.querySelector<HTMLButtonElement>(".mcp-authorization-cancel");
      if (!shell || !dialog || !permissions || !notice || !approve || !cancel) {
        throw new Error("MCP authorization is not fully rendered");
      }
      const probe = document.createElement("div");
      shell.append(probe);
      const tokenColor = (property: "color" | "backgroundColor", token: string) => {
        probe.style[property] = "var(" + token + ")";
        return getComputedStyle(probe)[property];
      };
      const colors = {
        theme: shell.dataset["theme"],
        scheme: getComputedStyle(dialog).colorScheme,
        surface: getComputedStyle(dialog).backgroundColor,
        expectedSurface: tokenColor("backgroundColor", "--color-sidebar"),
        text: getComputedStyle(dialog).color,
        expectedText: tokenColor("color", "--color-text"),
        permissionSurface: getComputedStyle(permissions).backgroundColor,
        expectedCanvas: tokenColor("backgroundColor", "--color-canvas"),
        noticeSurface: getComputedStyle(notice).backgroundColor,
        expectedSoft: tokenColor("backgroundColor", "--color-primary-soft"),
        approveSurface: getComputedStyle(approve).backgroundColor,
        expectedPrimary: tokenColor("backgroundColor", "--color-primary"),
        approveText: getComputedStyle(approve).color,
        expectedActionText: tokenColor("color", "--color-page"),
        cancelSurface: getComputedStyle(cancel).backgroundColor,
        expectedControl: tokenColor("backgroundColor", "--color-control")
      };
      probe.remove();
      return colors;
    });

  await page.goto("/?mcp_authorization=" + requestID);
  await expect(page.getByRole("dialog", { name: "Authorize Connection" })).toBeVisible();
  await expect(page.getByText("Modify knowledge")).toBeVisible();
  const dark = await inspect();
  expect(dark.theme).toBe("dark");
  expect(dark.scheme).toBe("dark");

  // OAuth enters via navigation; replacing the URL and collapsing the sidebar
  // does not update the parent app's requestId. With the native dialog open,
  // the controls behind it are inert. Exercise the theme's CSS contract here;
  // interactive theme switching is covered by the Web shell tests.
  await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".app-shell");
    if (shell === null) throw new Error("Missing Web shell");
    shell.classList.replace("theme-dark", "theme-light");
    shell.dataset["theme"] = "light";
  });
  await expect(page.getByRole("dialog", { name: "Authorize Connection" })).toBeVisible();
  await expect(page.getByText("Modify knowledge")).toBeVisible();
  const light = await inspect();
  expect(light.theme).toBe("light");
  expect(light.scheme).toBe("light");
  expect(light.surface).not.toBe(dark.surface);
  expect(light.text).not.toBe(dark.text);

  for (const colors of [dark, light]) {
    expect(colors.surface).toBe(colors.expectedSurface);
    expect(colors.text).toBe(colors.expectedText);
    expect(colors.permissionSurface).toBe(colors.expectedCanvas);
    expect(colors.noticeSurface).toBe(colors.expectedSoft);
    expect(colors.approveSurface).toBe(colors.expectedPrimary);
    expect(colors.approveText).toBe(colors.expectedActionText);
    expect(colors.cancelSurface).toBe(colors.expectedControl);
  }
});
