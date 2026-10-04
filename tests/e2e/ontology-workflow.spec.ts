import { connect, expect, test } from "./runtime-fixture.js";

test.describe.configure({ timeout: 60_000 });

test("browses cyclic Domain organization and commits a complete Definition aggregate", async ({
  page,
  runtime,
  research
}) => {
  const canonical = (await runtime.client.object.read({ at: research.state, refs: ["node:Model"] }))
    .results[0]?.value;
  if (typeof canonical !== "object" || canonical === null || Array.isArray(canonical))
    throw new Error("Canonical Definition aggregate is absent");
  await connect(page, runtime);
  await page.getByRole("button", { name: "本体图谱", exact: true }).click();
  const ontology = page.getByRole("region", { name: "本体图谱", exact: true });
  await expect(ontology).toContainText(research.state);
  const researchDomain = ontology
    .locator(".ontology-card-list li")
    .filter({ has: page.getByRole("button", { name: "domain:Research · Research", exact: true }) });
  await researchDomain.getByRole("button", { name: "展开直接成员", exact: true }).click();
  const lab = ontology
    .locator(".ontology-card-list li")
    .filter({ has: page.getByRole("button", { name: "domain:Lab · Lab", exact: true }) });
  await lab.getByRole("button", { name: "展开直接成员", exact: true }).click();
  await expect(ontology.locator(".ontology-node.domain")).toHaveCount(2);
  await expect(ontology.locator(".ontology-node.node-definition")).toHaveCount(2);
  await expect(ontology.locator(".ontology-edge.membership")).toHaveCount(7);
  await ontology.getByRole("button", { name: "node:Model · Model", exact: true }).click();
  const detail = ontology.getByRole("complementary", { name: "本体聚合详情", exact: true });
  await expect(detail).toContainText("INTEGER");
  await detail.getByRole("button", { name: "编辑聚合", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "对象草稿", exact: true });
  await editor.getByLabel("标题 · 显示", { exact: true }).fill("研究 Model 聚合");
  await editor.getByLabel("说明", { exact: true }).fill("真实 aggregate 编辑，保留字段与类型");
  await editor.getByRole("button", { name: "查看 Patch", exact: true }).click();
  await expect(editor.getByRole("region", { name: "Patch 预览", exact: true })).toContainText(
    "前端检查通过"
  );
  await editor.getByRole("button", { name: "确认提交到 main", exact: true }).click();
  await expect(editor.getByRole("status", { name: "真实提交回执", exact: true })).toContainText(
    "知识已提交"
  );
  const head = await runtime.client.evolution.overview();
  const result = await runtime.client.object.read({ at: head.state, refs: ["node:Model"] });
  const value = result.results[0]?.value;
  expect(value).toMatchObject({
    name: "Model",
    title: "研究 Model 聚合",
    description: "真实 aggregate 编辑，保留字段与类型",
    properties: canonical["properties"]
  });
  await expect(ontology.locator(".state-line")).toContainText(research.state);
  await editor.getByRole("button", { name: "关闭对象草稿", exact: true }).click();
  await page.getByRole("button", { name: "检查更新", exact: true }).click();
  await page.getByRole("button", { name: "显式加载最新目标", exact: true }).click();
  await expect(ontology.locator(".state-line")).toContainText(head.state);
  await ontology.getByLabel("已知 Definition / Domain Ref", { exact: true }).fill("node:Model");
  await ontology.getByRole("button", { name: "读取准确 Ref", exact: true }).click();
  await expect(ontology.getByRole("complementary", { name: "本体聚合详情" })).toContainText(
    "研究 Model 聚合"
  );
});

test("rejects a real Schema tightening failure and retains the original aggregate draft", async ({
  page,
  runtime,
  research
}) => {
  await connect(page, runtime);
  await page.getByRole("button", { name: "本体图谱", exact: true }).click();
  const ontology = page.getByRole("region", { name: "本体图谱", exact: true });
  await ontology.getByLabel("已知 Definition / Domain Ref", { exact: true }).fill("node:Model");
  await ontology.getByRole("button", { name: "读取准确 Ref", exact: true }).click();
  await ontology.getByRole("button", { name: "编辑聚合", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "对象草稿", exact: true });
  const property = editor
    .locator(".definition-property")
    .filter({ has: page.getByRole("button", { name: "删除字段 parameters", exact: true }) });
  await property.getByLabel("字段类型", { exact: true }).fill("STRING");
  await editor.getByRole("button", { name: "查看 Patch", exact: true }).click();
  await expect(editor.getByRole("region", { name: "Patch 预览", exact: true })).toContainText(
    "前端检查通过"
  );
  await editor.getByRole("button", { name: "确认提交到 main", exact: true }).click();
  await expect(editor.getByRole("alert").first()).toBeVisible();
  expect((await runtime.client.evolution.overview()).state).toBe(research.state);
  expect(
    JSON.stringify(
      (await runtime.client.object.read({ at: research.state, refs: ["node:Model"] })).results
    )
  ).toContain("INTEGER");
  await expect(property.getByLabel("字段类型", { exact: true })).toHaveValue("STRING");
  await expect(editor.getByRole("status", { name: "真实提交回执", exact: true })).toHaveCount(0);
});
