// @vitest-environment happy-dom
import { type MergeConflict } from "@kgos/sdk";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { MergeController } from "./merge-controller.js";
import { MergeDraft } from "./merge-draft.js";
import { MergeWorkspace } from "./merge-workspace.js";
import { rejected, stateA, stateB, stateC, versionHarness } from "./version-test-support.js";
import {
  clickVersionButton,
  mountVersionView,
  versionAct,
  versionField
} from "./version-view-support.js";

const session = {
  session: "opaque/session",
  branch: "main",
  targetState: stateA,
  sourceState: stateB,
  revision: 1,
  status: "conflicted",
  unresolved: 2
};
const conflict: MergeConflict = {
  conflictId: "opaque/conflict-1",
  kind: "knowledge-node",
  path: "/properties/name",
  base: null,
  ours: "ours",
  theirs: "theirs",
  oursRef: "n:1",
  theirsRef: "n:1",
  relatedRefs: ["node:Related"]
};

describe("Merge task forms", () => {
  it("renders exact Float and typed conflict sides after paging without collapsing absent and null values", async () => {
    const harness = await versionHarness();
    const base = '{"score":1.0,"negative":-0.0}';
    const ours = '{"score":1,"negative":-0.0}';
    const theirs =
      '{"score":2.0,"negative":-0.0,"typed":{"$type":"Integer","value":"9007199254740993"}}';
    const first = `{"conflictId":"opaque/first","kind":"knowledge-node","path":"/properties","base":${base},"ours":${ours},"theirs":${theirs}}`;
    const second =
      '{"conflictId":"opaque/second","kind":"knowledge-node","path":"/properties","base":null,"theirs":-0.0}';
    harness.handlers.set("evolution/merge/start", () => session);
    harness.handlers.set(
      "evolution/merge/conflicts",
      (body) =>
        new Response(
          `{"session":"opaque/session","revision":1,"items":[${body["cursor"] === undefined ? first : second}]${body["cursor"] === undefined ? ',"cursor":"next"' : ""}}`
        )
    );
    const model = new MergeController(harness.connection, harness.context, harness.records);
    const mounted = await mountVersionView(
      createElement(MergeWorkspace, { model, context: harness.context })
    );
    await clickVersionButton("开始 Merge");
    expect(
      [...mounted.host.querySelectorAll(".conflict-value pre")].map((node) => node.textContent)
    ).toEqual([base, ours, theirs]);
    await clickVersionButton("加载更多冲突");
    await clickVersionButton("knowledge-node · /properties · opaque/second · 未解决");
    expect(mounted.host.querySelector(".conflict-value.base pre")?.textContent).toBe("null");
    expect(mounted.host.querySelector(".conflict-value.ours")?.textContent).toContain("ABSENT");
    expect(mounted.host.querySelector(".conflict-value.theirs pre")?.textContent).toBe("-0.0");
    expect(harness.calls.some((call) => call.route === "evolution/merge/resolve")).toBe(false);
    await mounted.close();
    harness.records.stop();
  });

  it("shows explicit reconciliation for a lost start even when no Session exists", async () => {
    const harness = await versionHarness();
    harness.handlers.set("evolution/merge/start", () => {
      throw new Error("lost start response");
    });
    const model = new MergeController(harness.connection, harness.context, harness.records);
    const mounted = await mountVersionView(
      createElement(MergeWorkspace, { model, context: harness.context })
    );
    await versionField("来源 StateRef", stateB);
    await clickVersionButton("开始 Merge");
    expect(mounted.host.textContent).toContain("结果待核对");
    await clickVersionButton("核对 start 结果 · Session / refs");
    await clickVersionButton("已核对结果，继续比较");
    expect(model.unknown).toBe(false);
    expect(harness.calls.filter((call) => call.route === "evolution/merge/start")).toHaveLength(1);
    await mounted.close();
    harness.records.stop();
  });

  it("reopens the last saved Session, checks live conflict identities, and keeps raw proposals if the Session disappears", async () => {
    const harness = await versionHarness();
    const workspace = harness.records.add("workspace", {
      version: 1,
      versionView: "merge",
      versionMergeSession: session.session,
      otherSetting: "retained"
    });
    const saved = new MergeDraft(session, harness.records);
    saved.choose(conflict, "value", "{", 1);
    harness.handlers.set("evolution/merge/get", () => ({ ...session, revision: 2 }));
    harness.handlers.set("evolution/merge/conflicts", () => ({
      session: session.session,
      revision: 2,
      items: [conflict]
    }));
    let model = new MergeController(harness.connection, harness.context, harness.records);
    let mounted = await mountVersionView(
      createElement(MergeWorkspace, { model, context: harness.context })
    );
    expect(model.session?.revision).toBe(2);
    expect(model.draft?.choices.get(conflict.conflictId)?.text).toBe("{");
    expect(model.draft?.choices.get(conflict.conflictId)?.checked).toBe(false);
    expect(mounted.host.querySelector("textarea")?.value).toBe("{");
    expect(workspace.data["otherSetting"]).toBe("retained");
    await versionAct(() => {
      harness.connection.disconnect();
    });
    expect(model.actionable).toBe(false);
    harness.handlers.set("evolution/merge/get", () => ({ ...session, revision: 3 }));
    harness.handlers.set("evolution/merge/conflicts", () => ({
      session: session.session,
      revision: 3,
      items: [conflict]
    }));
    await versionAct(async () => {
      await harness.connection.connect("new credential");
    });
    expect(model.session?.revision).toBe(3);
    expect(model.draft?.choices.get(conflict.conflictId)?.text).toBe("{");
    expect(model.draft?.choices.get(conflict.conflictId)?.checked).toBe(false);
    await mounted.close();
    harness.handlers.set("evolution/merge/get", () => rejected("MERGE_SESSION_NOT_FOUND"));
    model = new MergeController(harness.connection, harness.context, harness.records);
    mounted = await mountVersionView(
      createElement(MergeWorkspace, { model, context: harness.context })
    );
    expect(mounted.host.textContent).toContain("原 Session 的已保存输入");
    expect(mounted.host.textContent).toContain("MERGE_SESSION_NOT_FOUND");
    expect(model.recovery?.["choices"]).toHaveLength(1);
    expect(
      harness.calls.some((call) => /merge\/(start|resolve|finalize|abort)$/.test(call.route))
    ).toBe(false);
    await mounted.close();
    harness.records.stop();
  });

  it("displays exact pins, independent same-path conflicts and preserved invalid JSON without premature finalize", async () => {
    const harness = await versionHarness();
    harness.handlers.set("evolution/merge/start", () => session);
    harness.handlers.set("evolution/merge/get", () => session);
    harness.handlers.set("evolution/merge/list", () => ({ items: [session], cursor: "list page" }));
    harness.handlers.set("evolution/merge/conflicts", () => ({
      session: session.session,
      revision: 1,
      items: [
        conflict,
        {
          ...conflict,
          conflictId: "opaque/conflict-2",
          base: undefined,
          resolution: { choice: "ours" }
        }
      ],
      cursor: "more conflicts"
    }));
    const model = new MergeController(harness.connection, harness.context, harness.records);
    const mounted = await mountVersionView(
      createElement(MergeWorkspace, { model, context: harness.context })
    );
    await versionField("来源 StateRef", stateB);
    await clickVersionButton("开始 Merge");
    expect(mounted.host.textContent).toContain(stateB);
    expect(mounted.host.textContent).toContain("revision 1");
    expect(mounted.host.textContent).toContain("opaque/conflict-1");
    expect(mounted.host.textContent).toContain("opaque/conflict-2");
    await versionField("自定义 JSON 原文", "{");
    await clickVersionButton("确认保存当前解决方案 · resolve");
    expect(mounted.host.textContent).toContain("JSON");
    expect(model.draft?.choices.get("opaque/conflict-1")?.text).toBe("{");
    const radios = mounted.host.querySelectorAll<HTMLInputElement>("input[type=radio]");
    await versionAct(() => {
      radios[0]?.click();
    });
    expect(model.draft?.choices.get("opaque/conflict-1")?.choice).toBe("ours");
    await versionAct(() => {
      radios[1]?.click();
    });
    expect(model.draft?.choices.get("opaque/conflict-1")?.choice).toBe("theirs");
    await versionAct(() => {
      radios[2]?.click();
    });
    await versionField("自定义 JSON 原文", "null");
    await clickVersionButton("已比较当前 conflict identity");
    await clickVersionButton("重读 Session / refs");
    await clickVersionButton("knowledge-node · /properties/name · opaque/conflict-2 · 已有方案");
    expect(mounted.host.textContent).toContain("ABSENT · 该值未出现");
    await clickVersionButton("加载更多冲突");
    await versionField("Session token", session.session);
    await clickVersionButton("读取 Session");
    await clickVersionButton("刷新 Session 列表");
    await clickVersionButton("加载更多 Session");
    expect(harness.calls.filter((call) => call.route === "evolution/merge/finalize")).toHaveLength(
      0
    );
    await mounted.close();
    harness.records.stop();
  });

  it.each(["up_to_date", "fast_forward", "merged"])(
    "renders actual %s outcome with separately read final parents",
    async (status) => {
      const harness = await versionHarness();
      harness.handlers.set("evolution/merge/start", () => ({
        ...session,
        status: "ready",
        unresolved: 0
      }));
      harness.handlers.set("evolution/merge/conflicts", () => ({
        session: session.session,
        revision: 1,
        items: []
      }));
      harness.handlers.set("evolution/merge/finalize", () => ({
        status,
        targetState: stateA,
        sourceState: stateB,
        state: stateC
      }));
      harness.handlers.set("evolution/get", () => ({
        state: stateC,
        parents: [stateA, stateB],
        committedAt: 1
      }));
      const model = new MergeController(harness.connection, harness.context, harness.records);
      const mounted = await mountVersionView(
        createElement(MergeWorkspace, { model, context: harness.context })
      );
      await clickVersionButton("开始 Merge");
      await versionField("Merge author", "human");
      await versionField("Merge 提交说明", "final note");
      await clickVersionButton("确认完成合并 · finalize");
      expect(mounted.host.textContent).toContain(`实际 outcome · ${status}`);
      expect(mounted.host.textContent).toContain("从最终 State 实际读取的 parents");
      expect(model.resultState?.parents).toEqual([stateA, stateB]);
      await clickVersionButton("查看 final State");
      expect(harness.context.state).toBe(stateC);
      await mounted.close();
      harness.records.stop();
    }
  );
});
