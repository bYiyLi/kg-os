import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import { type MergeConflict, type MergeSession } from "@kgos/sdk";

import { MergeController } from "./merge-controller.js";
import { MergeDraft } from "./merge-draft.js";
import { rejected, stateA, stateB, stateC, versionHarness } from "./version-test-support.js";

const session: MergeSession = {
  session: "opaque/session",
  branch: "main",
  targetState: stateA,
  sourceState: stateB,
  revision: 3,
  status: "conflicted",
  unresolved: 2
};
const conflict: MergeConflict = {
  conflictId: "opaque/id/1",
  kind: "knowledge-node",
  path: "/properties/name",
  base: null,
  ours: "ours",
  theirs: "theirs",
  oursRef: "n:1",
  theirsRef: "n:1",
  relatedRefs: ["node:Model"]
};
const other: MergeConflict = { ...conflict, conflictId: "opaque/id/2", base: "second base" };

describe("Merge Session state machine", () => {
  it("recovers a lost start without a token through an explicit complete list/refs check and no automatic retry", async () => {
    const harness = await versionHarness();
    const workspace = harness.records.add("workspace", { version: 1, versionView: "merge" });
    harness.handlers.set("evolution/merge/start", () => {
      throw new Error("lost start response");
    });
    const model = new MergeController(harness.connection, harness.context, harness.records);
    await model.start("main", stateB);
    expect(model.unknown).toBe(true);
    expect(model.startAttempt).toEqual({ branch: "main", source: stateB });
    model.acknowledge();
    await model.start("main", stateB);
    expect(harness.calls.filter((call) => call.route === "evolution/merge/start")).toHaveLength(1);
    await harness.connection.connect("new credential");
    const restored = new MergeController(harness.connection, harness.context, harness.records);
    await restored.restore();
    expect(restored.unknown).toBe(true);
    harness.handlers.set("evolution/merge/list", (body) => ({
      items: [],
      ...(body["cursor"] === undefined ? { cursor: "next" } : {})
    }));
    await restored.check();
    expect(restored.canAcknowledge).toBe(true);
    expect(
      harness.calls.filter((call) => call.route === "evolution/merge/list").at(-1)?.body
    ).toEqual({ limit: 20, cursor: "next" });
    restored.acknowledge();
    expect(restored.unknown).toBe(false);
    expect(workspace.data["versionMergeStart"]).toBeNull();
    expect(harness.calls.filter((call) => call.route === "evolution/merge/start")).toHaveLength(1);
    harness.handlers.set("evolution/merge/start", () => session);
    harness.handlers.set("evolution/merge/conflicts", () => ({
      session: session.session,
      revision: 3,
      items: []
    }));
    await restored.start("main", stateB);
    expect(restored.session?.session).toBe(session.session);
    expect(harness.calls.filter((call) => call.route === "evolution/merge/start")).toHaveLength(2);
    harness.records.stop();
  });

  it.each(['{"score":1.0}', '{"score":-0.0}'])(
    "preserves the exact custom numeric wire %s in the frozen resolution",
    async (text) => {
      const harness = await versionHarness();
      harness.handlers.set("evolution/merge/get", () => session);
      harness.handlers.set("evolution/merge/conflicts", () => ({
        session: session.session,
        revision: 3,
        items: [conflict]
      }));
      harness.handlers.set("evolution/merge/resolve", () => ({ ...session, revision: 4 }));
      const model = new MergeController(harness.connection, harness.context, harness.records);
      await model.open(session.session);
      model.choose(model.conflicts[0] ?? conflict, "value", text);
      await model.resolve();
      const call = harness.calls.find((entry) => entry.route === "evolution/merge/resolve");
      expect(call?.wire).toBe(
        `{"session":"opaque/session","expectedRevision":3,"resolutions":[{"conflictId":"opaque/id/1","choice":"value","value":${text}}]}`
      );
      expect(
        harness.calls.find((entry) => entry.route === "web/data/save")?.body["data"]
      ).toMatchObject({ version: 1, subtype: "merge", choices: [{ text }] });
      harness.records.stop();
    }
  );

  it("starts and reopens actual pinned sessions; opaque IDs remain distinct even on the same public path", async () => {
    const harness = await versionHarness();
    harness.handlers.set("evolution/merge/start", () => session);
    harness.handlers.set("evolution/merge/get", () => session);
    harness.handlers.set("evolution/merge/list", (body) => ({
      items: [session],
      ...(body["cursor"] === undefined ? { cursor: "list cursor" } : {})
    }));
    harness.handlers.set("evolution/merge/conflicts", (body) => ({
      session: session.session,
      revision: 3,
      items: body["cursor"] === undefined ? [conflict] : [other],
      ...(body["cursor"] === undefined ? { cursor: "conflict cursor" } : {})
    }));
    const model = new MergeController(harness.connection, harness.context, harness.records);
    await model.list();
    await model.list(true);
    expect(model.sessions).toHaveLength(2);
    await model.start("main", "branch/source");
    expect(model.session).toEqual(session);
    expect(model.actionable).toBe(true);
    await model.more();
    await model.more();
    expect(model.conflicts.map((row) => row.conflictId)).toEqual([
      conflict.conflictId,
      other.conflictId
    ]);
    expect(
      harness.calls.filter((call) => call.route === "evolution/merge/conflicts")[1]?.body
    ).toEqual({ session: session.session, limit: 20, cursor: "conflict cursor" });
    model.choose(model.conflicts[0] ?? conflict, "value", "{");
    await model.resolve();
    expect(model.error).toContain("JSON");
    expect(model.draft?.choices.get(conflict.conflictId)?.text).toBe("{");
    await model.open(session.session);
    expect(model.draft?.choices.get(conflict.conflictId)?.text).toBe("{");
    expect(harness.calls.filter((call) => call.route === "evolution/merge/resolve")).toHaveLength(
      0
    );
    harness.records.stop();
  });

  it("freezes resolves once at actual revision, invalidates cursor, preserves unsent input, and forbids premature finalize", async () => {
    const harness = await versionHarness();
    let actual = session;
    harness.handlers.set("evolution/merge/get", () => actual);
    harness.handlers.set("evolution/merge/conflicts", () => ({
      session: session.session,
      revision: actual.revision,
      items: [conflict, other],
      cursor: "old cursor"
    }));
    const pending = Promise.withResolvers<unknown>();
    harness.handlers.set("evolution/merge/resolve", () => pending.promise);
    const model = new MergeController(harness.connection, harness.context, harness.records);
    await model.open(session.session);
    await model.finalize("author", "message");
    expect(harness.calls.filter((call) => call.route === "evolution/merge/finalize")).toHaveLength(
      0
    );
    model.choose(model.conflicts[0] ?? conflict, "value", "null");
    const submitting = model.resolve();
    model.choose(model.conflicts[1] ?? other, "ours", "later");
    await model.resolve();
    await model.open("another session");
    await model.list();
    expect(model.draft?.choices.size).toBe(1);
    actual = { ...session, revision: 4, unresolved: 1 };
    pending.resolve(actual);
    await submitting;
    expect(harness.calls.filter((call) => call.route === "evolution/merge/resolve")).toHaveLength(
      1
    );
    expect(harness.calls.find((call) => call.route === "evolution/merge/resolve")?.body).toEqual({
      session: session.session,
      expectedRevision: 3,
      resolutions: [{ conflictId: conflict.conflictId, choice: "value", value: null }]
    });
    expect(
      harness.calls.find((call) => call.route === "web/data/save")?.body["data"]
    ).toMatchObject({
      version: 1,
      subtype: "merge",
      session: session.session,
      branch: "main",
      targetState: stateA,
      sourceState: stateB,
      revision: 3,
      pending: "resolve",
      choices: [{ conflictId: conflict.conflictId, choice: "value", text: "null", revision: 3 }]
    });
    expect(model.session?.revision).toBe(4);
    expect(model.draft?.choices.size).toBe(0);
    expect(model.unknown).toBe(false);
    const conflictRequests = harness.calls.filter(
      (call) => call.route === "evolution/merge/conflicts"
    );
    expect(conflictRequests.at(-1)?.body).not.toHaveProperty("cursor");
    harness.records.stop();
  });

  it("rereads MERGE_SESSION_CHANGED and preserves proposal for explicit comparison without replay", async () => {
    const harness = await versionHarness();
    let revision = 3;
    harness.handlers.set("evolution/merge/get", () => ({ ...session, revision }));
    harness.handlers.set("evolution/merge/conflicts", () => ({
      session: session.session,
      revision,
      items: [conflict]
    }));
    harness.handlers.set("evolution/merge/resolve", () => {
      revision = 4;
      return rejected("MERGE_SESSION_CHANGED");
    });
    const model = new MergeController(harness.connection, harness.context, harness.records);
    await model.open(session.session);
    model.choose(model.conflicts[0] ?? conflict, "theirs", "unfinished");
    await model.resolve();
    expect(model.session?.revision).toBe(4);
    expect(model.draft?.choices.get(conflict.conflictId)?.checked).toBe(false);
    expect(model.draft?.choices.get(conflict.conflictId)?.text).toBe("unfinished");
    await model.resolve();
    expect(harness.calls.filter((call) => call.route === "evolution/merge/resolve")).toHaveLength(
      1
    );
    model.compare();
    expect(model.draft?.choices.get(conflict.conflictId)?.checked).toBe(true);
    harness.records.stop();
  });
});

describe("Merge outcomes and cleanup", () => {
  it("keeps moved-head plan on original Session and creates an explicit new Session with no copied resolutions", async () => {
    const harness = await versionHarness();
    harness.handlers.set("evolution/merge/get", () => session);
    harness.handlers.set("evolution/merge/conflicts", () => ({
      session: session.session,
      revision: 3,
      items: [conflict]
    }));
    harness.handlers.set("evolution/merge/resolve", () => rejected("BRANCH_HEAD_MOVED"));
    const model = new MergeController(harness.connection, harness.context, harness.records);
    await model.open(session.session);
    model.choose(model.conflicts[0] ?? conflict, "ours", "");
    await model.resolve();
    expect(model.headMoved).toBe(true);
    expect(model.draft?.choices.size).toBe(1);
    expect(model.actionable).toBe(false);
    harness.handlers.set("evolution/merge/start", () => ({
      ...session,
      session: "new/session",
      targetState: stateC
    }));
    harness.handlers.set("evolution/merge/conflicts", () => ({
      session: "new/session",
      revision: 3,
      items: [other]
    }));
    await model.start("main", stateB);
    expect(model.session?.targetState).toBe(stateC);
    expect(model.draft?.choices.size).toBe(0);
    expect(
      harness.records.slots.find((slot) => slot.data["session"] === session.session)?.data[
        "choices"
      ]
    ).toHaveLength(1);
    harness.records.stop();
  });

  it.each(["up_to_date", "fast_forward", "merged"])(
    "reports only actual %s result and reads actual final parents",
    async (status) => {
      const harness = await versionHarness();
      const ready = { ...session, status: "ready", unresolved: 0 };
      harness.handlers.set("evolution/merge/get", () => ready);
      harness.handlers.set("evolution/merge/conflicts", () => ({
        session: session.session,
        revision: 3,
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
      await model.open(session.session);
      await model.finalize("author", "merge note");
      expect(model.result?.status).toBe(status);
      expect(model.resultState?.parents).toEqual([stateA, stateB]);
      expect(harness.context.state).toBe(stateA);
      await model.finalize("duplicate", "");
      expect(
        harness.calls.filter((call) => call.route === "evolution/merge/finalize")
      ).toHaveLength(1);
      expect(harness.calls.find((call) => call.route === "evolution/merge/finalize")?.body).toEqual(
        { session: session.session, expectedRevision: 3, author: "author", message: "merge note" }
      );
      harness.records.stop();
    }
  );

  it("blocks consistency/unknown mutations, distinguishes receipt failure, and aborts only explicitly at observed revision", async () => {
    const harness = await versionHarness();
    harness.handlers.set("evolution/merge/get", () => session);
    harness.handlers.set("evolution/merge/conflicts", () => rejected("CONSISTENCY_ERROR"));
    const model = new MergeController(harness.connection, harness.context, harness.records);
    await model.open(session.session);
    expect(model.actionable).toBe(false);
    expect(model.abortable).toBe(true);
    await model.finalize("", "");
    expect(harness.calls.filter((call) => call.route === "evolution/merge/finalize")).toHaveLength(
      0
    );
    harness.handlers.set("evolution/merge/abort", () => {
      throw new Error("lost abort response");
    });
    await model.abort();
    expect(model.unknown).toBe(true);
    await model.abort();
    expect(harness.calls.filter((call) => call.route === "evolution/merge/abort")).toHaveLength(1);
    await model.check();
    model.acknowledge();
    expect(model.unknown).toBe(false);
    harness.handlers.set("evolution/merge/abort", () => {
      harness.handlers.set("web/data/save", () => rejected("WEB_QUOTA_EXCEEDED"));
      return { session: session.session };
    });
    await model.abort();
    expect(model.notice).toContain("Web 回执未保存");
    expect(model.abortable).toBe(false);
    harness.records.stop();
  });

  it("does not send mutations without a saved draft and never accepts an unrelated conflict object", async () => {
    const harness = await versionHarness();
    harness.handlers.set("evolution/merge/get", () => session);
    harness.handlers.set("evolution/merge/conflicts", () => ({
      session: session.session,
      revision: 3,
      items: [conflict]
    }));
    const model = new MergeController(harness.connection, harness.context, undefined);
    await model.more();
    await model.check();
    model.compare();
    model.acknowledge();
    await model.resolve();
    await model.abort();
    await model.open(session.session);
    model.choose({ ...conflict }, "ours", "");
    expect(model.draft?.choices.size).toBe(0);
    model.choose(model.conflicts[0] ?? conflict, "ours", "");
    await model.resolve();
    expect(model.error).toContain("尚未可靠保存");
    expect(harness.calls.filter((call) => call.route === "evolution/merge/resolve")).toHaveLength(
      0
    );
    harness.records.stop();
  });
});

describe("Merge draft restoration identity", () => {
  it("retains malformed value and checks revision, pinned inputs and opaque ID before enabling proposals", async () => {
    const harness = await versionHarness();
    const draft = new MergeDraft(session, harness.records);
    draft.choose(conflict, "value", "unfinished {", 3);
    draft.save("resolve");
    const restored = new MergeDraft(session, harness.records);
    expect(restored.choices.get(conflict.conflictId)?.checked).toBe(false);
    restored.author = "retained author";
    restored.message = "unfinished message";
    restored.save();
    expect(new MergeDraft(session, harness.records).message).toBe("unfinished message");
    restored.verify([conflict], 3);
    expect(restored.choices.get(conflict.conflictId)?.checked).toBe(true);
    expect(() => restored.resolutions()).toThrow();
    restored.verify([other], 3, true);
    expect(restored.choices.get(conflict.conflictId)?.checked).toBe(false);
    expect(() => restored.resolutions()).toThrow("核对");
    restored.choose(conflict, "ours", "unfinished {", 3);
    expect(restored.resolutions()).toEqual([{ conflictId: conflict.conflictId, choice: "ours" }]);
    restored.invalidate();
    restored.verify([conflict], 4);
    expect(restored.choices.get(conflict.conflictId)?.checked).toBe(false);
    restored.verify([conflict], 4, true);
    expect(restored.choices.get(conflict.conflictId)?.checked).toBe(true);
    const changed = new MergeDraft({ ...session, targetState: stateC }, harness.records);
    expect(changed.invalid).toBe(true);
    changed.verify([conflict], 3, true);
    expect(() => changed.resolutions()).toThrow("核对");
    harness.records.stop();
  });

  it("adopts remote choices, rechecks Session revision and conflicts, and keeps old choices unapplied", async () => {
    const harness = await versionHarness();
    harness.handlers.set("evolution/merge/get", () => session);
    harness.handlers.set("evolution/merge/conflicts", () => ({
      session: session.session,
      revision: 3,
      items: [conflict]
    }));
    const model = new MergeController(harness.connection, harness.context, harness.records);
    await model.open(session.session);
    model.choose(model.conflicts[0] ?? conflict, "ours", "old");
    const slot = model.draft?.slot;
    assert.ok(slot);
    await slot.flush();
    assert.ok(slot.confirmed);
    const choices = [
      {
        conflictId: conflict.conflictId,
        choice: "value",
        text: "adopted {",
        identity: model.draft?.choices.get(conflict.conflictId)?.identity ?? "",
        revision: 3
      }
    ];
    slot.remote = { ...slot.confirmed, revision: "11", data: { ...slot.data, choices } };
    slot.useRemote();
    await model.adoptRecord();
    expect(model.draft?.choices.get(conflict.conflictId)?.text).toBe("adopted {");
    await model.resolve();
    expect(harness.calls.some((call) => call.route === "evolution/merge/resolve")).toBe(false);
    expect(model.error).toContain("JSON");
    await model.adoptRecord();
    expect(harness.calls.filter((call) => call.route === "evolution/merge/get")).toHaveLength(2);
    harness.records.stop();
  });

  it("discards a stale conflict cursor by rereading changed revision, and blocks invalid public conflicts", async () => {
    const harness = await versionHarness();
    let reads = 0;
    harness.handlers.set("evolution/merge/get", () => ({
      ...session,
      revision: ++reads === 1 ? 3 : 4,
      unresolved: 0,
      status: "ready"
    }));
    harness.handlers.set("evolution/merge/conflicts", () => ({
      session: session.session,
      revision: 4,
      items: [conflict],
      cursor: "page"
    }));
    const model = new MergeController(harness.connection, harness.context, harness.records);
    await model.open(session.session);
    expect(model.session?.revision).toBe(4);
    expect(reads).toBe(2);
    harness.handlers.set("evolution/merge/conflicts", () => rejected("CONSISTENCY_ERROR"));
    await model.more();
    await model.finalize("", "");
    expect(model.actionable).toBe(false);
    expect(harness.calls.some((call) => call.route === "evolution/merge/finalize")).toBe(false);
    harness.handlers.set("evolution/merge/get", () => rejected("OBJECT_NOT_FOUND"));
    await model.open("missing");
    expect(model.abortable).toBe(false);
    expect(model.draft?.session.session).toBe(session.session);
    harness.records.stop();
  });
});
