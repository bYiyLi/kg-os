// @vitest-environment happy-dom
import { useSyncExternalStore } from "react";
import { afterEach, expect, it } from "vitest";
import { type ObjectKind, type OntologyReadItem, type Summary } from "@kgos/sdk";

import { OntologyWorkspace } from "./ontology-workspace.js";
import { OntologyInspector } from "./ontology-inspector.js";
import { OntologyBrowser } from "./ontology-controller.js";
import { OntologyGraph } from "./ontology-graph.js";
import { fieldId } from "./edit-fields.js";
import { yamlDocument } from "./edit-yaml.js";
import { detail, rejected, stateA, stateB, versionHarness } from "./version-test-support.js";
import { clickVersionButton, mountVersionView, versionAct } from "./version-view-support.js";

const domain: Summary = { kind: "domain", ref: "domain:Research", name: "Research" };
const shared: Summary = { kind: "domain", ref: "domain:Shared", name: "Shared" };
const node: Summary = { kind: "node-definition", ref: "node:Thing", name: "Thing" };
const relation: Summary = {
  kind: "relationship-definition",
  ref: "relationship:Thing",
  name: "Thing",
  from: "node:Thing",
  to: "node:Outside"
};
const nodeBody =
  'name: "Thing"\nproperties: [{name: "name", type: "STRING", required: true, indexes: [{name: "ix_name", type: "fulltext"}]}, {name: "tag", type: "STRING"}]\nconstraints: [{name: "unique_pair", type: "key", properties: ["name", "tag"]}]\nindexes: [{name: "shared_name", type: "fulltext", targets: ["node:Thing", "node:Outside"], properties: ["name"]}]\n';
const cleanups: (() => Promise<void>)[] = [];
const page = (items: Summary[], ref?: string): OntologyReadItem => ({
  kind: ref === undefined ? "overview" : "domain",
  items,
  total: items.length,
  markdown: "read-only",
  ...(ref === undefined ? {} : { ref })
});

function LiveGraph({ browser }: { browser: OntologyBrowser }) {
  useSyncExternalStore(browser.subscribe, browser.snapshot);
  return <OntologyGraph browser={browser} />;
}

function aggregate(ref: string): { kind: ObjectKind; body: string } {
  if (ref.startsWith("domain:"))
    return {
      kind: "domain",
      body: `name: "${ref.slice(7)}"\nincludes: ["domain:Shared", "node:Thing", "relationship:Thing"]\n`
    };
  if (ref.startsWith("relationship:"))
    return {
      kind: "relationship-definition",
      body: `name: "${ref.slice(13)}"\nfrom: "node:Thing"\nto: "node:Outside"\nproperties: [{name: "source", type: "STRING"}]\nconstraints: []\n`
    };
  return {
    kind: "node-definition",
    body: nodeBody.replace('name: "Thing"', `name: "${ref.slice(5)}"`)
  };
}

async function setup() {
  const harness = await versionHarness();
  harness.handlers.set("evolution/branch/list", () => ({
    items: [{ name: "main", state: stateA }]
  }));
  harness.handlers.set("ontology/read", (request) => {
    const scope = (request["refs"] as string[] | undefined)?.[0];
    const second = request["cursor"] !== undefined;
    if (scope === undefined)
      return {
        state: stateA,
        results: [
          {
            ...page(second ? [node] : [domain, shared]),
            total: 3,
            ...(second ? {} : { cursor: "global-next" })
          }
        ]
      };
    return {
      state: stateA,
      results: [
        {
          ...page(second ? [relation] : [shared, node], scope),
          total: 3,
          ...(second ? {} : { cursor: "domain-next" })
        }
      ]
    };
  });
  harness.handlers.set("object/read", (request) => ({
    state: request["at"],
    results: (request["refs"] as string[]).map((ref) => {
      const item = aggregate(ref);
      const value: unknown = yamlDocument(item.body).toJS();
      return { ref, kind: item.kind, value };
    })
  }));
  harness.handlers.set("object/read-text", (request) => ({
    state: request["at"],
    results: (request["refs"] as string[]).map((ref) => ({ ref, ...aggregate(ref) }))
  }));
  harness.handlers.set("object/patch", () => ({ state: stateB, created: [], transitions: [] }));
  const view = await mountVersionView(<OntologyWorkspace {...harness} />);
  cleanups.push(async () => {
    await view.close();
    harness.records.stop();
  });
  return { ...harness, host: view.host };
}

async function input(id: string, value: string) {
  const field = document.getElementById(id);
  if (!(field instanceof HTMLInputElement)) throw new Error(`缺少字段 ${id}`);
  await versionAct(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  document.body.replaceChildren();
});

it("renders progressive Domain organization and accurate external endpoint context with manual scope pagination", async () => {
  const { host, calls } = await setup();
  expect(host.textContent).toContain("全局入口 · 已加载 2/3");
  await clickVersionButton("读取下一页");
  expect(host.textContent).toContain("已加载 3/3");
  await clickVersionButton("展开直接成员");
  expect(host.textContent).toContain("直接成员已展开");
  await clickVersionButton("domain:Research · Research");
  expect(host.textContent).toContain("未提供说明");
  await clickVersionButton("打开领域直接成员");
  expect(host.textContent).toContain("领域直接成员 · 已加载 2/3");
  await clickVersionButton("读取下一页");
  expect(host.textContent).toContain("node:Outside");
  expect(host.textContent).toContain("未加载范围");
  expect(
    calls
      .filter((call) => call.route === "ontology/read")
      .every((call) => call.body["at"] === stateA)
  ).toBe(true);
  await clickVersionButton("全部本体");
  expect(host.textContent).toContain("全局入口");
});

it("initializes each new graph at its first loaded node without resetting pan or existing layout on expansion", async () => {
  const setupData = await versionHarness();
  const browser = new OntologyBrowser(setupData.connection, setupData.context);
  browser.state = stateA;
  const view = await mountVersionView(<LiveGraph browser={browser} />);
  cleanups.push(async () => {
    await view.close();
    browser.dispose();
    setupData.records.stop();
  });
  const viewport = view.host.querySelector(".ontology-canvas");
  if (!(viewport instanceof HTMLDivElement)) throw new Error("Graph viewport is absent");
  expect(viewport.scrollLeft).toBe(0);
  await versionAct(() => {
    browser.pages.set("", page([domain, shared]));
    browser.changed();
  });
  expect(viewport.scrollLeft).toBe(500);
  const card = view.host.querySelector('[aria-label="领域 domain:Research"]');
  expect(card).not.toBeNull();
  const position = card?.getAttribute("transform");
  expect(position).toBe("translate(520,20)");
  viewport.scrollLeft = 120;
  viewport.scrollTop = 60;
  await versionAct(() => {
    browser.pages.set(domain.ref, page([shared, node, relation], domain.ref));
    browser.changed();
  });
  expect(viewport.scrollLeft).toBe(120);
  expect(viewport.scrollTop).toBe(60);
  expect(card?.getAttribute("transform")).toBe(position);
  await versionAct(() => {
    browser.changed();
  });
  expect(viewport.scrollLeft).toBe(120);
  await versionAct(() => {
    browser.scope = domain.ref;
    browser.changed();
  });
  expect(viewport.scrollLeft).toBe(500);
  expect(viewport.scrollTop).toBe(0);
  await versionAct(() => {
    browser.state = stateB;
    browser.scope = undefined;
    browser.pages.clear();
    browser.changed();
  });
  viewport.scrollLeft = 80;
  await versionAct(() => {
    browser.pages.set("", page([node]));
    browser.changed();
  });
  expect(viewport.scrollLeft).toBe(0);
  expect(viewport.scrollTop).toBe(0);
  expect(browser.selected).toBeUndefined();
});

it("reads structured definition details, real rules/targets, keyboard-selected graph nodes and canonical text at the same State", async () => {
  const { host, calls } = await setup();
  await clickVersionButton("读取下一页");
  const graphNode = host.querySelector('[role="button"][aria-label="节点定义 node:Thing"]');
  await versionAct(() => {
    graphNode?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  expect(host.textContent).toContain("required");
  expect(host.textContent).toContain("unique_pair");
  expect(host.textContent).toContain("shared_name");
  expect(host.textContent).toContain("node:Outside");
  expect(host.textContent).toContain("未展开、未翻页范围仍未知");
  const canonical = [...host.querySelectorAll("details")].find(
    (item) => item.querySelector("summary")?.textContent === "同 State canonical YAML"
  );
  await versionAct(() => {
    if (canonical !== undefined) {
      canonical.open = true;
      canonical.dispatchEvent(new Event("toggle"));
    }
  });
  expect(host.textContent).toContain(nodeBody);
  await versionAct(() => {
    graphNode?.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
  });
  await versionAct(() => {
    graphNode?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(
    calls
      .filter((call) => call.route === "object/read-text")
      .every((call) => call.body["at"] === stateA)
  ).toBe(true);
});

it("uses known exact Refs and separates Definition endpoints from Domain membership", async () => {
  const { host } = await setup();
  await input("ontology-known-ref", "relationship:Thing");
  await clickVersionButton("读取准确 Ref");
  expect(host.textContent).toContain("from · 类型约束");
  await clickVersionButton("node:Outside");
  expect(host.querySelector('[aria-label="本体聚合详情"]')?.textContent).toContain(
    "节点定义 · Outside"
  );
  await input("ontology-known-ref", "domain:Research");
  await clickVersionButton("读取准确 Ref");
  expect(host.textContent).toContain("领域允许多父与循环");
  await clickVersionButton("relationship:Thing");
  expect(host.textContent).toContain("关系定义 · Thing");
});

it("creates and edits model aggregates as drafts and requires one shared Object Patch confirmation", async () => {
  const { host, records, calls } = await setup();
  await clickVersionButton("新建节点定义");
  const slot = records.slots[0];
  const ref = (slot?.data["entries"] as { ref: string }[])[0]?.ref ?? "";
  await input(fieldId(ref, ["name"]), "NewType");
  await clickVersionButton("查看 Patch");
  expect(host.textContent).toContain("至少声明一个字段");
  await clickVersionButton("返回编辑");
  await clickVersionButton("添加字段");
  await input(fieldId(ref, ["properties", 0, "name"]), "value");
  await clickVersionButton("查看 Patch");
  expect(host.textContent).toContain("前端检查通过");
  expect(calls.some((call) => call.route === "object/patch")).toBe(false);
  await clickVersionButton("确认提交到 main");
  expect(calls.filter((call) => call.route === "object/patch")).toHaveLength(1);
  await clickVersionButton("关闭对象草稿");
  await clickVersionButton("新建关系定义");
  expect(host.textContent).toContain("此端不限制类型");
  await clickVersionButton("关闭对象草稿");
  await clickVersionButton("关闭并保留已保存版本");
  await clickVersionButton("新建领域");
  expect(host.textContent).toContain("直接成员 Ref");
});

it("edits the selected aggregate and opens a specific persisted object draft in place", async () => {
  const { host, records } = await setup();
  await input("ontology-known-ref", "node:Thing");
  await clickVersionButton("读取准确 Ref");
  await clickVersionButton("编辑聚合");
  expect(host.textContent).toContain("全部 targets");
  await clickVersionButton("保存草稿");
  await clickVersionButton("关闭对象草稿");
  const slot = records.slots[0];
  const label = `main · editing · ${slot?.id.slice(0, 8) ?? ""}`;
  await clickVersionButton(label);
  expect(host.textContent).toContain("对象草稿");
  expect(host.textContent).toContain("shared_name");
});

it("shows local consistency failure instead of empty-model success or a truncated editable aggregate", async () => {
  const setupData = await versionHarness();
  setupData.handlers.set("ontology/read", () => rejected("CONSISTENCY_ERROR"));
  setupData.handlers.set("evolution/get", () => ({
    ...detail(),
    consistency: {
      status: "invalid",
      issues: [{ code: "CONSISTENCY_ERROR", message: "invalid snapshot" }]
    }
  }));
  const view = await mountVersionView(<OntologyWorkspace {...setupData} />);
  cleanups.push(async () => {
    await view.close();
    setupData.records.stop();
  });
  expect(view.host.textContent).toContain("State consistency 诊断");
  expect(view.host.textContent).not.toContain("没有可发现的本体");
});

it("preserves null model ends and malformed read errors, and bounds graph rendering", async () => {
  const setupData = await versionHarness();
  const browser = new OntologyBrowser(setupData.connection, setupData.context);
  browser.state = stateA;
  browser.detail = {
    kind: "relationship-definition",
    ref: "relationship:LINK",
    value: {
      name: "LINK",
      from: null,
      to: null,
      properties: [{ name: "source", type: "STRING" }],
      constraints: []
    }
  };
  const view = await mountVersionView(
    <>
      <OntologyInspector browser={browser} onEdit={() => undefined} />
      <OntologyGraph browser={browser} />
    </>
  );
  cleanups.push(async () => {
    await view.close();
    browser.dispose();
    setupData.records.stop();
  });
  expect(view.host.textContent).toContain("此端不限制类型（null）");
  expect(view.host.textContent).not.toContain("Any");
  browser.detail = { kind: "node-definition", ref: "node:Broken", value: [] };
  await view.close();
  const broken = await mountVersionView(
    <OntologyInspector browser={browser} onEdit={() => undefined} />
  );
  cleanups.push(broken.close);
  expect(broken.host.textContent).toContain("无法无损解释");
});
