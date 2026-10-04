import { connect, expect, runQuery, test } from "./runtime-fixture.js";

test.describe.configure({ timeout: 60_000 });

test("uses Cmd and Ctrl Enter for the visible mode while preserving plain Enter", async ({
  page,
  runtime
}) => {
  await connect(page, runtime);
  const editor = page.getByRole("textbox", { name: "Cypher 语句", exact: true });
  await editor.fill("RETURN 41 AS answer");
  await editor.press("Enter");
  await expect(page.locator(".query-frame")).toHaveCount(0);
  await editor.fill("RETURN 41 AS answer");
  await editor.press("Control+Enter");
  await expect(page.locator(".query-frame").first().getByRole("status").first()).toContainText(
    "完成"
  );
  await editor.fill("RETURN 42 AS answer");
  await editor.press("Meta+Enter");
  await expect(page.locator(".query-frame")).toHaveCount(2);
  await page.getByRole("combobox", { name: "模式", exact: true }).selectOption("execute");
  await editor.fill("RETURN 43 AS answer");
  await editor.press("Control+Enter");
  await expect(page.getByRole("dialog", { name: "确认高级执行", exact: true })).toBeVisible();
  await expect(page.locator(".query-frame")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(editor).toBeFocused();
});

test("measures rendered text, graph boundaries and action targets", async ({
  page,
  runtime,
  research
}, info) => {
  await connect(page, runtime);
  await runQuery(page, "MATCH (a)-[r]->(b) RETURN a, r, b LIMIT 50");
  await expect(
    page.getByRole("button", { name: `${research.model} Lumen-7B`, exact: true })
  ).toBeVisible();
  const readings = await page.evaluate(() => {
    function channels(color: string): number[] {
      return color.match(/[\d.]+/gu)?.map(Number) ?? [];
    }
    function luminance(color: string): number {
      const values = channels(color)
        .slice(0, 3)
        .map((value) => {
          const component = value / 255;
          return component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
        });
      return (values[0] ?? 0) * 0.2126 + (values[1] ?? 0) * 0.7152 + (values[2] ?? 0) * 0.0722;
    }
    function background(element: Element): string {
      let current: Element | null = element;
      while (current !== null) {
        const color = getComputedStyle(current).backgroundColor;
        const values = channels(color);
        if (values.length === 3 || values[3] !== 0) return color;
        current = current.parentElement;
      }
      return "rgb(255, 255, 255)";
    }
    return [
      { selector: "button.primary", property: "color", threshold: 4.5 },
      { selector: ".context-bar .badge", property: "color", threshold: 4.5 },
      { selector: ".inspector .muted", property: "color", threshold: 4.5 },
      { selector: ".graph-node text", property: "fill", threshold: 4.5 },
      { selector: ".graph-node .node-shape", property: "stroke", threshold: 3 },
      { selector: ".edge", property: "stroke", threshold: 3 }
    ].map((sample) => {
      const element = document.querySelector(sample.selector);
      if (element === null) throw new Error("Contrast sample is absent: " + sample.selector);
      const foreground = getComputedStyle(element).getPropertyValue(sample.property);
      const backdrop = background(element);
      const light = luminance(foreground),
        dark = luminance(backdrop);
      const ratio = (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
      return { ...sample, foreground, background: backdrop, ratio };
    });
  });
  await info.attach("rendered-contrast.json", {
    body: JSON.stringify(readings),
    contentType: "application/json"
  });
  for (const sample of readings)
    expect(sample.ratio, sample.selector).toBeGreaterThanOrEqual(sample.threshold);
  const actions = page.locator("button:visible:enabled");
  for (const action of await actions.all()) {
    const box = await action.boundingBox();
    expect(box?.height, await action.innerText()).toBeGreaterThanOrEqual(44);
    expect(box?.width, await action.innerText()).toBeGreaterThanOrEqual(44);
  }
});

test("traps modal focus, returns it on Escape, and opens DAG without resizing the underlying graph", async ({
  page,
  runtime,
  research
}) => {
  await connect(page, runtime);
  await runQuery(page, "MATCH (n:Model) RETURN n");
  const frame = page.locator(".query-frame").first();
  const node = frame.getByRole("button", { name: `${research.model} Lumen-7B`, exact: true });
  await node.focus();
  await page.keyboard.press("Enter");
  await expect(frame.getByRole("complementary", { name: "当前帧检查器" })).toContainText(
    research.model
  );
  const before = await frame.locator(".graph-canvas svg").evaluate((svg) => {
    const bounds = svg.getBoundingClientRect();
    return {
      x: bounds.x + scrollX,
      y: bounds.y + scrollY,
      width: bounds.width,
      height: bounds.height
    };
  });
  const viewBox = await frame.locator(".graph-canvas svg").getAttribute("viewBox");
  const open = page.getByRole("button", { name: "展开 DAG", exact: true });
  await open.focus();
  await page.keyboard.press("Enter");
  const dag = page.getByRole("dialog", { name: "版本 ancestry DAG", exact: true });
  await expect(dag).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  expect(await dag.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Tab");
  expect(await dag.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  expect(
    await frame.locator(".graph-canvas svg").evaluate((svg) => {
      const bounds = svg.getBoundingClientRect();
      return {
        x: bounds.x + scrollX,
        y: bounds.y + scrollY,
        width: bounds.width,
        height: bounds.height
      };
    })
  ).toEqual(before);
  expect(await frame.locator(".graph-canvas svg").getAttribute("viewBox")).toBe(viewBox);
  await page.keyboard.press("Escape");
  await expect(dag).toBeHidden();
  await expect(open).toBeFocused();
  expect(
    await frame.locator(".graph-canvas svg").evaluate((svg) => {
      const bounds = svg.getBoundingClientRect();
      return {
        x: bounds.x + scrollX,
        y: bounds.y + scrollY,
        width: bounds.width,
        height: bounds.height
      };
    })
  ).toEqual(before);
  await frame.getByRole("button", { name: "全屏", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "结果帧全屏", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "结果帧全屏", exact: true })).toBeHidden();
  await expect(frame.getByRole("button", { name: "全屏", exact: true })).toBeFocused();
  await expect(node).toHaveClass(/selected/u);
});

test("keeps nested Change focus and closes only one real history dialog on each Escape", async ({
  page,
  runtime,
  research
}) => {
  const history = await runtime.client.evolution.history({
    root: research.state,
    scope: "all",
    limit: 20
  });
  const change = history.items.find((entry) => entry.change?.afterRef === research.model)?.change;
  if (change === undefined || change === null)
    throw new Error("The seeded Model is missing from actual business history");
  await connect(page, runtime);
  const openHistory = page.getByRole("button", { name: "业务历史", exact: true });
  await openHistory.focus();
  await page.keyboard.press("Enter");
  const outer = page.getByRole("dialog", { name: "业务历史", exact: true });
  await expect(outer).toBeVisible();
  await expect(outer.getByLabel("History root", { exact: true })).toHaveValue(research.state);
  await outer.getByRole("button", { name: "读取业务历史", exact: true }).click();
  const openChange = outer
    .getByRole("button", {
      name: `${change.change} · ${change.kind} · ${research.model}`,
      exact: true
    })
    .first();
  await expect(openChange).toBeVisible();
  await openChange.focus();
  await page.keyboard.press("Enter");
  const inner = page.getByRole("dialog", { name: "公开对象变化", exact: true });
  await expect(inner).toBeVisible();
  await expect(inner).toContainText(research.model);
  const closeChange = inner.getByRole("button", { name: "关闭公开对象变化", exact: true });
  const readSides = inner.getByRole("button", { name: "读取两侧完整对象", exact: true });
  await closeChange.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(readSides).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(closeChange).toBeFocused();
  await page.keyboard.press("Tab");
  expect(await inner.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  await readSides.focus();
  await page.keyboard.press("Tab");
  await expect(closeChange).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(inner).toBeHidden();
  await expect(outer).toBeVisible();
  await expect(openChange).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(outer).toBeHidden();
  await expect(openHistory).toBeFocused();
  expect((await runtime.client.evolution.overview()).state).toBe(research.state);
});

for (const size of [
  { name: "320 CSS px", width: 320, zoom: 1 },
  { name: "200 percent CSS layout scaling", width: 1280, zoom: 2 }
]) {
  test(`reflows forms at ${size.name} and respects reduced motion`, async ({ page, runtime }) => {
    await page.setViewportSize({ width: size.width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(runtime.origin);
    if (size.zoom !== 1)
      await page.evaluate((zoom) => {
        document.documentElement.style.zoom = String(zoom);
      }, size.zoom);
    await page.getByRole("button", { name: "连接 Runtime", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "连接当前 Runtime", exact: true });
    await expect(dialog).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      )
    ).toBe(true);
    await dialog.getByLabel("访问凭证", { exact: true }).fill(runtime.token);
    await dialog.getByRole("button", { name: "连接", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator(".connection-status")).toHaveText("已连接");
    await page
      .getByRole("textbox", { name: "Cypher 语句", exact: true })
      .fill("RETURN '" + "long-text-".repeat(40) + "' AS content");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      )
    ).toBe(true);
    const dimensions = await page
      .getByRole("button", { name: "运行查询", exact: true })
      .boundingBox();
    expect(dimensions?.height).toBeGreaterThanOrEqual(44 * size.zoom - 1);
    expect(dimensions?.width).toBeGreaterThanOrEqual(44 * size.zoom - 1);
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
      true
    );
  });
}
