import { afterEach, describe, expect, it, vi } from "vitest";
import { type WebRecord } from "@kgos/sdk";

import { ObjectDraft } from "./edit-controller.js";
import { draftData } from "./edit-data.js";
import { stateA, stateB, rejected, versionHarness } from "./version-test-support.js";

const body = 'labels: ["Person"]\nproperties: {"name": "Alice", "float": 1.0}\n';
const cleanups: (() => void)[] = [];

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing saved fixture");
  return value;
}

async function harness() {
  const setup = await versionHarness();
  setup.handlers.set("evolution/branch/list", () => ({ items: [{ name: "main", state: stateA }] }));
  setup.handlers.set("object/read", (request) => ({
    state: request["at"],
    results: (request["refs"] as string[]).map((ref) => ({
      kind: "knowledge-node",
      ref,
      value: { labels: ["Person"], properties: { name: "Alice", float: 1 } }
    }))
  }));
  setup.handlers.set("object/read-text", (request) => ({
    state: request["at"],
    results: (request["refs"] as string[]).map((ref) => ({ kind: "knowledge-node", ref, body }))
  }));
  setup.handlers.set("object/patch", () => ({ state: stateB, created: [], transitions: [] }));
  const draft = new ObjectDraft(setup.connection, setup.context, setup.records);
  cleanups.push(() => {
    draft.dispose();
    setup.records.stop();
  });
  return { ...setup, draft };
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
});

describe("explicit Object draft and one saved submission", () => {
  it("uses same-State canonical readText and freezes/saves the exact reviewed patch before one send", async () => {
    const setup = await harness();
    const { draft, calls } = setup;
    await draft.start("n:1");
    expect(draft.data.entries[0]?.base).toBe(body);
    expect(draft.canSubmit).toBe(true);
    draft.set("n:1", ["properties", "name"], "Bob");
    const review = draft.preview();
    expect(review.patch).toContain('"float": 1.0');
    expect(review.issues).toEqual([]);
    expect(await draft.submit()).toEqual({ state: stateB, created: [], transitions: [] });
    const patchIndex = calls.findIndex((call) => call.route === "object/patch");
    expect(calls[patchIndex - 1]?.route).toBe("web/data/save");
    expect(calls[patchIndex - 1]?.body["data"]).toMatchObject({
      status: "pending",
      patch: review.patch
    });
    expect(calls[patchIndex]?.body).toEqual({
      baseState: stateA,
      branch: "main",
      patch: review.patch
    });
    expect(calls.every((call) => call.signal instanceof AbortSignal)).toBe(true);
    expect(draft.data.status).toBe("committed");
    expect(draft.receiptSaved).toBe(true);
    expect(setup.context.state).toBe(stateA);
    expect(await draft.submit()).toBeUndefined();
    expect(calls.filter((call) => call.route === "object/patch")).toHaveLength(1);
  });

  it("blocks duplicate clicks and modifications while saving frozen bytes", async () => {
    const { draft, handlers, calls } = await harness();
    await draft.start("n:1");
    draft.set("n:1", ["properties", "name"], "Bob");
    draft.preview();
    const pending = Promise.withResolvers<unknown>();
    handlers.set("web/data/save", () => pending.promise);
    const sending = draft.submit();
    await vi.waitFor(() => {
      expect(draft.busy).toBe(true);
    });
    draft.update("n:1", "different input");
    draft.markDelete("n:1");
    expect(await draft.submit()).toBeUndefined();
    expect(draft.data.entries[0]?.body).toContain('"Bob"');
    handlers.delete("web/data/save");
    const request = calls.at(-1)?.body;
    pending.resolve({
      kind: "draft",
      id: request?.["id"],
      revision: "1",
      deleted: false,
      lastMutationId: request?.["mutationId"],
      data: request?.["data"]
    });
    expect(await sending).toMatchObject({ state: stateB });
    expect(calls.filter((call) => call.route === "object/patch")).toHaveLength(1);
  });

  it("retains invalid YAML and field fragments as drafts and prevents invalid or unavailable-store submission", async () => {
    const { draft, records, connection, calls } = await harness();
    await draft.start("n:1");
    draft.setInput("n:1", ["properties", "name"], "[unfinished");
    expect(draft.input("n:1", ["properties", "name"])).toBe("[unfinished");
    expect(draft.data.entries[0]?.body).toBe(body);
    expect(draft.preview().issues).toHaveLength(1);
    expect(await draft.save()).toBe(true);
    expect(records.slots[0]?.confirmed?.data).toMatchObject({
      inputs: { "n:1|/properties/name": "[unfinished" }
    });
    expect(await draft.submit()).toBeUndefined();
    draft.update("n:1", "{ unfinished");
    expect(draft.preview().issues).toHaveLength(1);
    expect(await draft.save()).toBe(true);
    draft.update("n:1", body);
    expect(draft.data.inputs).toEqual({});
    connection.info = { daemonBootId: "boot", storageStatus: "unavailable" };
    expect(draft.canSubmit).toBe(false);
    expect(calls.some((call) => call.route === "object/patch")).toBe(false);
  });

  it("does not send when reliable saving fails and separates successful knowledge from failed receipt saving", async () => {
    const { draft, handlers, calls } = await harness();
    await draft.start("n:1");
    draft.preview();
    handlers.set("web/data/save", () => rejected("RESOURCE_ERROR"));
    expect(await draft.submit()).toBeUndefined();
    expect(draft.error).toContain("本次未发送");
    expect(calls.filter((call) => call.route === "object/patch")).toHaveLength(0);
    handlers.delete("web/data/save");
    handlers.set("object/patch", () => {
      handlers.set("web/data/save", () => rejected("IO_ERROR"));
      return { state: stateA, created: [], transitions: [] };
    });
    draft.preview();
    expect(await draft.submit()).toMatchObject({ state: stateA });
    expect(draft.data.receipt?.state).toBe(stateA);
    expect(draft.error).toContain("知识已提交，Web 回执未保存");
    expect(draft.receiptSaved).toBe(false);
    handlers.delete("web/data/save");
    expect(await draft.saveReceipt()).toBe(true);
    expect(calls.filter((call) => call.route === "object/patch")).toHaveLength(1);
  });

  it("rejects moved Branch, missing Branch and mismatched canonical bytes on restored input", async () => {
    const { draft, handlers, records, connection, context, calls } = await harness();
    await draft.start("n:1");
    draft.set("n:1", ["properties", "name"], "saved input");
    await draft.save();
    const restored = new ObjectDraft(connection, context, records, draft.slot);
    cleanups.push(() => {
      restored.dispose();
    });
    handlers.set("evolution/branch/list", () => ({ items: [{ name: "main", state: stateB }] }));
    expect(await restored.verify()).toBe(false);
    expect(restored.error).toContain("STALE_BASE_STATE");
    expect(restored.data.entries[0]?.body).toContain("saved input");
    handlers.set("evolution/branch/list", () => ({ items: [] }));
    expect(await restored.verify()).toBe(false);
    expect(restored.error).toContain("不存在");
    handlers.set("evolution/branch/list", () => ({ items: [{ name: "main", state: stateA }] }));
    handlers.set("object/read-text", () => ({
      state: stateA,
      results: [{ kind: "knowledge-node", ref: "n:1", body: body + "\n" }]
    }));
    expect(await restored.verify()).toBe(false);
    expect(restored.error).toContain("canonical bytes");
    restored.preview();
    expect(await restored.submit()).toBeUndefined();
    expect(calls.some((call) => call.route === "object/patch")).toBe(false);
  });

  it("retains restored input when the original base State is missing without submitting or rebasing", async () => {
    const { draft, handlers, records, connection, context, calls } = await harness();
    await draft.start("n:1");
    draft.set("n:1", ["properties", "name"], "saved input");
    expect(await draft.save()).toBe(true);
    const saved = required(draft.slot?.confirmed).data;
    const restored = new ObjectDraft(connection, context, records, draft.slot);
    cleanups.push(restored.dispose.bind(restored));
    const missingBase = () =>
      new Response('{"code":"STATE_NOT_FOUND","message":"Missing base"}', { status: 404 });
    handlers.set("evolution/get", missingBase);
    handlers.set("object/read-text", missingBase);
    handlers.set("evolution/branch/list", () => ({ items: [{ name: "main", state: stateB }] }));
    const restoreCalls = calls.length;
    expect(await restored.verify()).toBe(false);
    expect(restored.error).toContain("STATE_NOT_FOUND");
    expect(restored.canSubmit).toBe(false);
    expect(draftData(restored.data)).toEqual(saved);
    expect(restored.preview().patch).toContain("saved input");
    expect(await restored.submit()).toBeUndefined();
    expect(context.state).toBe(stateA);
    expect(calls.slice(restoreCalls)).toHaveLength(3);
    expect(calls.at(restoreCalls)?.body).toEqual({ state: stateA });
    expect(calls.at(-1)?.body).toEqual({ at: stateA, refs: ["n:1"] });
    expect(calls.some((call) => call.route === "object/patch")).toBe(false);
  });

  it("keeps historical/tag contexts read-only and prevents ref reinterpretation", async () => {
    const { draft, context, calls } = await harness();
    context.inputRef = `tag/release`;
    await draft.start("n:1");
    expect(draft.error).toContain("只读");
    expect(draft.slot).toBeUndefined();
    expect(draft.data.entries).toEqual([]);
    expect(calls).toHaveLength(1);
    context.inputRef = "branch/main";
    context.state = stateB;
    await draft.start("n:1");
    expect(draft.slot).toBeUndefined();
  });
});

describe("unknown outcomes, explicit aliases and record adoption", () => {
  it("binds reconciliation evidence to the observed head and discards evidence after explicit adoption", async () => {
    const { draft, handlers, calls } = await harness();
    await draft.start("n:1");
    draft.preview();
    handlers.set("object/patch", () => {
      throw new TypeError("response lost");
    });
    await draft.submit();
    handlers.set("object/read-text", () => ({ state: stateB, results: [] }));
    handlers.set("evolution/history", () => ({ root: stateA, items: [] }));
    await draft.reconcile();
    expect(draft.evidence).toMatchObject({
      head: stateA,
      objects: [{ ref: "n:1", error: "核对资料未返回同一完整 State / Ref" }]
    });
    handlers.set("evolution/history", () => ({ root: stateB, items: [] }));
    await draft.reconcile();
    expect(draft.error).toContain("核对历史未返回同一 Branch head");
    const history = Promise.withResolvers<unknown>();
    handlers.set("evolution/history", () => history.promise);
    const checking = draft.reconcile();
    await vi.waitFor(() => {
      expect(calls.filter((call) => call.route === "evolution/history")).toHaveLength(3);
    });
    const slot = required(draft.slot);
    const entry = required(draft.data.entries[0]);
    slot.remote = {
      id: slot.id,
      kind: "draft",
      revision: "9",
      deleted: false,
      lastMutationId: "remote",
      data: draftData({
        ...draft.data,
        status: "editing",
        entries: [{ ...entry, body: body.replace("Alice", "accepted remote") }]
      })
    };
    slot.useRemote();
    handlers.set("object/read-text", () => ({
      state: stateA,
      results: [{ kind: "knowledge-node", ref: "n:1", body }]
    }));
    history.resolve({ root: stateA, items: [] });
    await checking;
    await vi.waitFor(() => {
      expect(draft.verified).toBe(true);
    });
    expect(draft.data.status).toBe("editing");
    expect(draft.data.entries[0]?.body).toContain("accepted remote");
    expect(draft.evidence).toBeUndefined();
    expect(calls.filter((call) => call.route === "object/patch")).toHaveLength(1);
  });

  it("preserves removal of final LF in the exact reviewed and transmitted Git diff", async () => {
    const { draft, calls } = await harness();
    await draft.start("n:1");
    draft.update("n:1", body.slice(0, -1));
    const patch = draft.preview().patch;
    expect(patch).toContain(
      '+properties: {"name": "Alice", "float": 1.0}\n\\ No newline at end of file\n'
    );
    expect(draft.data.entries[0]?.body).toBe(body.slice(0, -1));
    await draft.submit();
    expect(calls.find((call) => call.route === "object/patch")?.body["patch"]).toBe(patch);
  });

  it("discards obsolete verification when explicit remote adoption changes the source during a read", async () => {
    const { draft, records, handlers } = await harness();
    await draft.start("n:1");
    await draft.save();
    const slot = required(draft.slot);
    const entry = required(draft.data.entries[0]);
    const pending = Promise.withResolvers<unknown>();
    handlers.set("object/read-text", () => pending.promise);
    const checking = draft.verify();
    await vi.waitFor(() => {
      expect(draft.loading).toBe(true);
    });
    slot.remote = {
      id: slot.id,
      kind: "draft",
      revision: "9",
      deleted: false,
      lastMutationId: "remote",
      data: draftData({
        ...draft.data,
        entries: [{ ...entry, body: body.replace("Alice", "adopted input") }]
      })
    };
    slot.useRemote();
    handlers.set("object/read-text", () => ({
      state: stateA,
      results: [{ kind: "knowledge-node", ref: "n:1", body }]
    }));
    pending.resolve({ state: stateA, results: [{ kind: "knowledge-node", ref: "n:1", body }] });
    expect(await checking).toBe(false);
    await vi.waitFor(() => {
      expect(draft.verified).toBe(true);
    });
    expect(draft.data.entries[0]?.body).toContain("adopted input");
    expect(draft.review).toBeUndefined();
    expect(records.slots).toHaveLength(1);
  });

  it("keeps adopted input intact when a successful in-flight Knowledge write must save its receipt separately", async () => {
    const { draft, records, handlers } = await harness();
    await draft.start("n:1");
    await draft.save();
    const oldSlot = required(draft.slot);
    const entry = required(draft.data.entries[0]);
    draft.setInput("n:1", ["properties", "name"], '"submitted"');
    draft.preview();
    const pending = Promise.withResolvers<unknown>();
    handlers.set("object/patch", () => pending.promise);
    const sending = draft.submit();
    await vi.waitFor(() => {
      expect(draft.busy).toBe(true);
    });
    const adopted = draftData({
      ...draft.data,
      status: "editing",
      patch: "",
      entries: [{ ...entry, body: body.replace("Alice", "remote input") }]
    });
    oldSlot.remote = {
      id: oldSlot.id,
      kind: "draft",
      revision: "9",
      deleted: false,
      lastMutationId: "remote",
      data: adopted
    };
    oldSlot.useRemote();
    draft.remove("n:1", ["properties", "name"]);
    expect(draft.input("n:1", ["properties", "name"])).toBe('"submitted"');
    pending.resolve({ state: stateB, created: [], transitions: [] });
    expect(await sending).toMatchObject({ state: stateB });
    expect(records.slots).toHaveLength(2);
    expect(oldSlot.data).toEqual(adopted);
    expect(draft.slot).not.toBe(oldSlot);
    expect(draft.data.entries[0]?.body).toContain("submitted");
    expect(draft.receiptSaved).toBe(true);
  });

  it("retains malformed remote records and reconciles missing objects/branches as bounded evidence only", async () => {
    const { draft, handlers } = await harness();
    await draft.start("n:1");
    await draft.save();
    const slot = required(draft.slot);
    slot.remote = {
      id: slot.id,
      kind: "draft",
      revision: "9",
      deleted: false,
      lastMutationId: "remote",
      data: { version: 1, subtype: "object", entries: [null] }
    };
    slot.useRemote();
    expect(draft.data.status).toBe("unknown");
    expect(draft.canSubmit).toBe(false);
    handlers.set("object/read-text", () => rejected("OBJECT_NOT_FOUND"));
    handlers.set("evolution/history", () => ({ root: stateA, items: [], cursor: "more" }));
    await draft.reconcile();
    expect(draft.evidence).toMatchObject({
      objects: [{ ref: "n:1", error: "rejected OBJECT_NOT_FOUND (OBJECT_NOT_FOUND)" }],
      limited: true
    });
    handlers.set("evolution/branch/list", () => ({ items: [] }));
    await draft.reconcile();
    expect(draft.error).toContain("目标 Branch 不存在");
    expect(await draft.submit()).toBeUndefined();
  });
});

describe("unknown write recovery and explicit editing inputs", () => {
  it("preserves unknown outcomes through authentication recovery and bounded reconciliation without resend or guessed alias mapping", async () => {
    const { draft, handlers, connection, context, records, calls } = await harness();
    await draft.start(undefined);
    draft.addNew("knowledge-relationship", "edge");
    const first = draft.data.entries[0]?.ref ?? "";
    const edge = draft.data.entries[1]?.ref ?? "";
    draft.set(edge, ["type"], "LINK");
    draft.set(edge, ["start"], first);
    draft.set(edge, ["end"], first);
    draft.preview();
    handlers.set("object/patch", () => {
      throw new TypeError("response lost");
    });
    expect(await draft.submit()).toBeUndefined();
    expect(draft.data.status).toBe("unknown");
    expect(draft.data.receipt).toBeUndefined();
    const restored = new ObjectDraft(connection, context, records, draft.slot);
    cleanups.push(() => {
      restored.dispose();
    });
    await restored.start(undefined);
    expect(restored.data.status).toBe("unknown");
    expect(restored.editable).toBe(false);
    handlers.set("evolution/history", () => ({ root: stateA, items: [], cursor: "more" }));
    await restored.reconcile();
    expect(restored.evidence).toMatchObject({ head: stateA, objects: [], limited: true });
    expect(restored.error).toContain("不能推断");
    expect(await restored.submit()).toBeUndefined();
    expect(calls.filter((call) => call.route === "object/patch")).toHaveLength(1);
    connection.disconnect();
    expect(await restored.verify()).toBe(false);
  });

  it("keeps daemon validation diagnostics, direct Ref transitions and returned aliases", async () => {
    const { draft, handlers } = await harness();
    await draft.start("n:1");
    draft.preview();
    handlers.set("object/patch", () =>
      Response.json(
        {
          code: "CONSTRAINT_ERROR",
          message: "unique failed",
          details: { ref: "n:1", path: "/properties/name" }
        },
        { status: 409 }
      )
    );
    expect(await draft.submit()).toBeUndefined();
    expect(draft.data.status).toBe("editing");
    expect(draft.backendDetails).toMatchObject({ ref: "n:1", path: "/properties/name" });
    expect(draft.data.entries[0]?.body).toBe(body);
    await draft.verify();
    draft.preview();
    handlers.set("object/patch", () => ({
      state: stateB,
      created: [{ kind: "knowledge-node", alias: "new", ref: "n:9" }],
      transitions: [{ from: "r:1", to: "r:99" }]
    }));
    expect(await draft.submit()).toMatchObject({
      created: [{ alias: "new", ref: "n:9" }],
      transitions: [{ from: "r:1", to: "r:99" }]
    });
  });

  it("adopts only the explicit accepted remote version then rechecks its original base", async () => {
    const { draft, records } = await harness();
    await draft.start("n:1");
    await draft.save();
    const slot = required(draft.slot);
    const entry = required(draft.data.entries[0]);
    const data = draftData({
      ...draft.data,
      entries: [{ ...entry, body: body.replace("Alice", "remote") }]
    });
    const remote: WebRecord = {
      id: slot.id,
      kind: "draft",
      revision: "9",
      deleted: false,
      lastMutationId: "remote",
      data
    };
    slot.remote = remote;
    slot.useRemote();
    await vi.waitFor(() => {
      expect(draft.verified).toBe(true);
    });
    expect(draft.data.entries[0]?.body).toContain("remote");
    draft.set("n:1", ["properties", "name"], "new local");
    expect((records.slots[0]?.data["entries"] as { body: string }[])[0]?.body).toContain(
      "new local"
    );
  });

  it("retains explicit entry deletion/new removal and refusal of malformed or duplicate targets", async () => {
    const { draft, handlers } = await harness();
    await draft.start("n:1");
    expect(await draft.addExisting("n:1")).toBe(false);
    draft.markDelete("n:1");
    expect(draft.preview().patch).toContain("deleted file mode 100644");
    draft.markDelete("n:1");
    expect(draft.data.entries[0]?.deleted).toBe(false);
    draft.addNew("knowledge-node", "a");
    draft.markDelete("new:knowledge-node:a");
    expect(draft.data.entries).toHaveLength(1);
    draft.addNew("knowledge-node", "a");
    expect(() => {
      draft.addNew("knowledge-node", "a");
    }).toThrow("已声明该 kind / alias");
    draft.markDelete("new:knowledge-node:a");
    handlers.set("object/read", () => ({ state: stateB, results: [] }));
    expect(await draft.addExisting("n:2")).toBe(false);
    expect(draft.error).toContain("同一完整 State");
    draft.update("missing", body);
    draft.mutate("missing", () => body);
    draft.markDelete("missing");
    expect(draft.data.entries).toHaveLength(1);
    draft.remove("n:1", ["properties", "name"]);
    draft.append("n:1", ["labels"], '"Author"');
    expect(draft.preview().issues).toEqual([]);
    expect(await draft.saveReceipt()).toBe(false);
  });
});
