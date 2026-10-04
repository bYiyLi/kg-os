import assert from "node:assert/strict";
import { type MergeSession } from "@kgos/sdk";
import { describe, expect, it } from "vitest";

import { MergeController } from "./merge-controller.js";
import { stateA, stateB, versionHarness } from "./version-test-support.js";
import { sourceField } from "./version-value-source.js";

const session: MergeSession = {
  session: "opaque/session",
  branch: "main",
  targetState: stateA,
  sourceState: stateB,
  revision: 3,
  status: "conflicted",
  unresolved: 2
};

function rawConflict(id: string, sides: string) {
  const metadata = JSON.stringify({
    conflictId: id,
    kind: "knowledge-node",
    path: "/properties",
    oursRef: "n:1",
    theirsRef: "n:1"
  });
  return `${metadata.slice(0, -1)},${sides}}`;
}

function rawPage(items: string[], revision = 3, cursor?: string) {
  const metadata = JSON.stringify({ session: session.session, revision });
  const paging = cursor === undefined ? "" : `,"cursor":${JSON.stringify(cursor)}`;
  return new Response(`${metadata.slice(0, -1)},"items":[${items.join(",")}]${paging}}`);
}

describe("exact Merge conflict sources and proposal identities", () => {
  it("retains raw sides for separate opaque IDs across conflict pages with absence and null intact", async () => {
    const harness = await versionHarness();
    const first = rawConflict(
      "opaque/first",
      '"base":{"score":1.0,"negative":-0.0},"ours":{"score":1,"negative":-0.0},"theirs":{"score":2.0,"negative":-0.0}'
    );
    const second = rawConflict(
      "opaque/second",
      '"base":null,"theirs":{"$type":"Float","value":"Infinity"}'
    );
    harness.handlers.set("evolution/merge/get", () => session);
    harness.handlers.set("evolution/merge/conflicts", (body) =>
      body["cursor"] === undefined ? rawPage([first], 3, "opaque/conflicts") : rawPage([second])
    );
    const model = new MergeController(harness.connection, harness.context, harness.records);
    await model.open(session.session);
    await model.more();
    const left = model.conflicts[0];
    const right = model.conflicts[1];
    assert.ok(left !== undefined && right !== undefined);
    expect(left.path).toBe(right.path);
    expect(model.conflictSources.get(left)).toBe(first);
    expect(model.conflictSources.get(right)).toBe(second);
    expect(sourceField(model.conflictSources.get(left), "base")).toBe(
      '{"score":1.0,"negative":-0.0}'
    );
    expect(sourceField(model.conflictSources.get(left), "ours")).toBe(
      '{"score":1,"negative":-0.0}'
    );
    expect(sourceField(model.conflictSources.get(right), "base")).toBe("null");
    expect(sourceField(model.conflictSources.get(right), "ours")).toBeUndefined();
    expect(
      harness.calls
        .filter((call) => call.route === "evolution/merge/conflicts")
        .map((call) => call.body)
    ).toEqual([
      { session: session.session, limit: 20 },
      { session: session.session, limit: 20, cursor: "opaque/conflicts" }
    ]);
    harness.records.stop();
  });

  it.each([false, true])(
    "checks restored proposals against exact live value families (changed=%s), excluding resolution metadata",
    async (changed) => {
      const harness = await versionHarness();
      let revision = 3;
      const first = rawConflict("opaque/first", '"base":null,"ours":1.0,"theirs":-0.0');
      const updated = rawConflict(
        "opaque/first",
        `"base":null,"ours":${changed ? "1" : "1.0"},"theirs":-0.0,"resolution":{"choice":"theirs"}`
      );
      harness.handlers.set("evolution/merge/get", () => ({ ...session, revision }));
      harness.handlers.set("evolution/merge/conflicts", () =>
        rawPage([revision === 3 ? first : updated], revision)
      );
      const original = new MergeController(harness.connection, harness.context, harness.records);
      await original.open(session.session);
      const row = original.conflicts[0];
      assert.ok(row !== undefined);
      original.choose(row, "value", "{");
      expect(original.draft?.choices.get(row.conflictId)?.identity).toContain('"ours":1.0');
      revision = 4;
      const restored = new MergeController(harness.connection, harness.context, harness.records);
      await restored.open(session.session);
      expect(restored.draft?.choices.get(row.conflictId)?.checked).toBe(false);
      restored.compare();
      expect(restored.draft?.choices.get(row.conflictId)?.checked).toBe(!changed);
      expect(restored.draft?.choices.get(row.conflictId)?.text).toBe("{");
      expect(harness.calls.filter((call) => call.route === "evolution/merge/resolve")).toHaveLength(
        0
      );
      harness.records.stop();
    }
  );

  it("discards a changed-revision page and reads fresh conflict sources before comparing preserved choices", async () => {
    const harness = await versionHarness();
    let revision = 3;
    const first = rawConflict("opaque/first", '"ours":1.0,"theirs":2.0');
    const replacement = rawConflict("opaque/first", '"ours":1,"theirs":2.0');
    const stale = rawConflict("opaque/stale", '"ours":9.0,"theirs":10.0');
    harness.handlers.set("evolution/merge/get", () => ({ ...session, revision }));
    harness.handlers.set("evolution/merge/conflicts", (body) => {
      if (body["cursor"] !== undefined) {
        revision = 4;
        return rawPage([stale], 4);
      }
      return rawPage(
        [revision === 3 ? first : replacement],
        revision,
        revision === 3 ? "old cursor" : undefined
      );
    });
    const model = new MergeController(harness.connection, harness.context, harness.records);
    await model.open(session.session);
    const row = model.conflicts[0];
    assert.ok(row !== undefined);
    model.choose(row, "ours", "retained");
    await model.more();
    expect(model.session?.revision).toBe(4);
    expect(model.conflicts.map((item) => item.conflictId)).toEqual([row.conflictId]);
    const actual = model.conflicts[0];
    assert.ok(actual !== undefined);
    expect(model.conflictSources.get(actual)).toBe(replacement);
    model.compare();
    expect(model.draft?.choices.get(row.conflictId)?.checked).toBe(false);
    expect(model.draft?.choices.get(row.conflictId)?.text).toBe("retained");
    expect(
      harness.calls.filter((call) => call.route === "evolution/merge/conflicts").at(-1)?.body
    ).not.toHaveProperty("cursor");
    expect(harness.calls.filter((call) => call.route === "evolution/merge/resolve")).toHaveLength(
      0
    );
    harness.records.stop();
  });

  it("does not attach sources from an old conflicts response after a different Session is opened", async () => {
    const harness = await versionHarness();
    const pending = Promise.withResolvers<unknown>();
    const entered = Promise.withResolvers<undefined>();
    const live = rawConflict("opaque/live", '"ours":2.0,"theirs":-0.0');
    const stale = rawConflict("opaque/stale", '"ours":1.0,"theirs":0');
    harness.handlers.set("evolution/merge/get", (body) => ({
      ...session,
      session: body["session"]
    }));
    harness.handlers.set("evolution/merge/conflicts", (body) => {
      if (body["session"] === session.session) {
        entered.resolve(undefined);
        return pending.promise;
      }
      return new Response(`{"session":"new/session","revision":3,"items":[${live}]}`);
    });
    const model = new MergeController(harness.connection, harness.context, harness.records);
    const opening = model.open(session.session);
    await entered.promise;
    await model.open("new/session");
    pending.resolve(rawPage([stale]));
    await opening;
    expect(model.session?.session).toBe("new/session");
    expect(model.conflicts.map((item) => item.conflictId)).toEqual(["opaque/live"]);
    const row = model.conflicts[0];
    assert.ok(row !== undefined);
    expect(model.conflictSources.get(row)).toBe(live);
    harness.records.stop();
  });
});
