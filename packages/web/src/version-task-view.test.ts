// @vitest-environment happy-dom
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { ChangesWorkspace, ChangeComparison } from "./version-change-view.js";
import { RefsWorkspace } from "./version-ref-view.js";
import { VersionRefs } from "./version-refs.js";
import { StateWorkspace } from "./version-state-view.js";
import {
  detail,
  rejected,
  stateA,
  stateB,
  stateC,
  versionHarness
} from "./version-test-support.js";
import {
  clickVersionButton,
  mountVersionView,
  versionAct,
  versionField
} from "./version-view-support.js";

describe("State detail and refs forms", () => {
  it("edits JSON annotation proposals, compares restored sidecars and navigates actual immutable parents", async () => {
    const harness = await versionHarness();
    harness.handlers.set("evolution/get", (body) => ({
      ...detail(typeof body["state"] === "string" ? body["state"] : stateA),
      parents: body["state"] === stateA ? [stateB] : [],
      consistency: {
        status: "invalid",
        issues: [{ code: "BINDING_MISSING", message: "public issue" }]
      }
    }));
    harness.handlers.set("evolution/state/set-data", (body) => ({
      state: stateA,
      data: body["data"]
    }));
    harness.handlers.set("evolution/state/clear-data", () => ({ state: stateA }));
    const mounted = await mountVersionView(
      createElement(StateWorkspace, { ...harness, state: stateA })
    );
    expect(mounted.host.textContent).toContain("BINDING_MISSING");
    await versionField("注释 JSON", "{");
    await clickVersionButton("确认设置注释");
    expect(mounted.host.textContent).toContain("合法 JSON");
    await clickVersionButton("设为 JSON null 草稿");
    await clickVersionButton("确认设置注释");
    expect(mounted.host.textContent).toContain("显式 JSON null");
    await clickVersionButton("清除注释草稿");
    await clickVersionButton("确认清除注释");
    expect(mounted.host.textContent).toContain("ABSENT");
    await clickVersionButton("重读当前注释");
    expect(mounted.host.textContent).toContain("恢复 / 核对原观察值");
    await clickVersionButton("已比较，继续编辑当前注释");
    await clickVersionButton(stateB);
    expect(mounted.host.textContent).toContain("没有 parent");
    await clickVersionButton("按此 State 浏览");
    expect(harness.context.state).toBe(stateB);
    await mounted.close();
    harness.records.stop();
  });

  it("retains State read errors and exposes only actual ref CRUD plus explicit empty-delta creation", async () => {
    const harness = await versionHarness();
    harness.handlers.set("evolution/get", () => rejected("STATE_NOT_FOUND"));
    const stateView = await mountVersionView(
      createElement(StateWorkspace, { ...harness, state: stateA })
    );
    expect(stateView.host.textContent).toContain("STATE_NOT_FOUND");
    await clickVersionButton("重读 State");
    await stateView.close();
    harness.handlers.set("evolution/branch/list", () => ({
      items: [
        { name: "main", state: stateA },
        { name: "side", state: stateB }
      ]
    }));
    harness.handlers.set("evolution/tag/list", () => ({
      items: [{ name: "review", state: stateA }]
    }));
    harness.handlers.set("evolution/branch/delete", () => rejected("INVALID_ARGUMENT"));
    for (const route of ["branch/create", "tag/create", "tag/move", "tag/delete"])
      harness.handlers.set(`evolution/${route}`, (body) => ({ name: body["name"], state: stateC }));
    harness.handlers.set("evolution/state/create", () => ({ state: stateC }));
    const model = new VersionRefs(harness.context);
    const mounted = await mountVersionView(
      createElement(RefsWorkspace, { model, context: harness.context })
    );
    await clickVersionButton("读取 Branch / Tag 列表");
    await clickVersionButton("删除 ref main");
    expect(mounted.host.textContent).toContain("INVALID_ARGUMENT");
    await versionField("名称", "fresh");
    await clickVersionButton("确认创建");
    expect(harness.calls.find((call) => call.route === "evolution/branch/create")?.body).toEqual({
      name: "fresh",
      from: stateA
    });
    await versionField("类别", "tag");
    await versionField("名称", "review");
    await versionField("动作", "move");
    await versionField("明确 target StateRef", stateC);
    await clickVersionButton("确认移动 Tag");
    expect(mounted.host.textContent).toContain("已观察旧目标");
    await versionField("动作", "delete");
    await clickVersionButton("确认删除 ref");
    expect(harness.calls.find((call) => call.route === "evolution/tag/delete")?.body).toEqual({
      name: "review"
    });
    const checkbox = mounted.host.querySelector<HTMLInputElement>("input[type=checkbox]");
    await versionAct(() => {
      checkbox?.click();
    });
    await versionField("初始 JSON value", "{");
    await clickVersionButton("确认创建 State");
    expect(mounted.host.textContent).toContain("必须是合法 JSON");
    await versionField("初始 JSON value", "null");
    await versionField("Author", "person");
    await versionField("提交说明", "empty");
    await clickVersionButton("确认创建 State");
    expect(
      harness.calls.find((call) => call.route === "evolution/state/create")?.body
    ).toMatchObject({ data: null, message: "empty", author: "person" });
    expect(harness.context.state).toBe(stateA);
    await clickVersionButton(`查看新 State ${stateC}`);
    await mounted.close();
    harness.records.stop();
  });
});

describe("History and Diff readers", () => {
  it.each(["diff", "history"] as const)(
    "renders and filters exact %s fragments, paged values and full State+Ref objects",
    async (mode) => {
      const harness = await versionHarness();
      const before =
        '{"score":1.0,"negative":-0.0,"typed":{"$type":"Integer","value":"9007199254740993"}}';
      const after = '{"score":1,"negative":0}';
      const change = `{"change":"update","kind":"knowledge-node","path":"/properties","beforeRef":"n:1","afterRef":"n:1","before":${before},"after":${after}}`;
      const empty =
        '{"change":"update","kind":"knowledge-node","path":"/properties/optional","beforeRef":"n:2","afterRef":"n:2","before":null}';
      harness.handlers.set(`evolution/${mode}`, (body) => {
        const metadata = mode === "history" ? { root: stateA } : { before: stateB, after: stateA };
        const item = body["cursor"] === undefined ? change : empty;
        const row =
          mode === "history"
            ? `{"state":${JSON.stringify(stateA)},"parents":[${JSON.stringify(stateB)}],"change":${item}}`
            : item;
        return new Response(
          `${JSON.stringify(metadata).slice(0, -1)},"items":[${row}]${body["cursor"] === undefined ? ',"cursor":"next"' : ""}}`
        );
      });
      harness.handlers.set(
        "object/read",
        (body) =>
          new Response(
            `{"state":${JSON.stringify(body["at"])},"results":[{"kind":"knowledge-node","ref":"n:1","value":{"properties":${body["at"] === stateB ? before : after}}}]}`
          )
      );
      const mounted = await mountVersionView(
        createElement(ChangesWorkspace, {
          connection: harness.connection,
          state: stateA,
          states: [stateB, stateA],
          mode
        })
      );
      await clickVersionButton(mode === "diff" ? "比较两 State" : "读取业务历史");
      await versionField("在已加载 Change 内筛选", "1.0");
      expect(mounted.host.querySelectorAll(".change-row")).toHaveLength(1);
      await clickVersionButton("update · knowledge-node · n:1");
      expect(
        [...mounted.host.querySelectorAll(".change-columns pre")].map((node) => node.textContent)
      ).toEqual([before, after]);
      await clickVersionButton("读取两侧完整对象");
      expect(
        [...mounted.host.querySelectorAll(".change-side pre")].map((node) => node.textContent)
      ).toEqual([`{"properties":${before}}`, `{"properties":${after}}`]);
      await clickVersionButton("关闭公开对象变化");
      await versionField("在已加载 Change 内筛选", "");
      await clickVersionButton("加载更多 Change");
      await clickVersionButton("update · knowledge-node · n:2");
      expect(mounted.host.querySelector(".change-columns pre")?.textContent).toBe("null");
      expect(mounted.host.textContent).toContain("ABSENT · 未提供值");
      await mounted.close();
      harness.records.stop();
    }
  );

  it("keeps per-change rows, scope anchor and paged filters; reads complete objects from lawful sides", async () => {
    const harness = await versionHarness();
    const change = {
      change: "rename",
      kind: "node-definition" as const,
      path: "",
      beforeRef: "node:Old",
      afterRef: "node:New",
      before: null,
      after: { name: "New" },
      relatedRefs: ["node:Related"]
    };
    harness.handlers.set("evolution/history", () => ({
      root: stateA,
      items: [
        { state: stateA, parents: [stateB, stateC], change },
        { state: stateA, parents: [stateB], change: null },
        ...Array.from({ length: 22 }, () => ({ state: stateB, parents: [], change }))
      ],
      cursor: "more"
    }));
    harness.handlers.set("object/read", (body) => ({
      state: body["at"],
      results: [
        {
          ref: Array.isArray(body["refs"]) ? body["refs"][0] : "",
          kind: "node-definition",
          value: { name: "actual" }
        }
      ]
    }));
    const mounted = await mountVersionView(
      createElement(ChangesWorkspace, {
        connection: harness.connection,
        state: stateA,
        states: [stateA, stateB, stateC],
        mode: "history"
      })
    );
    await versionField("范围", "object");
    await versionField("Object Ref", "node:New");
    await versionField("Object anchor State", stateA);
    await clickVersionButton("读取业务历史");
    expect(mounted.host.textContent).toContain("空 Snapshot delta");
    expect(mounted.host.querySelectorAll(".change-row")).toHaveLength(20);
    await clickVersionButton("下一片段");
    await clickVersionButton("上一片段");
    await versionField("在已加载 Change 内筛选", "impossible");
    expect(mounted.host.querySelectorAll(".change-row")).toHaveLength(0);
    await versionField("在已加载 Change 内筛选", "");
    await clickVersionButton("rename · node-definition · node:New");
    expect(mounted.host.textContent).toContain("rename continuity");
    expect(mounted.host.textContent).toContain("node:Related");
    await clickVersionButton("读取两侧完整对象");
    expect(
      harness.calls.filter((call) => call.route === "object/read").map((call) => call.body["at"])
    ).toEqual([stateB, stateA]);
    await clickVersionButton("关闭公开对象变化");
    await clickVersionButton("加载更多 Change");
    expect(
      harness.calls.filter((call) => call.route === "evolution/history").at(-1)?.body
    ).toMatchObject({
      root: stateA,
      object: { anchorState: stateA, ref: "node:New" },
      cursor: "more"
    });
    await mounted.close();
    harness.records.stop();
  });

  it("shows empty Diff separately from failures and never fills absent sides from a fragment", async () => {
    const harness = await versionHarness();
    harness.handlers.set("evolution/diff", () => ({ before: stateB, after: stateA, items: [] }));
    const mounted = await mountVersionView(
      createElement(ChangesWorkspace, {
        connection: harness.connection,
        state: stateA,
        states: [stateB, stateA],
        mode: "diff"
      })
    );
    await versionField("Before StateRef", stateB);
    await versionField("After StateRef", stateA);
    await clickVersionButton("比较两 State");
    expect(mounted.host.textContent).toContain("没有 Snapshot 差异");
    harness.handlers.set("evolution/diff", () => rejected("CONSISTENCY_ERROR"));
    await clickVersionButton("比较两 State");
    expect(mounted.host.textContent).toContain("CONSISTENCY_ERROR");
    await mounted.close();
    harness.handlers.set("object/read", () => rejected("OBJECT_NOT_FOUND"));
    const comparison = await mountVersionView(
      createElement(ChangeComparison, {
        connection: harness.connection,
        before: stateB,
        after: stateA,
        change: {
          change: "add",
          kind: "knowledge-node",
          path: "/properties/x",
          afterRef: "n:1",
          after: null
        },
        onClose: () => undefined
      })
    );
    expect(comparison.host.textContent).toContain("ABSENT · 未提供值");
    await clickVersionButton("读取两侧完整对象");
    expect(comparison.host.textContent).toContain("这一侧不存在");
    expect(comparison.host.textContent).toContain("OBJECT_NOT_FOUND");
    expect(harness.calls.filter((call) => call.route === "object/read")).toHaveLength(1);
    await comparison.close();
    harness.records.stop();
  });
});

describe("annotation result reconciliation surface", () => {
  it("shows exact normalized JSON and keeps unsent input when a Float changes to Integer in the same State", async () => {
    const harness = await versionHarness();
    const original =
      '{"integer":{"$type":"Integer","value":"9007199254740993"},"typed":1.0,"negative":-0.0}';
    const changed = original.replace('"typed":1.0', '"typed":1');
    const response = (source: string) =>
      new Response(
        JSON.stringify({ ...detail(), hasData: true }).replace('"data":null', `"data":${source}`)
      );
    harness.handlers.set("evolution/get", () => response(original));
    const mounted = await mountVersionView(
      createElement(StateWorkspace, { ...harness, state: stateA })
    );
    expect(mounted.host.querySelector("textarea")?.value).toBe(original);
    expect(mounted.host.querySelector("pre")?.textContent).toBe(original);
    await versionField("注释 JSON", '{"retained":1.0}');
    harness.handlers.set("evolution/get", () => response(changed));
    await clickVersionButton("重读当前注释");
    expect(mounted.host.querySelector("textarea")?.value).toBe('{"retained":1.0}');
    expect(mounted.host.textContent).toContain("当前注释与原观察值不同");
    expect([...mounted.host.querySelectorAll("pre")].map((value) => value.textContent)).toEqual([
      changed,
      original
    ]);
    const button = [...mounted.host.querySelectorAll("button")].find(
      (value) => value.textContent === "确认设置注释"
    );
    expect(button?.disabled).toBe(true);
    await clickVersionButton("已比较，继续编辑当前注释");
    expect(
      harness.records.slots.find((slot) => slot.kind === "draft")?.data["observedSource"]
    ).toBe(changed);
    expect(harness.calls.some((call) => call.route === "evolution/state/set-data")).toBe(false);
    await mounted.close();
    harness.records.stop();
  });

  it("marks legacy parsed observations as precision incomplete without replacing their raw drafts", async () => {
    const harness = await versionHarness();
    harness.records.add("draft", {
      version: 1,
      subtype: "state-data",
      state: stateA,
      hasData: true,
      data: { typed: 1 },
      text: '{"retained":1.0}',
      intent: "set",
      pending: false
    });
    harness.handlers.set("evolution/get", () => ({
      ...detail(),
      hasData: true,
      data: { typed: 1 }
    }));
    const mounted = await mountVersionView(
      createElement(StateWorkspace, { ...harness, state: stateA })
    );
    expect(mounted.host.querySelector("textarea")?.value).toBe('{"retained":1.0}');
    expect(mounted.host.textContent).toContain("精度信息不足");
    expect(mounted.host.textContent).not.toContain("当前注释与原观察值相同");
    await clickVersionButton("已比较，继续编辑当前注释");
    expect(harness.calls.some((call) => call.route === "evolution/state/set-data")).toBe(false);
    await mounted.close();
    harness.records.stop();
  });

  it("rereads a preserved raw annotation after explicit reconnect before enabling set", async () => {
    const harness = await versionHarness();
    const mounted = await mountVersionView(
      createElement(StateWorkspace, { ...harness, state: stateA })
    );
    await versionField("注释 JSON", "{");
    await versionAct(() => {
      harness.connection.disconnect();
    });
    harness.handlers.set("evolution/get", () => ({ ...detail(), hasData: true, data: "remote" }));
    await versionAct(async () => {
      await harness.connection.connect("new credential");
    });
    expect(mounted.host.querySelector("textarea")?.value).toBe("{");
    expect(mounted.host.textContent).toContain("当前注释与原观察值不同");
    expect(
      [...mounted.host.querySelectorAll("button")].find(
        (button) => button.textContent === "确认设置注释"
      )?.disabled
    ).toBe(true);
    expect(harness.calls.some((call) => call.route === "evolution/state/set-data")).toBe(false);
    await mounted.close();
    harness.records.stop();
  });

  it("keeps read/check available after a lost set and requires explicit comparison before another write", async () => {
    const harness = await versionHarness();
    harness.handlers.set("evolution/state/set-data", () => {
      throw new Error("lost response");
    });
    const mounted = await mountVersionView(
      createElement(StateWorkspace, { ...harness, state: stateA })
    );
    await versionField("注释 JSON", "null");
    await clickVersionButton("确认设置注释");
    expect(mounted.host.textContent).toContain("结果待核对");
    harness.handlers.set("evolution/get", () => ({ ...detail(), hasData: true, data: null }));
    await clickVersionButton("重读当前注释");
    await clickVersionButton("已比较，继续编辑当前注释");
    expect(mounted.host.textContent).toContain("已确认比较");
    expect(harness.calls.filter((call) => call.route === "evolution/state/set-data")).toHaveLength(
      1
    );
    await mounted.close();
    harness.records.stop();
  });
});
