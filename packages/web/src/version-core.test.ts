import { describe, expect, it } from "vitest";

import { Connection } from "./connection.js";
import { VersionChanges, ChangeDetails } from "./version-changes.js";
import { ancestryLayout, VersionHistory } from "./version-history.js";
import { VersionOperation, uncertain, jsonValue } from "./version-operation.js";
import { VersionRefs } from "./version-refs.js";
import {
  rejected,
  stateA,
  stateB,
  stateC,
  summary,
  versionHarness
} from "./version-test-support.js";

describe("bounded ancestry and change contracts", () => {
  it.each(['{"big":9007199254740993}', "1e400"])(
    "preserves exact initial State Data %s in an explicit create",
    async (text) => {
      const harness = await versionHarness();
      harness.handlers.set("evolution/state/create", () => ({ state: stateB }));
      const model = new VersionRefs(harness.context);
      await model.create({ branch: "main", author: "author", message: "empty Commit" }, text);
      expect(harness.calls.find((call) => call.route === "evolution/state/create")?.wire).toBe(
        `{"branch":"main","author":"author","message":"empty Commit","data":${text}}`
      );
      expect(model.createdState).toBe(stateB);
      await model.create({ branch: "main" }, "{");
      expect(model.error).toContain("合法 JSON");
      expect(harness.calls.filter((call) => call.route === "evolution/state/create")).toHaveLength(
        1
      );
      harness.records.stop();
    }
  );

  it("rejects invalid Web payload versions before any custom save handler can accept them", async () => {
    const harness = await versionHarness();
    let accepted = 0;
    harness.handlers.set("web/data/save", () => {
      accepted += 1;
      return {};
    });
    for (const data of [
      { subtype: "merge" },
      { version: "1", subtype: "merge" },
      { version: 2, subtype: "state-data" },
      { version: 1, subtype: "unknown" }
    ]) {
      const slot = harness.records.add("draft", data);
      expect(await slot.flush()).toBe(false);
      expect(slot.error).toContain("INVALID_ARGUMENT");
    }
    expect(accepted).toBe(0);
    harness.records.stop();
  });

  it("uses real merge/fork parents, deduplicates complete States and preserves original root/cursor", async () => {
    const harness = await versionHarness();
    harness.handlers.set("evolution/ancestry", (body) =>
      body["cursor"] === undefined
        ? {
            root: stateA,
            items: [summary(stateA, [stateB, stateC]), summary(stateB, [stateC])],
            cursor: "opaque/page"
          }
        : { root: stateA, items: [summary(stateB, [stateC]), summary(stateC)], cursor: "last" }
    );
    const model = new VersionHistory(harness.connection);
    await model.more();
    await model.open("branch/main");
    await model.more();
    const calls = harness.calls.filter((call) => call.route === "evolution/ancestry");
    expect(calls.map((call) => call.body)).toEqual([
      { root: "branch/main", limit: 20 },
      { root: "branch/main", limit: 20, cursor: "opaque/page" }
    ]);
    expect(model.items.map((item) => item.state)).toEqual([stateA, stateB, stateC]);
    expect(model.nodes[0]?.parents.map((parent) => parent.state)).toEqual([stateB, stateC]);
    expect(model.nodes[0]?.parents.map((parent) => parent.lane)).toEqual([0, 1]);
    expect(model.nodes[2]?.lane).toBe(1);
    model.limited = true;
    await model.more();
    expect(calls).toHaveLength(2);
    expect(ancestryLayout([summary(stateA), summary(stateB)]).map((node) => node.lane)).toEqual([
      0, 0
    ]);
  });

  it("does not let an old ancestry response replace another root and retries failed reads", async () => {
    const harness = await versionHarness();
    const pending = Promise.withResolvers<unknown>();
    harness.handlers.set("evolution/ancestry", (body) =>
      body["root"] === stateA ? pending.promise : { root: stateB, items: [summary(stateB)] }
    );
    const model = new VersionHistory(harness.connection);
    const first = model.open(stateA);
    await model.open(stateB);
    pending.resolve({ root: stateA, items: [summary(stateA)] });
    await first;
    expect(model.items).toEqual([summary(stateB)]);
    await model.more();
    expect(harness.calls.filter((call) => call.route === "evolution/ancestry")).toHaveLength(2);
    harness.handlers.set("evolution/ancestry", () => rejected("STATE_NOT_FOUND"));
    await model.open(stateC);
    expect(model.error).toContain("STATE_NOT_FOUND");
    harness.handlers.set("evolution/ancestry", () => ({ root: stateC, items: [summary(stateC)] }));
    await model.more();
    expect(model.items[0]?.state).toBe(stateC);
  });

  it("preserves History's per-change rows including same State and empty-delta entries", async () => {
    const harness = await versionHarness();
    const update = {
      change: "update",
      kind: "knowledge-node",
      path: "/properties/x",
      beforeRef: "n:1",
      afterRef: "n:1",
      before: null,
      after: 3
    };
    harness.handlers.set("evolution/history", (body) => ({
      root: stateA,
      items:
        body["cursor"] === undefined
          ? [
              { state: stateA, parents: [stateB], change: update },
              { state: stateA, parents: [stateB], change: { ...update, path: "/properties/y" } }
            ]
          : [{ state: stateB, parents: [stateC], change: null }],
      ...(body["cursor"] === undefined ? { cursor: "opaque-history" } : {})
    }));
    const model = new VersionChanges(harness.connection);
    await model.more();
    await model.open({ mode: "history", request: { root: stateA, scope: "all", limit: 20 } });
    await model.more();
    await model.more();
    expect(model.history).toHaveLength(3);
    expect(model.history.map((entry) => entry.state)).toEqual([stateA, stateA, stateB]);
    expect(model.history[2]?.change).toBeNull();
    expect(
      harness.calls.filter((call) => call.route === "evolution/history").map((call) => call.body)
    ).toEqual([
      { root: stateA, scope: "all", limit: 20 },
      { root: stateA, scope: "all", limit: 20, cursor: "opaque-history" }
    ]);
  });

  it("keeps Diff tuples and lawful object anchor fixed, resets cursors for changed parameters", async () => {
    const harness = await versionHarness();
    const remove = {
      change: "delete",
      kind: "knowledge-node",
      path: "",
      beforeRef: "n:1",
      before: { labels: [] }
    };
    harness.handlers.set("evolution/diff", (body) => ({
      before: stateB,
      after: stateA,
      items: [remove],
      ...(body["cursor"] === undefined ? { cursor: "opaque-diff" } : {})
    }));
    const model = new VersionChanges(harness.connection);
    const request = {
      before: stateB,
      after: stateA,
      scope: "object",
      object: { anchorState: stateB, ref: "n:1" },
      limit: 20
    };
    await model.open({ mode: "diff", request });
    request.object.ref = "n:changed-form";
    await model.more();
    await model.more();
    expect(model.changes).toHaveLength(2);
    const calls = harness.calls.filter((call) => call.route === "evolution/diff");
    expect(calls[1]?.body).toMatchObject({
      before: stateB,
      after: stateA,
      object: { anchorState: stateB, ref: "n:1" },
      cursor: "opaque-diff"
    });
    harness.handlers.set("evolution/diff", () => ({ before: stateA, after: stateC, items: [] }));
    await model.open({ mode: "diff", request: { before: stateA, after: stateC, scope: "all" } });
    expect(model.changes).toEqual([]);
    expect(model.cursor).toBeUndefined();
    expect(model.before).toBe(stateA);
    expect(harness.calls.at(-1)?.body).not.toHaveProperty("cursor");
  });

  it("reads delete/add details only from existing sides and isolates failed/late side reads", async () => {
    const harness = await versionHarness();
    harness.handlers.set("object/read", (body) => ({
      state: body["at"],
      results: [{ kind: "knowledge-node", ref: "n:1", value: null }]
    }));
    const details = new ChangeDetails(harness.connection);
    await details.open(
      { change: "delete", kind: "knowledge-node", path: "", beforeRef: "n:1" },
      stateB,
      stateA
    );
    expect(details.before.value).toBeNull();
    expect(details.after.absent).toBe(true);
    expect(
      harness.calls.filter((call) => call.route === "object/read").map((call) => call.body)
    ).toEqual([{ at: stateB, refs: ["n:1"] }]);
    harness.handlers.set("object/read", () => rejected("OBJECT_NOT_FOUND"));
    await details.before.read(stateB, "n:missing");
    expect(details.before.error).toContain("OBJECT_NOT_FOUND");
    harness.handlers.set("object/read", () => ({ state: stateC, results: [] }));
    await details.before.read(stateA, "n:1");
    expect(details.before.error).toContain("不一致");
    harness.handlers.set("object/read", () => ({ state: stateA, results: [] }));
    await details.before.read(stateA, "n:1");
    expect(details.before.error).toContain("未返回完整对象");
  });
});

describe("guarded version operations and refs", () => {
  it("blocks unknown mutation replay, cancels late reads, and keeps known rejection distinct", async () => {
    const harness = await versionHarness();
    const model = new VersionOperation(harness.connection);
    expect(jsonValue("null")).toBeNull();
    expect(uncertain(new Error("lost"))).toBe(true);
    const waiting = Promise.withResolvers<string>();
    const pending = model.run(() => waiting.promise, true);
    expect(await model.run(() => Promise.resolve("duplicate"), true)).toBeUndefined();
    model.cancel();
    waiting.resolve("late");
    expect(await pending).toBeUndefined();
    expect(model.unknown).toBe(true);
    expect(await model.run(() => Promise.resolve("retry"), true)).toBeUndefined();
    model.unknown = false;
    const cancelled = Promise.withResolvers<string>();
    const aborted = model.run(() => cancelled.promise, true);
    model.cancel();
    expect(model.unknown).toBe(true);
    cancelled.reject(new DOMException("aborted", "AbortError"));
    expect(await aborted).toBeUndefined();
    model.unknown = false;
    await model.run(() => Promise.reject(new Error("network")), true);
    expect(model.unknown).toBe(true);
    model.unknown = false;
    harness.handlers.set("evolution/get", () => rejected("INVALID_ARGUMENT"));
    await model.run((client) => client.evolution.get({ state: stateA }), true);
    expect(model.unknown).toBe(false);
    expect(model.errorCode).toBe("INVALID_ARGUMENT");
    const disconnected = new VersionOperation(new Connection("http://127.0.0.1:1"));
    expect(await disconnected.run(() => Promise.resolve("unreachable"))).toBeUndefined();
  });

  it("calls only real Branch/Tag operations, observes results, and preserves pinned view on default deletion rejection", async () => {
    const harness = await versionHarness();
    const model = new VersionRefs(harness.context);
    for (const route of ["branch/create", "branch/delete", "tag/create", "tag/move", "tag/delete"])
      harness.handlers.set(`evolution/${route}`, (body) => ({ name: body["name"], state: stateB }));
    await model.apply({ kind: "branch", action: "create", name: "side", target: stateA });
    await model.apply({ kind: "branch", action: "move", name: "side", target: stateB });
    expect(model.error).toContain("仅支持");
    await model.apply({ kind: "branch", action: "delete", name: "side", target: stateA });
    await model.apply({ kind: "tag", action: "create", name: "review", target: stateA });
    await model.apply({ kind: "tag", action: "move", name: "review", target: stateB });
    await model.apply({ kind: "tag", action: "delete", name: "review", target: stateB });
    harness.handlers.set("evolution/branch/delete", () => rejected("INVALID_ARGUMENT"));
    await model.apply({ kind: "branch", action: "delete", name: "main", target: stateA });
    expect(model.error).toContain("INVALID_ARGUMENT");
    expect(harness.context.state).toBe(stateA);
    harness.handlers.set("evolution/state/create", () => ({ state: stateC }));
    await model.create({ branch: "main", message: "empty Snapshot", data: null });
    expect(model.createdState).toBe(stateC);
    expect(harness.context.state).toBe(stateA);
    expect(harness.calls.find((call) => call.route === "evolution/branch/create")?.body).toEqual({
      name: "side",
      from: stateA
    });
    expect(harness.calls.find((call) => call.route === "evolution/tag/move")?.body).toEqual({
      name: "review",
      target: stateB
    });
    expect(harness.calls.find((call) => call.route === "evolution/state/create")?.body).toEqual({
      branch: "main",
      message: "empty Snapshot",
      data: null
    });
    harness.handlers.set("evolution/tag/move", () => {
      throw new Error("lost");
    });
    await model.apply({ kind: "tag", action: "move", name: "review", target: stateC });
    const count = harness.calls.length;
    await model.apply({ kind: "tag", action: "move", name: "review", target: stateC });
    await model.create({ branch: "main" });
    expect(harness.calls).toHaveLength(count);
    await model.check();
    model.acknowledge();
    expect(model.unknown).toBe(false);
    expect(model.pending).toBeUndefined();
  });
});

describe("immutable pins for interactive change requests", () => {
  it("resolves mutable Before/After and object anchor once, then keeps their commits across paging", async () => {
    const harness = await versionHarness();
    harness.handlers.set("evolution/get", (body) => ({
      state: body["state"] === "branch/old" ? stateB : stateA
    }));
    harness.handlers.set("evolution/diff", (body) => ({
      before: stateB,
      after: stateA,
      items: [],
      ...(body["cursor"] === undefined ? { cursor: "opaque" } : {})
    }));
    const model = new VersionChanges(harness.connection);
    await model.openPinned({
      mode: "diff",
      request: {
        before: "branch/old",
        after: "tag/current",
        scope: "object",
        object: { anchorState: "branch/old", ref: "n:1" }
      }
    });
    expect(harness.calls.filter((call) => call.route === "evolution/get")).toHaveLength(2);
    expect(harness.calls.find((call) => call.route === "evolution/diff")?.body).toEqual({
      before: stateB,
      after: stateA,
      scope: "object",
      object: { anchorState: stateB, ref: "n:1" }
    });
    harness.handlers.set("evolution/get", () => ({ state: stateC }));
    await model.more();
    expect(
      harness.calls.filter((call) => call.route === "evolution/diff").at(-1)?.body
    ).toMatchObject({ before: stateB, after: stateA, cursor: "opaque" });
    harness.handlers.set("evolution/get", () => rejected("STATE_NOT_FOUND"));
    await model.openPinned({ mode: "history", request: { root: "branch/missing", scope: "all" } });
    expect(model.error).toContain("STATE_NOT_FOUND");
    expect(model.after).toBe(stateA);
    expect(harness.calls.some((call) => call.route === "evolution/history")).toBe(false);
  });
});
