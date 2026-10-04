// @vitest-environment happy-dom
import { useSyncExternalStore } from "react";
import { afterEach, expect, it } from "vitest";
import { type ObjectKind } from "@kgos/sdk";

import { ObjectDraft } from "./edit-controller.js";
import { draftData } from "./edit-data.js";
import { EntryFields, fieldId } from "./edit-fields.js";
import { yamlRaw, yamlString, yamlStrings } from "./edit-yaml.js";
import { mountVersionView, clickVersionButton, versionAct } from "./version-view-support.js";
import { stateA, versionHarness } from "./version-test-support.js";

const cleanups: (() => Promise<void>)[] = [];
const baseNode =
  'labels: ["Person"]\nproperties: {"name": "Alice", "big": {$type: "Integer", value: "9223372036854775807"}, "float": 1.0}\n';
const definition =
  'name: "Person"\ntitle: "人物"\ndescription: "说明"\nproperties: [{name: "name", type: "STRING"}]\nconstraints: []\n';
const personRef = "node:Person";

function Fields({ draft }: { draft: ObjectDraft }) {
  useSyncExternalStore(draft.subscribe, draft.snapshot);
  const entry = draft.data.entries[0];
  return entry === undefined ? null : <EntryFields draft={draft} entry={entry} />;
}

async function setup(kind: ObjectKind, body: string, ref = "n:1") {
  const harness = await versionHarness();
  const slot = harness.records.add(
    "draft",
    draftData({
      baseState: stateA,
      branch: "main",
      entries: [{ kind, ref, base: body, body, deleted: false }],
      inputs: {},
      status: "editing",
      patch: "",
      receipt: undefined
    })
  );
  const draft = new ObjectDraft(harness.connection, harness.context, harness.records, slot);
  const view = await mountVersionView(<Fields draft={draft} />);
  cleanups.push(async () => {
    await view.close();
    draft.dispose();
    harness.records.stop();
  });
  return { ...harness, draft, host: view.host, body: () => draft.data.entries[0]?.body ?? "" };
}

async function input(id: string, value: string) {
  const field = document.getElementById(id);
  if (!(
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    field instanceof HTMLSelectElement
  ))
    throw new Error(`缺少测试字段 ${id}`);
  const prototype = Object.getPrototypeOf(field) as object;
  await versionAct(() => {
    field.focus();
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
    field.dispatchEvent(
      new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })
    );
  });
}

async function checkbox(text: string) {
  const label = [...document.querySelectorAll("label")].find((label) =>
    label.textContent.includes(text)
  );
  const field = label?.querySelector("input");
  if (!(field instanceof HTMLInputElement)) throw new Error(`缺少 checkbox ${text}`);
  await versionAct(() => {
    field.click();
  });
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  document.body.replaceChildren();
});

it("edits scalar values and Property names without round-tripping untouched compound/Integer64/Float values", async () => {
  const { draft, body, host } = await setup("knowledge-node", baseNode);
  const original = body().slice(body().indexOf('"big"'));
  await input(fieldId("n:1", ["properties", "name"]), '"Bob"');
  expect(body()).toContain(original);
  expect(yamlString(body(), ["properties", "name"])).toBe("Bob");
  expect(
    host.querySelector<HTMLTextAreaElement>(`[id="${fieldId("n:1", ["properties", "big"])}"]`)
      ?.readOnly
  ).toBe(true);
  await input(`${fieldId("n:1", ["properties", "name"])}-name`, "title");
  expect(yamlString(body(), ["properties", "title"])).toBe("Bob");
  expect(yamlRaw(body(), ["properties", "float"])).toBe("1.0");
  await input(`${fieldId("n:1", ["properties", "title"])}-name`, "float");
  expect(draft.error).toContain("已存在");
  await input(fieldId("n:1", ["properties", "title"]), "[unfinished");
  expect(draft.preview().issues[0]?.path).toBe("/properties/title");
  await clickVersionButton("删除 Property title");
  expect(draft.data.inputs).toEqual({});
  await clickVersionButton("添加 Property");
  expect(body()).toContain('"property-3"');
});

it("supports zero/multiple Labels and actual Relationship Type/endpoint refs with request aliases", async () => {
  const node = await setup("knowledge-node", baseNode);
  await clickVersionButton("添加Label");
  await input(fieldId("n:1", ["labels", 1]), "Author");
  expect(yamlStrings(node.body(), ["labels"])).toEqual(["Person", "Author"]);
  await clickVersionButton("移除Label 1");
  await clickVersionButton("移除Label 1");
  expect(yamlStrings(node.body(), ["labels"])).toEqual([]);
  await cleanups.splice(0)[0]?.();
  const relation = await setup(
    "knowledge-relationship",
    'type: "LINK"\nstart: "n:1"\nend: "n:2"\nproperties: {}\n',
    "r:1"
  );
  await input(fieldId("r:1", ["type"]), "NEW_LINK");
  await input(fieldId("r:1", ["start"]), "new:knowledge-node:a");
  await input(fieldId("r:1", ["end"]), "n:9");
  expect(relation.draft.preview().issues).toEqual([]);
  expect(relation.host.textContent).toContain("实例端点");
});

it("marks explicit Property rename continuity, protects the last field, and keeps required/unique independent", async () => {
  const { draft, body, host } = await setup("node-definition", definition, personRef);
  expect(
    [...host.querySelectorAll("button")].find((button) => button.textContent === "删除字段 name")
      ?.disabled
  ).toBe(true);
  await input(fieldId(personRef, ["properties", 0, "name"]), "title");
  expect(yamlString(body(), ["properties", 0, "renameFrom"])).toBe("name");
  await input(fieldId(personRef, ["properties", 0, "name"]), "name");
  expect(yamlRaw(body(), ["properties", 0, "renameFrom"])).toBe("");
  await input(fieldId(personRef, ["properties", 0, "type"]), "STRING | INTEGER");
  await checkbox("required");
  await checkbox("unique");
  await checkbox("required");
  expect(yamlRaw(body(), ["properties", 0, "required"])).toBe("");
  expect(yamlRaw(body(), ["properties", 0, "unique"])).toBe("true");
  await clickVersionButton("添加字段");
  await input(fieldId(personRef, ["properties", 1, "name"]), "year");
  await clickVersionButton("删除字段 year");
  await input(fieldId(personRef, ["title"]), "显示标题");
  await clickVersionButton("省略标题 · 显示");
  expect(yamlRaw(body(), ["title"])).toBe("");
  await clickVersionButton("删除定义");
  expect(draft.data.entries[0]?.deleted).toBe(true);
});

it("creates aggregate constraints/indexes and shows global shared deletion with complete targets", async () => {
  const shared = `${definition}indexes: [{name: "shared", type: "fulltext", targets: [${JSON.stringify(personRef)}, "node:Paper"], properties: ["name"]}]\n`;
  const { draft, body, host } = await setup("node-definition", shared, personRef);
  expect(host.textContent).toContain("全部 targets");
  expect(host.textContent).toContain("全局资源");
  await input(fieldId(personRef, ["indexes", 0, "properties", 0]), "name");
  await input(fieldId(personRef, ["indexes", 0, "targets", 1]), "node:Document");
  await clickVersionButton("删除全局共享索引");
  expect(draft.preview().notes.join(" ")).toContain("node:Paper");
  const topIndexes = host.querySelector(".object-fields > .aggregate-rules:last-of-type");
  await versionAct(() => {
    topIndexes?.querySelector<HTMLButtonElement>("button")?.click();
  });
  await input(fieldId(personRef, ["indexes", 0, "name"]), "ix_name");
  await input(fieldId(personRef, ["indexes", 0, "type"]), "fulltext");
  await clickVersionButton("设置共享 targets");
  expect(yamlStrings(body(), ["indexes", 0, "targets"])).toEqual([personRef]);
  await clickVersionButton("添加有序字段");
  await input(fieldId(personRef, ["indexes", 0, "properties", 0]), "name");
  expect(yamlStrings(body(), ["indexes", 0, "properties"])).toEqual(["name"]);
});

it("preserves nullable model endpoints and Domain membership as distinct organization data", async () => {
  const relation = await setup(
    "relationship-definition",
    'name: "LINK"\nfrom: null\nto: null\nproperties: [{name: "source", type: "STRING"}]\nconstraints: []\n',
    "relationship:LINK"
  );
  expect(relation.host.textContent).toContain("此端不限制类型");
  await checkbox("此端不限制类型（null）");
  await input(fieldId("relationship:LINK", ["from"]), personRef);
  expect(yamlString(relation.body(), ["from"])).toBe(personRef);
  await checkbox("此端不限制类型（null）");
  expect(yamlRaw(relation.body(), ["from"])).toBe("null");
  await cleanups.splice(0)[0]?.();
  const domain = await setup(
    "domain",
    `name: "Content"\nincludes: [${JSON.stringify(personRef)}]\n`,
    "domain:Content"
  );
  await input(fieldId("domain:Content", ["name"]), "Shared");
  await clickVersionButton("添加直接成员 Ref");
  await input(fieldId("domain:Content", ["includes", 1]), "domain:Content");
  await versionAct(() => {
    expect(domain.draft.preview().issues).toEqual([]);
    expect(domain.draft.preview().patch).toContain("rename to domain:Shared");
  });
  await clickVersionButton("删除领域");
  await versionAct(() => {
    expect(domain.draft.preview().notes.join(" ")).toContain("不删除成员");
  });
});

it("preserves invalid documents and aliases in the expert editor without presenting lossy editable forms", async () => {
  const { draft, host } = await setup("knowledge-node", "[unfinished");
  expect(host.textContent).toContain("表单暂不可用");
  await versionAct(() => {
    draft.update("n:1", 'labels: []\nproperties: &props {"x": 1}\n');
  });
  expect(host.textContent).toContain("anchor / alias");
  await versionAct(() => {
    draft.update("n:1", "labels: null\nproperties: {}\n");
  });
  expect(host.textContent).toContain("labels 需要列表");
  await versionAct(() => {
    draft.update("n:1", "labels: []\nproperties: []\n");
  });
  expect(host.textContent).toContain("properties 需要 mapping");
  await versionAct(() => {
    draft.update("n:1", "[]");
  });
  expect(host.textContent).toContain("完整 YAML mapping");
});
