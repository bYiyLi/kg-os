import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";

import { StateDataDraft, StateDetail } from "./version-state.js";
import { detail, rejected, stateA, stateB, versionHarness } from "./version-test-support.js";

describe("mutable State Data drafts", () => {
  it.each(['{"big":9007199254740993}', "1e400", "1.0", "-0.0"])(
    "sends arbitrary annotation JSON %s without changing its raw numbers",
    async (text) => {
      const harness = await versionHarness();
      harness.handlers.set(
        "evolution/state/set-data",
        () => new Response(`{"state":${JSON.stringify(stateA)},"data":${text}}`)
      );
      const model = new StateDataDraft(harness.connection, stateA, detail(), harness.records);
      model.edit(text);
      await model.submit();
      expect(harness.calls.find((call) => call.route === "evolution/state/set-data")?.wire).toBe(
        `{"state":${JSON.stringify(stateA)},"data":${text}}`
      );
      expect(model.slot?.data["text"]).toBe(text);
      expect(model.slot?.data["version"]).toBe(1);
      expect(model.unknown).toBe(false);
      harness.records.stop();
    }
  );

  it("keeps immutable metadata separate and distinguishes JSON null from absence on set/clear", async () => {
    const harness = await versionHarness();
    harness.handlers.set("evolution/state/set-data", (body) => ({
      state: body["state"],
      data: body["data"]
    }));
    harness.handlers.set("evolution/state/clear-data", (body) => ({ state: body["state"] }));
    const model = new StateDataDraft(harness.connection, stateA, detail(), harness.records);
    model.edit("null");
    await model.submit();
    expect(model.live).toEqual({ hasData: true, data: null });
    expect(model.slot?.data).toMatchObject({
      version: 1,
      subtype: "state-data",
      state: stateA,
      text: "null",
      pending: false
    });
    expect(harness.calls.filter((call) => call.route === "evolution/state/set-data")).toHaveLength(
      1
    );
    expect(harness.calls.find((call) => call.route === "web/data/save")?.body["data"]).toEqual({
      version: 1,
      subtype: "state-data",
      state: stateA,
      intent: "set",
      text: "null",
      hasData: false,
      data: null,
      pending: true
    });
    model.edit("null", "clear");
    await model.submit();
    expect(model.live).toEqual({ hasData: false, data: null });
    expect(harness.calls.find((call) => call.route === "evolution/state/clear-data")?.body).toEqual(
      { state: stateA }
    );
    expect(harness.context.state).toBe(stateA);
    harness.records.stop();
  });

  it("retains invalid input and blocks sends when reliable draft saving fails", async () => {
    const harness = await versionHarness();
    const model = new StateDataDraft(harness.connection, stateA, detail(), harness.records);
    model.edit("{");
    await model.submit();
    expect(model.error).toContain("合法 JSON");
    expect(model.text).toBe("{");
    expect(model.slot?.data["text"]).toBe("{");
    harness.handlers.set("web/data/save", () => rejected("WEB_QUOTA_EXCEEDED"));
    model.edit("[1, null]");
    await model.submit();
    expect(model.error).toContain("尚未可靠保存");
    expect(harness.calls.filter((call) => call.route.startsWith("evolution/state/"))).toHaveLength(
      0
    );
    const missingStore = new StateDataDraft(harness.connection, stateA, detail(), undefined);
    await missingStore.submit();
    expect(missingStore.error).toContain("暂停发送");
    harness.records.stop();
  });

  it("freezes a confirmed set once, suppresses duplicate actions and edits while save is in flight", async () => {
    const harness = await versionHarness();
    const saving = Promise.withResolvers<unknown>();
    harness.handlers.set("web/data/save", () => saving.promise);
    const model = new StateDataDraft(harness.connection, stateA, detail(), harness.records);
    model.edit("7");
    const pending = model.submit();
    model.edit("8");
    await model.submit();
    await model.check();
    expect(model.text).toBe("7");
    expect(model.sending).toBe(true);
    expect(harness.calls.filter((call) => call.route === "web/data/save")).toHaveLength(1);
    const save = harness.calls.find((call) => call.route === "web/data/save");
    saving.resolve({
      id: save?.body["id"],
      kind: "draft",
      revision: "1",
      lastMutationId: save?.body["mutationId"],
      deleted: false,
      data: save?.body["data"]
    });
    harness.handlers.set("evolution/state/set-data", (body) => ({
      state: stateA,
      data: body["data"]
    }));
    await pending;
    expect(harness.calls.find((call) => call.route === "evolution/state/set-data")?.body).toEqual({
      state: stateA,
      data: 7
    });
    harness.records.stop();
  });

  it("restores raw set/clear proposals only after comparing a freshly read sidecar", async () => {
    const harness = await versionHarness();
    const record = harness.records.add("draft", {
      version: 1,
      subtype: "state-data",
      state: stateA,
      hasData: false,
      data: null,
      intent: "clear",
      text: "unfinished {",
      pending: true
    });
    const initial = { ...detail(), hasData: true, data: { note: "changed externally" } };
    const model = new StateDataDraft(harness.connection, stateA, initial, harness.records);
    expect(model.text).toBe("unfinished {");
    expect(model.intent).toBe("clear");
    expect(model.unknown).toBe(true);
    expect(model.changedSidecar).toBe(true);
    await model.submit();
    expect(harness.calls.filter((call) => call.route.startsWith("evolution/state/"))).toHaveLength(
      0
    );
    harness.handlers.set("evolution/get", () => initial);
    await model.check();
    expect(model.needsComparison).toBe(true);
    model.acknowledge();
    expect(model.needsComparison).toBe(false);
    expect(record.data["pending"]).toBe(false);
    expect(model.text).toBe("unfinished {");
    harness.records.stop();
  });

  it("does not retry a lost mutation, checks actual annotation before continuing, and distinguishes receipt failure", async () => {
    const harness = await versionHarness();
    const model = new StateDataDraft(harness.connection, stateA, detail(), harness.records);
    harness.handlers.set("evolution/state/set-data", () => {
      throw new Error("lost response");
    });
    model.edit("null");
    await model.submit();
    expect(model.unknown).toBe(true);
    model.acknowledge();
    expect(model.unknown).toBe(true);
    await model.submit();
    expect(harness.calls.filter((call) => call.route === "evolution/state/set-data")).toHaveLength(
      1
    );
    harness.handlers.set("evolution/get", () => ({ ...detail(), hasData: true, data: null }));
    await model.check();
    model.acknowledge();
    expect(model.unknown).toBe(false);
    harness.handlers.set("evolution/state/set-data", () => {
      harness.handlers.set("web/data/save", () => rejected("WEB_QUOTA_EXCEEDED"));
      return { state: stateA, data: null };
    });
    await model.submit();
    expect(model.live.hasData).toBe(true);
    expect(model.savedReceipt).toBe(false);
    expect(model.notice).toContain("注释已更新，Web 回执未保存");
    expect(model.unknown).toBe(false);
    harness.records.stop();
  });

  it("keeps a known backend rejection editable and diagnoses unreadable immutable State", async () => {
    const harness = await versionHarness();
    harness.handlers.set("evolution/state/set-data", () => rejected("RESOURCE_ERROR"));
    const model = new StateDataDraft(harness.connection, stateA, detail(), harness.records);
    model.edit("[]");
    await model.submit();
    expect(model.unknown).toBe(false);
    expect(model.error).toContain("RESOURCE_ERROR");
    model.edit("[1]");
    expect(model.text).toBe("[1]");
    const state = new StateDetail(harness.connection);
    await state.open(stateB);
    expect(state.value?.state).toBe(stateB);
    harness.handlers.set("evolution/get", () => rejected("STATE_NOT_FOUND"));
    await model.check();
    await state.open(stateA);
    expect(state.value).toBeUndefined();
    expect(state.error).toContain("STATE_NOT_FOUND");
    harness.records.stop();
  });
});

describe("explicit adoption of remote State Data drafts", () => {
  it.each(["success", "lost", "rejected"] as const)(
    "keeps reopened local input when the old %s receipt arrives",
    async (outcome) => {
      const harness = await versionHarness();
      const response = Promise.withResolvers<unknown>();
      harness.handlers.set("evolution/state/set-data", () => response.promise);
      const first = new StateDataDraft(harness.connection, stateA, detail(), harness.records);
      first.edit("1");
      const pending = first.submit();
      await expect
        .poll(() => harness.calls.some((call) => call.route === "evolution/state/set-data"))
        .toBe(true);
      harness.handlers.set(
        "evolution/get",
        () =>
          new Response(
            JSON.stringify({ ...detail(), hasData: true }).replace('"data":null', '"data":2.0')
          )
      );
      const reopened = new StateDataDraft(harness.connection, stateA, detail(), harness.records);
      await reopened.check();
      reopened.acknowledge();
      reopened.edit("2");
      const outcomes = {
        success: () => {
          response.resolve(new Response(`{"state":${JSON.stringify(stateA)},"data":1.0}`));
        },
        lost: () => {
          response.reject(new Error("lost old response"));
        },
        rejected: () => {
          response.resolve(rejected("RESOURCE_ERROR"));
        }
      };
      outcomes[outcome]();
      await pending;
      expect(first.notice).toContain("新输入");
      expect(reopened.slot?.data["text"]).toBe("2");
      expect(reopened.slot?.data["observedSource"]).toBe("2.0");
      expect(await reopened.slot?.flush()).toBe(true);
      expect(new StateDataDraft(harness.connection, stateA, detail(), harness.records).text).toBe(
        "2"
      );
      expect(
        harness.calls.filter((call) => call.route === "evolution/state/set-data")
      ).toHaveLength(1);
      harness.records.stop();
    }
  );

  it("reloads adopted raw input and rechecks authoritative sidecar without applying it", async () => {
    const harness = await versionHarness();
    const model = new StateDataDraft(harness.connection, stateA, detail(), harness.records);
    model.edit("old text");
    await model.slot?.flush();
    const slot = model.slot;
    expect(slot).toBeDefined();
    assert.ok(slot?.confirmed);
    slot.remote = {
      ...slot.confirmed,
      revision: "11",
      data: { ...slot.data, text: "adopted {", intent: "set" }
    };
    slot.useRemote();
    await model.adoptRecord();
    expect(model.text).toBe("adopted {");
    expect(model.needsComparison).toBe(true);
    expect(harness.calls.filter((call) => call.route === "evolution/get")).toHaveLength(1);
    await model.submit();
    expect(harness.calls.some((call) => call.route.startsWith("evolution/state/"))).toBe(false);
    await model.adoptRecord();
    expect(harness.calls.filter((call) => call.route === "evolution/get")).toHaveLength(1);
    slot.remote = {
      ...slot.confirmed,
      revision: "12",
      data: { ...slot.data, state: stateB, text: "another State input" }
    };
    slot.useRemote();
    await model.adoptRecord();
    model.acknowledge();
    expect(model.bindingInvalid).toBe(true);
    expect(model.text).toBe("another State input");
    expect(model.needsComparison).toBe(true);
    harness.records.stop();
  });

  it("preserves an explicitly adopted draft when an already-sent annotation finishes", async () => {
    const harness = await versionHarness();
    const model = new StateDataDraft(harness.connection, stateA, detail(), harness.records);
    model.edit("1");
    harness.handlers.set("evolution/state/set-data", () => {
      const slot = model.slot;
      assert.ok(slot?.confirmed);
      slot.remote = {
        ...slot.confirmed,
        revision: "11",
        data: { ...slot.data, text: "2", pending: false }
      };
      slot.useRemote();
      return { state: stateA, data: 1 };
    });
    await model.submit();
    expect(model.notice).toContain("采用另一版本");
    expect(model.slot?.data["text"]).toBe("2");
    harness.handlers.set("evolution/get", () => ({ ...detail(), hasData: true, data: 1 }));
    await model.adoptRecord();
    expect(model.text).toBe("2");
    expect(model.needsComparison).toBe(true);
    expect(harness.calls.filter((call) => call.route === "evolution/state/set-data")).toHaveLength(
      1
    );
    harness.records.stop();
  });
});
