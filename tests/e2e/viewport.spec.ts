import { type JsonObject } from "@kgos/sdk";
import { type Locator, type Page } from "@playwright/test";

import { connect, expect, runQuery, test, type RuntimeFixture } from "./runtime-fixture.js";

test.describe.configure({ timeout: 90_000 });

async function savedFrame(runtime: RuntimeFixture, storeId: string) {
  const list = await runtime.client.web.data.list({ storeId, kind: "frame" });
  const frame = list.items.find((item) => !item.deleted);
  if (frame === undefined) return undefined;
  return (await runtime.client.web.data.read({ storeId, kind: "frame", id: frame.id })).data;
}

function viewState(data: JsonObject | null | undefined) {
  if (data === null || data === undefined) throw new Error("Actual frame record is absent");
  return {
    camera: data["camera"],
    positions: data["positions"],
    selected: data["selected"],
    readState: data["readState"]
  };
}

async function graphGeometry(svg: Locator) {
  return await svg.evaluate((element) => {
    if (!(element instanceof SVGSVGElement)) throw new Error("Knowledge SVG is absent");
    const bounds = element.getBoundingClientRect();
    const viewBox = element.viewBox.baseVal;
    return {
      width: bounds.width,
      height: bounds.height,
      x: viewBox.x,
      y: viewBox.y,
      worldWidth: viewBox.width,
      worldHeight: viewBox.height,
      scaleX: bounds.width / viewBox.width,
      scaleY: bounds.height / viewBox.height
    };
  });
}

async function paintedNode(shape: Locator, scale: number) {
  await expect(shape).toHaveAttribute("width", "144");
  await expect(shape).toHaveAttribute("height", "56");
  const geometry = await shape.evaluate((element) => {
    if (!(element instanceof SVGRectElement)) throw new Error("Actual Node shape is absent");
    const matrix = element.getScreenCTM();
    if (matrix === null) throw new Error("Actual Node shape has no screen transform");
    const style = getComputedStyle(element);
    return {
      width: element.width.baseVal.value,
      height: element.height.baseVal.value,
      scaleX: Math.hypot(matrix.a, matrix.b),
      scaleY: Math.hypot(matrix.c, matrix.d),
      strokeWidth: Number.parseFloat(style.strokeWidth),
      vectorEffect: style.vectorEffect
    };
  });
  expect(geometry.scaleX).toBeCloseTo(scale, 4);
  expect(geometry.scaleY).toBeCloseTo(scale, 4);
  expect(geometry.vectorEffect).toBe("none");
  const bounds = await shape.boundingBox();
  if (bounds === null) throw new Error("Actual Node shape has no painted bounds");
  expect(bounds.width).toBeCloseTo((geometry.width + geometry.strokeWidth) * geometry.scaleX, 3);
  expect(bounds.height).toBeCloseTo((geometry.height + geometry.strokeWidth) * geometry.scaleY, 3);
  return { bounds, geometry };
}

async function checkOntologyPan(page: Page) {
  await page.getByRole("button", { name: "本体图谱", exact: true }).click();
  const ontology = page.getByRole("region", { name: "本体图谱", exact: true });
  const canvas = ontology.locator(".ontology-canvas");
  await expect(ontology.locator(".ontology-node.domain")).toHaveCount(2);
  await expect(ontology.locator(".ontology-node.node-definition")).toHaveCount(0);
  await canvas.scrollIntoViewIfNeeded();
  const firstDomain = await ontology
    .locator(".ontology-node.domain rect")
    .first()
    .evaluate((rect) => {
      const viewport = rect.closest(".ontology-canvas");
      if (viewport === null) throw new Error("Actual Ontology viewport is absent");
      const node = rect.getBoundingClientRect();
      const canvas = viewport.getBoundingClientRect();
      return {
        node: { left: node.left, right: node.right, top: node.top, bottom: node.bottom },
        canvas: { left: canvas.left, right: canvas.right, top: canvas.top, bottom: canvas.bottom },
        scrollLeft: viewport.scrollLeft,
        pageWidth: innerWidth,
        pageHeight: innerHeight
      };
    });
  expect(firstDomain.node.left).toBeGreaterThanOrEqual(firstDomain.canvas.left);
  expect(firstDomain.node.right).toBeLessThanOrEqual(firstDomain.canvas.right);
  expect(firstDomain.node.top).toBeGreaterThanOrEqual(firstDomain.canvas.top);
  expect(firstDomain.node.bottom).toBeLessThanOrEqual(firstDomain.canvas.bottom);
  expect(firstDomain.node.left).toBeGreaterThanOrEqual(0);
  expect(firstDomain.node.right).toBeLessThanOrEqual(firstDomain.pageWidth);
  expect(firstDomain.node.top).toBeGreaterThanOrEqual(0);
  expect(firstDomain.node.bottom).toBeLessThanOrEqual(firstDomain.pageHeight);
  const manualOrigin = await canvas.evaluate((viewport) => {
    viewport.scrollLeft = 60;
    return { x: viewport.scrollLeft, y: viewport.scrollTop };
  });
  expect(manualOrigin.x).toBe(60);
  const researchDomain = ontology.locator(".ontology-card-list li").filter({
    has: page.getByRole("button", { name: "domain:Research · Research", exact: true })
  });
  await researchDomain.getByRole("button", { name: "展开直接成员", exact: true }).click();
  await expect(ontology.locator(".ontology-node.node-definition")).toHaveCount(2);
  expect(
    await canvas.evaluate((viewport) => ({ x: viewport.scrollLeft, y: viewport.scrollTop }))
  ).toEqual(manualOrigin);
  await page.setViewportSize({ width: 640, height: 900 });
  await expect
    .poll(
      async () =>
        await canvas.evaluate((viewport) => ({ x: viewport.scrollLeft, y: viewport.scrollTop }))
    )
    .toEqual(manualOrigin);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(640);
  return { firstDomain, manualOrigin };
}

test("keeps real graph targets readable at 320px and preserves cameras and manual Ontology pan on resize", async ({
  page,
  runtime,
  research
}, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await connect(page, runtime);
  await runQuery(page, "MATCH (n:Model) RETURN n");
  const frame = page.locator(".query-frame").first();
  const svg = frame.locator(".graph-canvas svg");
  const node = frame.getByRole("button", { name: `${research.model} Lumen-7B`, exact: true });
  await expect(svg.locator(".graph-node")).toHaveCount(1);
  await expect.poll(async () => (await graphGeometry(svg)).scaleX).toBeCloseTo(1, 4);
  const original = await graphGeometry(svg);
  expect(original.scaleY).toBeCloseTo(1, 4);
  expect(original.x).toBe(0);
  expect(original.y).toBe(0);
  const { bounds, geometry: bodyGeometry } = await paintedNode(node.locator(".node-shape"), 1);
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  const fontPixels = await node
    .locator("text")
    .first()
    .evaluate((text) => {
      if (!(text instanceof SVGTextElement)) throw new Error("Actual Knowledge text is absent");
      const matrix = text.getScreenCTM();
      if (matrix === null) throw new Error("Actual Knowledge text has no screen transform");
      return Number.parseFloat(getComputedStyle(text).fontSize) * Math.hypot(matrix.a, matrix.b);
    });
  expect(fontPixels).toBeCloseTo(13, 1);
  await node.click();
  const inspector = frame.getByRole("complementary", { name: "当前帧检查器", exact: true });
  await expect(node).toHaveClass(/selected/u);
  await expect(inspector.locator("pre").first()).toContainText("9223372036854775807");
  await expect(inspector.locator(".state-ref")).toHaveAttribute("title", research.state);
  await inspector.getByText("键盘对象导航", { exact: true }).click();
  const alternative = inspector.getByRole("button", {
    name: `${research.model} · Lumen-7B`,
    exact: true
  });
  await alternative.focus();
  await page.keyboard.press("Enter");
  await expect(alternative).toBeFocused();
  await expect(node).toHaveClass(/selected/u);
  const store = await runtime.client.web.data.info();
  if (store.storeId === undefined) throw new Error("Actual Web store is not ready");
  const storeId = store.storeId;
  await expect
    .poll(async () => (await savedFrame(runtime, storeId))?.["camera"])
    .toEqual({
      x: 0,
      y: 0,
      zoom: 1
    });
  await frame.getByRole("button", { name: "放大图谱", exact: true }).click();
  await frame.getByRole("button", { name: "向上平移", exact: true }).click();
  await expect
    .poll(async () => (await savedFrame(runtime, storeId))?.["camera"])
    .toEqual({
      x: 0,
      y: -100,
      zoom: 1.2
    });
  const beforeNeighbors = await svg.getAttribute("viewBox");
  await inspector.getByRole("button", { name: "扩展邻居（最多 50 行）", exact: true }).click();
  await expect(frame.locator(".edge-hit")).toHaveCount(4);
  expect(await svg.getAttribute("viewBox")).toBe(beforeNeighbors);
  const edgeTargets = await frame.locator(".edge-hit").evaluateAll((edges) =>
    edges.map((edge) => ({
      strokeWidth: Number.parseFloat(getComputedStyle(edge).strokeWidth),
      vectorEffect: getComputedStyle(edge).vectorEffect
    }))
  );
  for (const edge of edgeTargets) {
    expect(edge.strokeWidth).toBeGreaterThanOrEqual(44);
    expect(edge.vectorEffect).toBe("non-scaling-stroke");
  }
  await node.focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => (await savedFrame(runtime, storeId))?.["selected"])
    .toBe(research.model);
  await expect
    .poll(async () => {
      const positions = (await savedFrame(runtime, storeId))?.["positions"];
      return typeof positions === "object" && positions !== null && !Array.isArray(positions)
        ? Object.keys(positions).length
        : 0;
    })
    .toBe(2);
  const preserved = viewState(await savedFrame(runtime, storeId));
  const geometries = [await graphGeometry(svg)];
  for (const width of [640, 1280, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => (await graphGeometry(svg)).scaleX).toBeCloseTo(1.2, 4);
    const actual = await graphGeometry(svg);
    expect(actual.scaleY).toBeCloseTo(1.2, 4);
    expect(actual.x).toBe(0);
    expect(actual.y).toBe(-100);
    expect(viewState(await savedFrame(runtime, storeId))).toEqual(preserved);
    await expect(node).toHaveClass(/selected/u);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width
    );
    geometries.push(actual);
  }
  expect(geometries[1]?.width).toBeGreaterThan(geometries[0]?.width ?? 0);
  const { firstDomain, manualOrigin } = await checkOntologyPan(page);
  expect(viewState(await savedFrame(runtime, storeId))).toEqual(preserved);
  expect((await runtime.client.evolution.overview()).state).toBe(research.state);
  await info.attach("actual-viewport-geometry.json", {
    body: JSON.stringify({
      bounds,
      bodyGeometry,
      fontPixels,
      geometries,
      edgeTargets,
      preserved,
      firstDomain,
      manualOrigin
    }),
    contentType: "application/json"
  });
});

function frameInput(data: JsonObject | null | undefined) {
  if (data === null || data === undefined) throw new Error("Actual frame record is absent");
  return Object.fromEntries(
    ["mode", "statement", "paramsText", "inputRef", "readState"].map((key) => [key, data[key]])
  );
}

async function fittedTargets(page: Page, refs: string[]) {
  await page.getByText("参数 JSON", { exact: false }).first().click();
  await page.getByLabel("参数对象", { exact: true }).fill(JSON.stringify({ nodeRefs: refs }));
  await runQuery(page, "MATCH (n) WHERE elementId(n) IN $nodeRefs RETURN n LIMIT 50");
  const frame = page.locator(".query-frame").first();
  const svg = frame.locator(".graph-canvas svg");
  await expect(
    frame.getByRole("complementary", { name: "当前帧检查器", exact: true })
  ).toContainText("3 节点");
  await frame.getByRole("button", { name: "适配范围", exact: true }).click();
  await expect(svg.locator(".graph-node")).toHaveCount(3);
  await expect.poll(async () => (await graphGeometry(svg)).scaleX).toBeLessThan(44 / 56);
  const targets = await svg.locator(".graph-node").evaluateAll((nodes) =>
    nodes.map((node) => {
      const body = node.querySelector(".node-shape")?.getBoundingClientRect();
      const hit = node.querySelector(".node-hit")?.getBoundingClientRect();
      if (body === undefined || hit === undefined) throw new Error("Actual node target is absent");
      return {
        ref: node.getAttribute("data-node"),
        bodyWidth: body.width,
        bodyHeight: body.height,
        hitWidth: hit.width,
        hitHeight: hit.height
      };
    })
  );
  expect(targets.map((target) => target.ref).sort()).toEqual([...refs].sort());
  for (const target of targets) {
    expect(target.bodyHeight).toBeLessThan(44);
    expect(target.hitWidth).toBeGreaterThanOrEqual(44);
    expect(target.hitHeight).toBeGreaterThanOrEqual(44);
  }
  return targets;
}

test("selects a real node outside its visible body at minimum zoom and keeps explicit-fit targets usable", async ({
  page,
  runtime,
  research
}, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await connect(page, runtime);
  await runQuery(page, "MATCH (n:Model) RETURN n");
  const frame = page.locator(".query-frame").first();
  const svg = frame.locator(".graph-canvas svg");
  const node = frame.getByRole("button", { name: `${research.model} Lumen-7B`, exact: true });
  await expect(svg.locator(".graph-node")).toHaveCount(1);
  const store = await runtime.client.web.data.info();
  if (store.storeId === undefined) throw new Error("Actual Web store is not ready");
  const storeId = store.storeId;
  await expect.poll(async () => await savedFrame(runtime, storeId)).toBeTruthy();
  const header = (await runtime.client.web.data.list({ storeId, kind: "frame" })).items.find(
    (record) => !record.deleted
  );
  if (header === undefined) throw new Error("Actual frame identity is absent");
  await expect
    .poll(async () => (await runtime.client.web.cache.read({ storeId, frameId: header.id })).hit)
    .toBe(true);
  await node.focus();
  await page.keyboard.press("Enter");
  const inspector = frame.getByRole("complementary", { name: "当前帧检查器", exact: true });
  await expect(inspector.locator("pre").first()).toContainText("9223372036854775807");
  await expect
    .poll(async () => (await savedFrame(runtime, storeId))?.["selected"])
    .toBe(research.model);
  const before = await savedFrame(runtime, storeId);
  const original = viewState(before);
  for (let step = 0; step < 13; step += 1)
    await frame.getByRole("button", { name: "缩小图谱", exact: true }).click();
  await expect.poll(async () => (await graphGeometry(svg)).scaleX).toBeCloseTo(0.1, 4);
  await frame.getByRole("button", { name: "定位选中", exact: true }).click();
  await svg.scrollIntoViewIfNeeded();
  const { bounds: body, geometry: bodyGeometry } = await paintedNode(
    node.locator(".node-shape"),
    0.1
  );
  const hit = await node.locator(".node-hit").boundingBox();
  if (hit === null) throw new Error("Actual minimum-zoom hit target is absent");
  expect(hit.width).toBeGreaterThanOrEqual(44);
  expect(hit.height).toBeGreaterThanOrEqual(44);
  const point = { x: body.x + body.width / 2, y: body.y + body.height / 2 + 17 };
  expect(point.y).toBeGreaterThan(body.y + body.height);
  expect(point.y).toBeLessThan(hit.y + hit.height);
  expect(point.x).toBeGreaterThan(hit.x);
  expect(point.x).toBeLessThan(hit.x + hit.width);
  expect(
    await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y);
      return {
        isHit: target?.classList.contains("node-hit"),
        ref: target?.closest("[data-node]")?.getAttribute("data-node")
      };
    }, point)
  ).toEqual({ isHit: true, ref: research.model });
  const detail = page.waitForResponse(async (response) => {
    if (new URL(response.url()).pathname !== "/api/v1/object/read" || !response.ok()) return false;
    const request = response.request().postDataJSON() as Record<string, unknown>;
    if (
      request["at"] !== research.state ||
      JSON.stringify(request["refs"]) !== JSON.stringify([research.model])
    )
      return false;
    try {
      await response.body();
      return true;
    } catch {
      return false;
    }
  });
  await page.mouse.click(point.x, point.y);
  const response = await detail;
  expect((await response.json()) as unknown).toMatchObject({
    state: research.state,
    results: [
      { ref: research.model, value: { labels: ["Model"], properties: { name: "Lumen-7B" } } }
    ]
  });
  await expect(node).toHaveClass(/selected/u);
  await expect(inspector.locator(".state-ref")).toHaveAttribute("title", research.state);
  await expect
    .poll(async () => (await savedFrame(runtime, storeId))?.["camera"])
    .toMatchObject({ zoom: 0.1 });
  const after = await savedFrame(runtime, storeId);
  const actual = viewState(after);
  expect(actual.positions).toEqual(original.positions);
  expect(actual.selected).toBe(research.model);
  expect(actual.readState).toBe(research.state);
  expect(frameInput(after)).toEqual(frameInput(before));
  const cache = await runtime.client.web.cache.read({ storeId, frameId: header.id });
  expect(cache.hit).toBe(true);
  expect(cache.result?.state).toBe(research.state);
  const fitted = await fittedTargets(page, [research.model, research.paper, research.unlabelled]);
  expect((await runtime.client.evolution.overview()).state).toBe(research.state);
  await info.attach("actual-minimum-zoom-target.json", {
    body: JSON.stringify({
      body,
      bodyGeometry,
      hit,
      point,
      original,
      actual,
      frameInput: frameInput(after),
      fitted
    }),
    contentType: "application/json"
  });
});
