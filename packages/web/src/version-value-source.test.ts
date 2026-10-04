import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";

import { ChangeSide, type ChangeQuery, VersionChanges } from "./version-changes.js";
import { stateA, stateB, stateC, versionHarness } from "./version-test-support.js";
import { eachSource, readSourced, sourceField, sourceIdentity } from "./version-value-source.js";

const float =
  '{"score":1.0,"negative":-0.0,"fraction":1.25,"nested":[{"escaped\\"key":2.0}],"integer":{"$type":"Integer","value":"9007199254740993"}}';
const integer = '{"score":1,"negative":0}';

function rawChange(before: string | undefined, after: string | undefined) {
  const metadata = JSON.stringify({
    change: "update",
    kind: "knowledge-node",
    path: "/properties",
    beforeRef: "n:1",
    afterRef: "n:1"
  });
  const sides = [
    before === undefined ? "" : `,"before":${before}`,
    after === undefined ? "" : `,"after":${after}`
  ];
  return `${metadata.slice(0, -1)}${sides.join("")}}`;
}

function rawPage(mode: "diff" | "history", items: string[], root = stateA, cursor?: string) {
  const metadata = JSON.stringify(mode === "diff" ? { before: stateB, after: root } : { root });
  const paging = cursor === undefined ? "" : `,"cursor":${JSON.stringify(cursor)}`;
  return new Response(`${metadata.slice(0, -1)},"items":[${items.join(",")}]${paging}}`);
}

function historyEntry(change: string, state = stateA) {
  return `{"state":${JSON.stringify(state)},"parents":[${JSON.stringify(stateB)}],"change":${change}}`;
}

function query(mode: "diff" | "history", root: string): ChangeQuery {
  return mode === "diff"
    ? { mode, request: { before: stateB, after: root, scope: "all", limit: 20 } }
    : { mode, request: { root, scope: "all", limit: 20 } };
}

describe("exact public Change response sources", () => {
  it("retains Float, signed zero, nested and typed values for separate same-path Diff pages", async () => {
    const harness = await versionHarness();
    const first = rawChange(float, integer);
    const second = rawChange("null", undefined);
    harness.handlers.set("evolution/diff", (body) =>
      body["cursor"] === undefined
        ? rawPage("diff", [first], stateA, "opaque/diff")
        : rawPage("diff", [second])
    );
    const model = new VersionChanges(harness.connection);
    await model.open(query("diff", stateA));
    await model.more();
    const left = model.changes[0];
    const right = model.changes[1];
    assert.ok(left !== undefined && right !== undefined);
    expect(model.changeSources.get(left)).toBe(first);
    expect(model.changeSources.get(right)).toBe(second);
    expect(sourceField(model.changeSources.get(left), "before")).toBe(float);
    expect(sourceField(model.changeSources.get(left), "after")).toBe(integer);
    expect(sourceField(model.changeSources.get(right), "before")).toBe("null");
    expect(sourceField(model.changeSources.get(right), "after")).toBeUndefined();
    expect(
      harness.calls.filter((call) => call.route === "evolution/diff").map((call) => call.body)
    ).toEqual([
      { before: stateB, after: stateA, scope: "all", limit: 20 },
      { before: stateB, after: stateA, scope: "all", limit: 20, cursor: "opaque/diff" }
    ]);
    harness.records.stop();
  });

  it("associates every same-State History Change by its row, retaining empty deltas and second-page sources", async () => {
    const harness = await versionHarness();
    const first = rawChange("1.0", "1");
    const second = rawChange("-0.0", "0");
    const third = rawChange(undefined, '{"$type":"Float","value":"NaN"}');
    harness.handlers.set("evolution/history", (body) =>
      body["cursor"] === undefined
        ? rawPage(
            "history",
            [historyEntry(first), historyEntry(second), historyEntry("null")],
            stateA,
            "opaque/history"
          )
        : rawPage("history", [historyEntry(third, stateB)])
    );
    const model = new VersionChanges(harness.connection);
    await model.open(query("history", stateA));
    await model.more();
    expect(model.history.map((entry) => entry.state)).toEqual([stateA, stateA, stateA, stateB]);
    expect(
      model.history.map((entry) =>
        entry.change === null ? null : model.changeSources.get(entry.change)
      )
    ).toEqual([first, second, null, third]);
    expect(harness.calls.filter((call) => call.route === "evolution/history").at(-1)?.body).toEqual(
      {
        root: stateA,
        scope: "all",
        limit: 20,
        cursor: "opaque/history"
      }
    );
    harness.records.stop();
  });

  it.each(["diff", "history"] as const)(
    "discards an old %s response and its exact source after a changed query",
    async (mode) => {
      const harness = await versionHarness();
      const pending = Promise.withResolvers<unknown>();
      const old = rawChange("1.0", "1");
      const live = rawChange("2.0", "2");
      const rows = (source: string) => (mode === "diff" ? [source] : [historyEntry(source)]);
      const rootKey = mode === "diff" ? "after" : "root";
      harness.handlers.set(`evolution/${mode}`, (body) =>
        body[rootKey] === stateA ? pending.promise : rawPage(mode, rows(live), stateC)
      );
      const model = new VersionChanges(harness.connection);
      const opening = model.open(query(mode, stateA));
      await model.open(query(mode, stateC));
      pending.resolve(rawPage(mode, rows(old)));
      await opening;
      const historyChanges = model.history.flatMap((entry) =>
        entry.change === null ? [] : [entry.change]
      );
      const changes = mode === "diff" ? model.changes : historyChanges;
      expect(changes).toHaveLength(1);
      assert.ok(changes[0] !== undefined);
      expect(model.changeSources.get(changes[0])).toBe(live);
      expect(model.after).toBe(stateC);
      expect(
        harness.calls.find((call) => call.route === `evolution/${mode}`)?.signal?.aborted
      ).toBe(true);
      harness.records.stop();
    }
  );
});

describe("exact complete Object side sources", () => {
  it("reads the matching Ref source independently of result order and separates null, absence and wrong State", async () => {
    const harness = await versionHarness();
    harness.handlers.set(
      "object/read",
      () =>
        new Response(
          `{"state":${JSON.stringify(stateB)},"results":[{"kind":"knowledge-node","ref":"n:other","value":2.0},{"kind":"knowledge-node","ref":"n:1","value":${float}}]}`
        )
    );
    const side = new ChangeSide(harness.connection);
    await side.read(stateB, "n:1");
    expect(side.source).toBe(float);
    harness.handlers.set(
      "object/read",
      () =>
        new Response(
          `{"state":${JSON.stringify(stateB)},"results":[{"kind":"knowledge-node","ref":"n:1","value":null}]}`
        )
    );
    await side.read(stateB, "n:1");
    expect(side.value).toBeNull();
    expect(side.source).toBe("null");
    await side.read(stateA, undefined);
    expect(side.absent).toBe(true);
    expect(side.source).toBeUndefined();
    await side.read(stateA, "n:1");
    expect(side.error).toContain("不一致");
    expect(side.source).toBeUndefined();
    harness.handlers.set("object/read", () => ({ state: stateA, results: [] }));
    await side.read(stateA, "n:1");
    expect(side.source).toBeUndefined();
    expect(side.error).toContain("未返回完整对象");
    harness.records.stop();
  });

  it("keeps a newer State+Ref value and source when an old complete read arrives late", async () => {
    const harness = await versionHarness();
    const pending = Promise.withResolvers<unknown>();
    harness.handlers.set("object/read", (body) =>
      body["at"] === stateB
        ? pending.promise
        : new Response(
            `{"state":${JSON.stringify(stateC)},"results":[{"kind":"knowledge-node","ref":"n:1","value":2.0}]}`
          )
    );
    const side = new ChangeSide(harness.connection);
    const reading = side.read(stateB, "n:1");
    await side.read(stateC, "n:1");
    pending.resolve(
      new Response(
        `{"state":${JSON.stringify(stateB)},"results":[{"kind":"knowledge-node","ref":"n:1","value":1.0}]}`
      )
    );
    await reading;
    expect(side.state).toBe(stateC);
    expect(side.value).toBe(2);
    expect(side.source).toBe("2.0");
    harness.records.stop();
  });
});

describe("response source boundary helpers", () => {
  it("preserves escaped members and exact conflict identity while excluding only mutable resolution", () => {
    const raw =
      '{"base":1.0,"ours":-0.0,"theirs":{"escaped\\"key":[2.0]},"resolution":{"choice":"ours"}}';
    expect(sourceIdentity(raw, "resolution")).toBe(
      '{"base":1.0,"ours":-0.0,"theirs":{"escaped\\"key":[2.0]}}'
    );
    expect(sourceIdentity(raw, "resolution")).not.toBe(
      sourceIdentity(raw.replace("1.0", "1"), "resolution")
    );
    expect(sourceField('{"bef\\u006fre":-0.0}', "before")).toBe("-0.0");
    expect(() => sourceIdentity("[]", "resolution")).toThrow(TypeError);
  });

  it("keeps optional source separate from values when an adapter has no response callback", async () => {
    const signal = new AbortController().signal;
    const result = await readSourced((options) => {
      expect(options.signal).toBe(signal);
      return Promise.resolve(null);
    }, signal);
    expect(result).toEqual({ value: null, source: undefined });
    const seen: string[] = [];
    eachSource(undefined, [1], (_item, source) => seen.push(source));
    eachSource('{"items":[1.0]}', [1, 2], (_item, source) => seen.push(source));
    expect(seen).toEqual(["1.0"]);
    expect(sourceField(undefined, "before")).toBeUndefined();
  });
});
