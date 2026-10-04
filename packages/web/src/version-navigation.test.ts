// @vitest-environment happy-dom
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { VersionPanel } from "./version-panel.js";
import { VersionHistory } from "./version-history.js";
import { VersionTimeline } from "./version-timeline.js";
import { stateA, stateB, stateC, summary, versionHarness } from "./version-test-support.js";
import {
  clickVersionButton,
  mountVersionView,
  versionAct,
  versionField
} from "./version-view-support.js";

describe("version navigation surfaces", () => {
  it("restores the saved task at its original State once without adopting other-window view changes", async () => {
    const harness = await versionHarness();
    const layout = harness.records.add("workspace", {
      version: 1,
      state: stateA,
      versionView: "state",
      versionDetailState: stateB,
      otherDisplaySetting: "retained"
    });
    const mounted = await mountVersionView(createElement(VersionPanel, harness));
    expect(mounted.host.querySelector("dialog")?.getAttribute("aria-label")).toBe("State 详情");
    expect(mounted.host.textContent).toContain(stateB);
    expect(harness.context.state).toBe(stateA);
    await versionAct(() => {
      layout.edit({ ...layout.data, versionView: "refs", versionDetailState: stateC });
    });
    expect(mounted.host.querySelector("dialog")?.getAttribute("aria-label")).toBe("State 详情");
    expect(mounted.host.textContent).toContain(stateB);
    await clickVersionButton("关闭State 详情");
    expect(layout.data["versionView"]).toBe("");
    expect(layout.data["otherDisplaySetting"]).toBe("retained");
    await clickVersionButton("展开 DAG");
    expect(layout.data["versionView"]).toBe("dag");
    expect(layout.data["versionDetailState"]).toBe(stateA);
    await mounted.close();
    harness.records.stop();
  });

  it("windows compact history, restores/save anchors and overlays a real DAG without replacing the list", async () => {
    const harness = await versionHarness();
    const layout = harness.records.add("workspace", {
      version: 1,
      versionListScroll: 312,
      versionRoot: stateA,
      state: stateA
    });
    const items = [
      summary(stateA, [stateB, stateC]),
      summary(stateB, [stateC]),
      summary(stateC),
      ...Array.from({ length: 40 }, (_, index) => ({
        ...summary(`commit/${String(index).padStart(64, "0")}`),
        author: "Author",
        message: `Item ${String(index)}`
      }))
    ];
    harness.handlers.set("evolution/ancestry", () => ({ root: stateA, items, cursor: "more" }));
    const mounted = await mountVersionView(createElement(VersionPanel, harness));
    const compact = mounted.host.querySelector<HTMLDivElement>(".version-timeline");
    expect(compact?.scrollTop).toBe(312);
    expect(mounted.host.querySelectorAll(".version-node").length).toBeLessThanOrEqual(16);
    await versionAct(() => {
      if (compact !== null) {
        compact.scrollTop = 1200;
        compact.dispatchEvent(new Event("scroll", { bubbles: true }));
      }
    });
    expect(layout.data["versionListScroll"]).toBe(1200);
    await clickVersionButton("展开 DAG");
    expect(mounted.host.querySelector("dialog")?.getAttribute("aria-label")).toBe(
      "版本 ancestry DAG"
    );
    expect(mounted.host.querySelectorAll(".expanded .version-node").length).toBeLessThanOrEqual(16);
    expect(mounted.host.querySelectorAll(".dag-edges path").length).toBeGreaterThan(1);
    await clickVersionButton("关闭版本 ancestry DAG");
    expect(mounted.host.querySelector(".version-timeline")).toBe(compact);
    expect(compact?.scrollTop).toBe(1200);
    await versionField("已加载历史内搜索", "no matching state");
    expect(mounted.host.textContent).toContain("已加载范围内没有匹配");
    await versionField("已加载历史内搜索", "");
    await versionField("StateRef", stateB);
    await clickVersionButton("定位 StateRef");
    expect(harness.context.state).toBe(stateB);
    await clickVersionButton("以当前浏览 State 加载 ancestry");
    expect(
      harness.calls.filter((call) => call.route === "evolution/ancestry").at(-1)?.body["root"]
    ).toBe(stateB);
    await versionAct(() => {
      harness.context.branches = [{ name: "main", state: stateC }];
      harness.context.inputRef = "branch/main";
      harness.context.changed();
    });
    await clickVersionButton("加载新 head 的 ancestry");
    expect(
      harness.calls.filter((call) => call.route === "evolution/ancestry").at(-1)?.body
    ).not.toHaveProperty("cursor");
    await mounted.close();
    harness.records.stop();
  });

  it("keeps actual unloaded-parent endpoints, filtering and read errors local to the timeline", async () => {
    const harness = await versionHarness();
    const history = new VersionHistory(harness.connection);
    harness.handlers.set("evolution/ancestry", () => ({
      root: stateA,
      items: [summary(stateA, [stateB])],
      cursor: "parent page"
    }));
    await history.open(stateA);
    harness.context.tags = [{ name: "review", state: stateA }];
    const mounted = await mountVersionView(
      createElement(VersionTimeline, {
        history,
        context: harness.context,
        filter: "no matches",
        expanded: true,
        onDetails: () => undefined
      })
    );
    expect(mounted.host.textContent).toContain("tag/review");
    expect(mounted.host.textContent).toContain("虚线表示尚未加载");
    expect(mounted.host.querySelector(".filtered-node")).not.toBeNull();
    await clickVersionButton(`继续加载 parent ${stateB.slice(7, 15)}`);
    expect(harness.calls.filter((call) => call.route === "evolution/ancestry")).toHaveLength(2);
    await versionAct(() => {
      history.error = "failed read";
      history.limited = true;
      history.changed();
    });
    expect(mounted.host.textContent).toContain("failed read");
    expect(mounted.host.textContent).toContain("4000 条范围");
    await mounted.close();
    harness.records.stop();
  });

  it("opens task entrances and uses the same close/cancel route without aborting a Merge Session", async () => {
    const harness = await versionHarness();
    harness.handlers.set("evolution/ancestry", () => ({ root: stateA, items: [summary()] }));
    const mounted = await mountVersionView(createElement(VersionPanel, harness));
    await clickVersionButton("State 详情");
    expect(mounted.host.textContent).toContain("Immutable State metadata");
    await clickVersionButton("关闭State 详情");
    await clickVersionButton("业务历史");
    expect(mounted.host.textContent).toContain("History root");
    await clickVersionButton("关闭业务历史");
    await clickVersionButton("两 State 差异");
    expect(mounted.host.textContent).toContain("Before StateRef");
    await clickVersionButton("关闭两 State 差异");
    await clickVersionButton("Branch / Tag / State");
    expect(mounted.host.textContent).toContain("显式创建 State");
    await clickVersionButton("关闭Branch / Tag / State");
    await clickVersionButton("Merge Session");
    await versionAct(() => {
      mounted.host
        .querySelector("dialog")
        ?.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(mounted.host.querySelector("dialog")).toBeNull();
    expect(harness.calls.some((call) => call.route === "evolution/merge/abort")).toBe(false);
    await mounted.close();
    harness.records.stop();
  });
});
