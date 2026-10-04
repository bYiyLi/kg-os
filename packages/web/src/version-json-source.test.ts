import { describe, expect, it } from "vitest";

import {
  jsonArraySources,
  jsonSourceField,
  stableSourceJSON,
  validSourceJSON
} from "./json-source.js";
import { jsonValue } from "./version-operation.js";
import { StateDataDraft, StateDetail } from "./version-state.js";
import { detail, stateA, versionHarness } from "./version-test-support.js";

function dataResponse(source: string, hasData = true): Response {
  const envelope = JSON.stringify({ ...detail(), hasData });
  return new Response(envelope.replace('"data":null', `"data":${source}`));
}

describe("exact State Data response source", () => {
  it("extracts the top-level data including nested values and escaped keys without reading nested data fields", () => {
    const value =
      '{"z":[1.0,-0.0,1e400,{"message":"quoted \\"data\\": and \\\\ brace }"}],"t\\u0079ped":{"$type":"Integer","value":"9007199254740993"}}';
    const envelope = `{"meta":{"data":false},"d\\u0061ta":${value},"tail":["data",null]}`;
    expect(jsonSourceField(envelope, "data")).toBe(value);
    expect(jsonSourceField('{"data":1,"d\\u0061ta":2}', "data")).toBe("2");
    expect(jsonSourceField('{"meta":{"data":1}}', "data")).toBeUndefined();
    expect(jsonSourceField("[]", "data")).toBeUndefined();
    expect(jsonSourceField("{}", "data")).toBeUndefined();
  });

  it("compares JSON members and strings independently of layout while retaining numeric families and signs", () => {
    expect(stableSourceJSON(' {"z":[1.0,-0.0,1e400],"a":"\\u0061"} ')).toBe(
      '{"a":"a","z":[1.0,-0.0,1e400]}'
    );
    expect(stableSourceJSON('{"z":true,"a":null,"m":{},"l":[]}')).toBe(
      stableSourceJSON('{"l":[],"m":{},"a":null,"z":true}')
    );
    expect(stableSourceJSON("1.0")).not.toBe(stableSourceJSON("1"));
    expect(stableSourceJSON("-0.0")).not.toBe(stableSourceJSON("0.0"));
    expect(stableSourceJSON("9007199254740993")).not.toBe(stableSourceJSON("9007199254740992"));
    expect(stableSourceJSON('{"a":1,"a":2}')).toBe('{"a":2}');
    expect(validSourceJSON("{")).toBeUndefined();
    expect(validSourceJSON(1)).toBeUndefined();
    expect(validSourceJSON("1e400")).toBe("1e400");
  });

  it("extracts exact array elements and rejects another root value", () => {
    const nested = `{"escaped":${JSON.stringify(' ] " [ \\ ')}, "data":[2.0]}`;
    const values = ["1.0", "-0.0", "1e400", nested, "[null,true]"];
    expect(jsonArraySources(` [ ${values.join(", ")} ] `)).toEqual(values);
    expect(jsonArraySources("[]")).toEqual([]);
    expect(() => jsonArraySources("{}")).toThrow(TypeError);
    expect(() => jsonArraySources("[1,")).toThrow(SyntaxError);
  });

  it("initializes the editor from the actual normalized response and detects external Float to Integer changes", async () => {
    const harness = await versionHarness();
    const original =
      '{"integer":{"$type":"Integer","value":"9007199254740993"},"typed":1.0,"negative":-0.0}';
    const changed =
      '{"integer":{"$type":"Integer","value":"9007199254740993"},"typed":1,"negative":-0.0}';
    harness.handlers.set("evolution/get", () => dataResponse(original));
    const metadata = new StateDetail(harness.connection);
    await metadata.open(stateA);
    expect(metadata.dataSource).toBe(original);
    const model = new StateDataDraft(
      harness.connection,
      stateA,
      { ...(metadata.value ?? detail()), dataSource: original },
      harness.records
    );
    expect(model.text).toBe(original);
    model.edit(original);
    expect(model.slot?.data["observedSource"]).toBe(original);
    harness.handlers.set("evolution/get", () => dataResponse(changed));
    await model.check();
    expect(model.changedSidecar).toBe(true);
    expect(model.precisionKnown).toBe(true);
    expect(model.text).toBe(original);
    await model.submit();
    expect(harness.calls.some((call) => call.route === "evolution/state/set-data")).toBe(false);
    const restored = new StateDataDraft(
      harness.connection,
      stateA,
      { ...detail(), hasData: true, data: jsonValue(changed), dataSource: changed },
      harness.records
    );
    expect(restored.observedSource).toBe(original);
    expect(restored.changedSidecar).toBe(true);
    expect(restored.text).toBe(original);
    harness.records.stop();
  });

  it("keeps canonical set receipts independently from raw input and handles absence versus explicit null", async () => {
    const harness = await versionHarness();
    const normalized = '{"$type":"Integer","value":"9007199254740993"}';
    harness.handlers.set(
      "evolution/state/set-data",
      () => new Response(`{"state":${JSON.stringify(stateA)},"data":${normalized}}`)
    );
    harness.handlers.set("evolution/state/clear-data", () => ({ state: stateA }));
    const model = new StateDataDraft(
      harness.connection,
      stateA,
      { ...detail(), dataSource: "null" },
      harness.records
    );
    model.edit("9007199254740993");
    await model.submit();
    expect(model.text).toBe("9007199254740993");
    expect(model.liveSource).toBe(normalized);
    expect(model.slot?.data["observedSource"]).toBe(normalized);
    model.edit("unfinished {", "clear");
    await model.submit();
    expect(model.live.hasData).toBe(false);
    expect(model.liveSource).toBe("null");
    harness.handlers.set("evolution/get", () => dataResponse("null"));
    await model.check();
    expect(model.changedSidecar).toBe(true);
    model.acknowledge();
    expect(model.live.hasData).toBe(true);
    expect(model.observedSource).toBe("null");
    harness.records.stop();
  });

  it("preserves legacy raw drafts and requires a fresh precise read before comparing incomplete observed data", async () => {
    const harness = await versionHarness();
    const record = harness.records.add("draft", {
      version: 1,
      subtype: "state-data",
      state: stateA,
      hasData: true,
      data: { typed: 1 },
      intent: "set",
      text: '{"typed":1.0}',
      pending: false
    });
    const model = new StateDataDraft(
      harness.connection,
      stateA,
      { ...detail(), hasData: true, data: { typed: 1 } },
      harness.records
    );
    expect(model.precisionKnown).toBe(false);
    expect(model.checked).toBe(false);
    model.acknowledge();
    await model.submit();
    expect(model.text).toBe('{"typed":1.0}');
    expect(harness.calls.some((call) => call.route === "evolution/state/set-data")).toBe(false);
    harness.handlers.set("evolution/get", () => dataResponse('{"typed":1}'));
    await model.check();
    model.acknowledge();
    expect(model.precisionKnown).toBe(true);
    expect(record.data["observedSource"]).toBe('{"typed":1}');
    expect(model.text).toBe('{"typed":1.0}');
    record.edit({ ...record.data, observedSource: "broken {" });
    const malformed = new StateDataDraft(
      harness.connection,
      stateA,
      { ...detail(), hasData: true, data: { typed: 1 }, dataSource: '{"typed":1}' },
      harness.records
    );
    expect(malformed.precisionKnown).toBe(false);
    expect(malformed.changedSidecar).toBe(true);
    harness.records.stop();
  });
});
