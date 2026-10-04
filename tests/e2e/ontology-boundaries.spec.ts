import { type JsonObject, type JsonValue } from "@kgos/sdk";
import { type Locator, type Page } from "@playwright/test";

import { changedObject, connect, expect, test, type RuntimeFixture } from "./runtime-fixture.js";

test.describe.configure({ timeout: 60_000 });

function objectValue(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Expected a complete public Object value");
  return value as JsonObject;
}

async function readValue(runtime: RuntimeFixture, state: string, ref: string): Promise<JsonObject> {
  return objectValue(
    (await runtime.client.object.read({ at: state, refs: [ref] })).results[0]?.value
  );
}

async function editAggregate(page: Page, runtime: RuntimeFixture, ref: string): Promise<Locator> {
  await connect(page, runtime);
  await page.getByRole("button", { name: "本体图谱", exact: true }).click();
  const ontology = page.getByRole("region", { name: "本体图谱", exact: true });
  await ontology.getByLabel("已知 Definition / Domain Ref", { exact: true }).fill(ref);
  await ontology.getByRole("button", { name: "读取准确 Ref", exact: true }).click();
  await ontology.getByRole("button", { name: "编辑聚合", exact: true }).click();
  return page.getByRole("dialog", { name: "对象草稿", exact: true });
}

function property(editor: Locator, page: Page, name: string): Locator {
  return editor
    .locator(".definition-property")
    .filter({ has: page.getByRole("button", { name: `删除字段 ${name}`, exact: true }) });
}

interface Tightening {
  name: string;
  kind: "required" | "unique" | "label" | "endpoint";
  ref: string;
  prepare?: string;
}

const cases: Tightening[] = [
  {
    name: "required rejects a real node with a missing field",
    kind: "required",
    ref: "node:Model",
    prepare: "CREATE (:Model {name: 'Missing parameters'})"
  },
  {
    name: "unique rejects real duplicate property values",
    kind: "unique",
    ref: "node:Model",
    prepare: "CREATE (:Model {name: 'Lumen-7B'})"
  },
  {
    name: "an additional Label rejects existing nodes without that Label",
    kind: "label",
    ref: "node:Model"
  },
  {
    name: "a named endpoint rejects real relationships with the wrong source type",
    kind: "endpoint",
    ref: "relationship:RELATES"
  }
];

for (const tightening of cases) {
  test(tightening.name, async ({ page, runtime, research }) => {
    if (tightening.prepare !== undefined)
      await runtime.client.graph.execute({ branch: "main", cypher: tightening.prepare });
    const state = (await runtime.client.evolution.overview()).state;
    const before = await readValue(runtime, state, tightening.ref);
    const knowledgeRefs = [research.model, research.paper, research.selfLoop, research.reverse];
    const knowledge = await runtime.client.object.read({ at: state, refs: knowledgeRefs });
    const editor = await editAggregate(page, runtime, tightening.ref);
    const required = property(editor, page, "parameters").getByLabel("required · 必填", {
      exact: true
    });
    const unique = property(editor, page, "name").getByLabel("unique · 唯一", { exact: true });
    if (tightening.kind === "required") await required.check();
    else if (tightening.kind === "unique") await unique.check();
    else if (tightening.kind === "label") {
      await editor.getByRole("button", { name: "添加附加必需 Label", exact: true }).click();
      await editor.getByLabel("附加必需 Label 1", { exact: true }).fill("Reviewed");
    } else {
      await editor.getByLabel("此端不限制类型（null）", { exact: true }).first().uncheck();
      await editor.getByLabel("源端 Definition", { exact: true }).fill("node:Paper");
    }
    await editor.getByRole("button", { name: "查看 Patch", exact: true }).click();
    await expect(editor.getByRole("region", { name: "Patch 预览", exact: true })).toContainText(
      "前端检查通过"
    );
    const rejected = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/v1/object/patch"
    );
    await editor.getByRole("button", { name: "确认提交到 main", exact: true }).click();
    const response = await rejected;
    expect(response.ok()).toBe(false);
    const failure = objectValue(JSON.parse(await response.text()) as unknown);
    if (typeof failure["code"] !== "string") throw new Error("Kernel rejection omitted its code");
    await expect(editor.getByRole("alert").first()).toContainText(failure["code"]);
    expect((await runtime.client.evolution.overview()).state).toBe(state);
    expect(await readValue(runtime, "branch/main", tightening.ref)).toEqual(before);
    expect(
      (await runtime.client.object.read({ at: "branch/main", refs: knowledgeRefs })).results
    ).toEqual(knowledge.results);
    if (tightening.kind === "required") await expect(required).toBeChecked();
    else if (tightening.kind === "unique") await expect(unique).toBeChecked();
    else if (tightening.kind === "label")
      await expect(editor.getByLabel("附加必需 Label 1", { exact: true })).toHaveValue("Reviewed");
    else
      await expect(editor.getByLabel("源端 Definition", { exact: true })).toHaveValue("node:Paper");
    await expect(editor.getByRole("status", { name: "真实提交回执", exact: true })).toHaveCount(0);
  });
}

function allIndexes(value: JsonObject): JsonObject[] {
  const indexes: JsonValue[] = Array.isArray(value["indexes"]) ? value["indexes"] : [];
  const properties = value["properties"];
  if (!Array.isArray(properties)) throw new Error("Definition omitted its required properties");
  return [
    ...indexes,
    ...properties.flatMap((entry) => {
      const propertyValue = objectValue(entry);
      return Array.isArray(propertyValue["indexes"]) ? propertyValue["indexes"] : [];
    })
  ].map(objectValue);
}

async function seedSharedIndex(runtime: RuntimeFixture, state: string): Promise<string> {
  const before = (await runtime.client.object.readText({ at: state, refs: ["node:Model"] }))
    .results[0]?.body;
  if (before === undefined) throw new Error("Model editable body is absent");
  const value = await readValue(runtime, state, "node:Model");
  value["indexes"] = [
    {
      name: "research_name",
      type: "fulltext",
      properties: ["name"],
      targets: ["node:Model", "node:Paper"]
    }
  ];
  const receipt = await runtime.client.object.patch({
    branch: "main",
    baseState: state,
    patch: changedObject("node:Model", before, JSON.stringify(value, null, 2))
  });
  for (const ref of ["node:Model", "node:Paper"])
    expect(allIndexes(await readValue(runtime, receipt.state, ref))).toContainEqual({
      name: "research_name",
      type: "fulltext",
      properties: ["name"],
      targets: ["node:Model", "node:Paper"]
    });
  return receipt.state;
}

async function confirm(page: Page, editor: Locator): Promise<void> {
  await editor.getByRole("button", { name: "查看 Patch", exact: true }).click();
  await expect(editor.getByRole("region", { name: "Patch 预览", exact: true })).toContainText(
    "前端检查通过"
  );
  await editor.getByRole("button", { name: "确认提交到 main", exact: true }).click();
  await expect(page.getByRole("status", { name: "真实提交回执", exact: true })).toContainText(
    "知识已提交"
  );
}

test("deletes a shared Index globally from one participating aggregate", async ({
  page,
  runtime,
  research
}) => {
  const state = await seedSharedIndex(runtime, research.state);
  const editor = await editAggregate(page, runtime, "node:Model");
  const rule = editor.locator(".aggregate-rule");
  await expect(rule.getByLabel("全部 targets 1", { exact: true })).toHaveValue("node:Model");
  await expect(rule.getByLabel("全部 targets 2", { exact: true })).toHaveValue("node:Paper");
  await rule.getByRole("button", { name: "删除全局共享索引", exact: true }).click();
  await editor.getByRole("button", { name: "查看 Patch", exact: true }).click();
  await expect(editor.locator(".known-impact")).toContainText(
    "删除全局共享索引 research_name；全部 targets：node:Model、node:Paper"
  );
  await editor.getByRole("button", { name: "确认提交到 main", exact: true }).click();
  await expect(editor.getByRole("status", { name: "真实提交回执", exact: true })).toContainText(
    "知识已提交"
  );
  const head = (await runtime.client.evolution.overview()).state;
  expect(head).not.toBe(state);
  for (const ref of ["node:Model", "node:Paper"])
    expect(
      allIndexes(await readValue(runtime, head, ref)).find(
        (index) => index["name"] === "research_name"
      )
    ).toBeUndefined();
  const indexes = await runtime.client.graph.query({
    at: head,
    cypher: "SHOW ALL INDEXES YIELD name WHERE name = 'research_name' RETURN count(name) AS value"
  });
  expect(indexes.rows).toEqual([[0]]);
});

test("changes shared Index targets while retaining its real database resource", async ({
  page,
  runtime,
  research
}) => {
  const state = await seedSharedIndex(runtime, research.state);
  const editor = await editAggregate(page, runtime, "node:Model");
  const rule = editor.locator(".aggregate-rule");
  await rule.getByRole("button", { name: "移除全部 targets 2", exact: true }).click();
  await expect(rule.getByLabel("全部 targets 1", { exact: true })).toHaveValue("node:Model");
  await expect(rule.getByLabel("全部 targets 2", { exact: true })).toHaveCount(0);
  await confirm(page, editor);
  const head = (await runtime.client.evolution.overview()).state;
  expect(head).not.toBe(state);
  expect(allIndexes(await readValue(runtime, head, "node:Model"))).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "research_name", type: "fulltext" })])
  );
  expect(
    allIndexes(await readValue(runtime, head, "node:Paper")).find(
      (index) => index["name"] === "research_name"
    )
  ).toBeUndefined();
  const indexes = await runtime.client.graph.query({
    at: head,
    cypher: "SHOW ALL INDEXES YIELD name WHERE name = 'research_name' RETURN count(name) AS value"
  });
  expect(indexes.rows).toEqual([[1]]);
});

test("deletes only Domain organization and retains every member Definition and Knowledge object", async ({
  page,
  runtime,
  research
}) => {
  const refs = [
    "node:Model",
    "node:Paper",
    "relationship:DESCRIBES",
    "relationship:RELATES",
    research.model,
    research.paper,
    research.unlabelled,
    ...research.describes,
    research.selfLoop,
    research.reverse
  ];
  const before = await runtime.client.object.read({ at: research.state, refs });
  const editor = await editAggregate(page, runtime, "domain:Research");
  await editor.getByRole("button", { name: "删除领域", exact: true }).click();
  await confirm(page, editor);
  const head = (await runtime.client.evolution.overview()).state;
  expect(head).not.toBe(research.state);
  expect((await runtime.client.object.read({ at: head, refs })).results).toEqual(before.results);
  await expect(
    runtime.client.object.read({ at: head, refs: ["domain:Research"] })
  ).rejects.toMatchObject({
    code: "OBJECT_NOT_FOUND"
  });
  expect(await readValue(runtime, head, "domain:Lab")).toMatchObject({
    name: "Lab",
    includes: ["node:Model"]
  });
});
