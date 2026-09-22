import { expect, test } from "@playwright/test";

test("serves the bundled KG OS shell from the real runtime", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("KG OS");
  await expect(page.getByRole("heading", { name: "KG OS" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Runtime shell ready");
  await expect(page.getByText("业务 API 尚未实现", { exact: false })).toBeVisible();
});

test("does not expose an API readiness bypass", async ({ request }) => {
  const encodedSlash = String.fromCharCode(0x25, 0x32, 0x46);
  const response = await request.get("/api/status");
  const encodedResponse = await request.get(`/api${encodedSlash}status`);

  expect(response.status()).toBe(404);
  expect(encodedResponse.status()).toBe(404);
});
