import { connect, expect, test } from "./runtime-fixture.js";

test("serves embedded Web from a verified local Runtime tarball and connects explicitly", async ({
  page,
  runtime
}) => {
  await page.goto(runtime.origin);
  await expect(page).toHaveTitle("KG OS");
  await expect(page.getByRole("link", { name: "KG OS 工作区", exact: true })).toBeVisible();
  await expect(page.locator(".connection-status")).toHaveText("未连接");
  await expect(page.getByRole("button", { name: "运行查询", exact: true })).toBeDisabled();
  expect(runtime.runtimeRoot.startsWith(process.cwd())).toBe(false);
  expect(runtime.workspaceRoot.startsWith(process.cwd())).toBe(false);
  expect(runtime.tarball).toMatch(/\.tgz$/u);
  await connect(page, runtime);
  const info = await runtime.client.web.data.info();
  expect(info.storageStatus).toBe("ready");
  const state = await runtime.client.evolution.overview();
  await expect(page.locator(".context-bar .badge")).toHaveAttribute("title", state.state);
});

test("does not expose an API readiness or authentication bypass", async ({ request, runtime }) => {
  const encodedSlash = String.fromCharCode(0x25, 0x32, 0x46);
  const response = await request.get(runtime.origin + "/api/status", {
    headers: { authorization: "Bearer " + runtime.token }
  });
  const encodedResponse = await request.get(`${runtime.origin}/api${encodedSlash}status`, {
    headers: { authorization: "Bearer " + runtime.token }
  });
  const anonymous = await request.post(runtime.origin + "/api/v1/evolution/overview", { data: {} });

  expect(response.status()).toBe(404);
  expect(encodedResponse.status()).toBe(404);
  expect(anonymous.status()).toBe(401);
  expect(((await anonymous.json()) as { code: string }).code).toBe("AUTHENTICATION_FAILED");
});
