import { expect, test } from "@playwright/test";

import { authenticate } from "./web-shell-fixture.js";

test("Observability and Settings share left-aligned icon and label positions", async ({ page }) => {
  await authenticate(page);

  async function verifyAlignment(selector: string) {
    const buttons = page.locator(selector);
    await expect(buttons).toHaveCount(2);
    const positions = await buttons.evaluateAll((elements) =>
      elements.map((element) => {
        const icon = element.querySelector(".icon");
        const label = element.querySelector("span");
        if (icon === null || label === null) throw new Error("Missing navigation action content");
        return {
          iconX: icon.getBoundingClientRect().left,
          labelX: label.getBoundingClientRect().left,
          justify: getComputedStyle(element).justifyContent
        };
      })
    );
    expect(positions.map((item) => item.justify)).toEqual(["flex-start", "flex-start"]);
    expect(Math.abs((positions[0]?.iconX ?? 0) - (positions[1]?.iconX ?? 0))).toBeLessThan(1);
    expect(Math.abs((positions[0]?.labelX ?? 0) - (positions[1]?.labelX ?? 0))).toBeLessThan(1);
  }

  await verifyAlignment(".version-sidebar .sidebar-bottom button");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Version navigation" }).click();
  await verifyAlignment(".version-drawer .drawer-bottom button");
});
