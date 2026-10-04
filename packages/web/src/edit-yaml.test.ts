import { describe, expect, it } from "vitest";

import {
  blankBody,
  entryPatch,
  newRef,
  objectPatch,
  targetRef,
  type DraftEntry,
  OBJECT_KINDS
} from "./edit-patch.js";
import { impactNotes, validateDraft, validateEntry } from "./edit-validation.js";
import {
  appendYaml,
  removeYaml,
  setYamlRaw,
  setYamlValue,
  yamlDocument,
  yamlFormSafe,
  yamlKeys,
  yamlNode,
  yamlRaw,
  yamlString,
  yamlStrings,
  YAML_LIMITS
} from "./edit-yaml.js";
import { draftData, readDraft } from "./edit-data.js";
import { stateA } from "./version-test-support.js";

const typedBody =
  'labels: ["Person"]\nproperties:\n  "big": {$type: "Integer", value: "9223372036854775807"}\n  "float": 1.0\n  "negative": -0.0\n  "date": {$type: "Date", value: "2026-10-04"}\n  "text": |+\n    one\n    two\n\n';
const entry = (body = typedBody): DraftEntry => ({
  kind: "knowledge-node",
  ref: "n:1",
  base: typedBody,
  body,
  deleted: false
});

describe("lossless Object YAML and Git framing", () => {
  it("changes only a scalar range and retains typed values and string code points", () => {
    const changed = setYamlValue(typedBody, ["labels"], ["Person", "Author"]);
    expect(changed.slice(changed.indexOf("properties:"))).toBe(
      typedBody.slice(typedBody.indexOf("properties:"))
    );
    expect(yamlStrings(changed, ["labels"])).toEqual(["Person", "Author"]);
    const renamed = setYamlRaw(
      removeYaml(changed, ["properties", "big"]),
      ["properties", "integer"],
      yamlRaw(changed, ["properties", "big"])
    );
    expect(yamlRaw(renamed, ["properties", "integer"])).toContain('"9223372036854775807"');
    expect(yamlRaw(renamed, ["properties", "float"])).toBe("1.0");
    expect(yamlRaw(renamed, ["properties", "negative"])).toBe("-0.0");
    expect(yamlString(renamed, ["properties", "text"])).toBe("one\ntwo\n\n");
    expect(yamlKeys(renamed, ["properties"])).toContain("integer");
    expect(yamlKeys(renamed, ["missing"])).toEqual([]);
    expect(yamlNode(renamed, ["missing"])).toBeUndefined();
    expect(yamlRaw(renamed, ["missing"])).toBe("");
    expect(yamlString(renamed, ["properties", "float"])).toBe("");
    expect(yamlStrings(renamed, ["properties"])).toEqual([]);
  });

  it("keeps float lexical type, explicit null, omitted fields and ordered compound declarations distinct", () => {
    let body = setYamlRaw(
      "labels: []\nproperties: {}\n",
      ["properties", "x"],
      "9223372036854775807"
    );
    body = setYamlRaw(body, ["properties", "y"], "1.0");
    body = setYamlValue(body, ["properties", "z"], null);
    expect(yamlRaw(body, ["properties", "x"])).toBe("9223372036854775807");
    expect(yamlRaw(body, ["properties", "y"])).toBe("1.0");
    expect(validateEntry(entry(body)).some((issue) => issue.message.includes("null"))).toBe(true);
    body = removeYaml(body, ["properties", "z"]);
    expect(yamlKeys(body, ["properties"])).toEqual(["x", "y"]);
    const domain = appendYaml('name: "Content"\nincludes: []\n', ["includes"], '"node:Person"');
    expect(yamlStrings(domain, ["includes"])).toEqual(["node:Person"]);
    expect(yamlStrings(removeYaml(domain, ["includes", 0]), ["includes"])).toEqual([]);
    expect(() => removeYaml(domain, ["name", 0])).toThrow("无法移除");
    expect(() => appendYaml(domain, ["name"], "x")).toThrow("不是列表");
    expect(() => setYamlRaw(domain, ["missing", 0], "x")).toThrow("无法定位");
  });

  it("rejects duplicate keys, custom tags, cycles, expansion and text/depth budgets while permitting finite aliases", () => {
    expect(() => yamlDocument("x: 1\nx: 2\n")).toThrow();
    expect(() => yamlDocument("x: !unsupported value")).toThrow();
    expect(() => yamlDocument("x: &x [*x]")).toThrow("循环");
    expect(() => yamlDocument(`x: ${"[".repeat(70)}0${"]".repeat(70)}`)).toThrow("预算");
    expect(() => yamlDocument("x".repeat(YAML_LIMITS.bytes + 1))).toThrow("文本预算");
    expect(yamlDocument("x: &x [1, 2]\ny: *x").toJS()).toMatchObject({ x: [1n, 2n], y: [1n, 2n] });
    expect(yamlFormSafe("x: &x [1, 2]\ny: *x")).toBe(false);
    expect(yamlFormSafe("x: 1.0")).toBe(true);
    expect(() => setYamlRaw("x: &x 1\ny: *x", ["y"], "2")).toThrow("无法无损");
    expect(() => setYamlRaw("x: 1", ["x"], "*unknown")).toThrow();
  });

  it("builds ordinary Add/Update/Delete/Rename entries and explicit no-op framing", () => {
    const added = {
      ...entry(),
      ref: newRef("knowledge-node", "张 三"),
      base: "",
      body: "labels: []\nproperties: {}\n"
    };
    expect(added.ref).toBe("new:knowledge-node:%E5%BC%A0%20%E4%B8%89");
    expect(entryPatch(added)).toContain("new file mode 100644\n--- /dev/null\n+++ b/new:");
    const deleted = entryPatch({ ...entry(), deleted: true });
    expect(deleted).toContain("deleted file mode 100644");
    expect(deleted).toContain("+++ /dev/null");
    const rename: DraftEntry = {
      kind: "node-definition",
      ref: "node:Old",
      base: 'name: "Old"\nproperties: [{name: "x", type: "STRING"}]\nconstraints: []\n',
      body: 'name: "New Name"\nproperties: [{name: "x", type: "STRING"}]\nconstraints: []',
      deleted: false
    };
    expect(targetRef(rename)).toBe("node:New%20Name");
    expect(entryPatch(rename)).toContain("rename from node:Old\nrename to node:New%20Name");
    expect(entryPatch(rename)).toContain("\\ No newline at end of file");
    expect(entryPatch(entry())).toContain('-  "float": 1.0');
    expect(entryPatch(entry())).toContain('+  "float": 1.0');
    expect(objectPatch([added, rename]).match(/diff --git/g)).toHaveLength(2);
    expect(() => newRef("knowledge-node", "")).toThrow();
    expect(() => newRef("domain", "a\nb")).toThrow();
    expect(() => newRef("domain", "a".repeat(256))).toThrow();
    expect(newRef("domain", "!'()*")).toBe("new:domain:%21%27%28%29%2A");
    for (const kind of OBJECT_KINDS) expect(blankBody(kind)).not.toBe("");
  });
});

describe("aggregate profile and persisted draft validation", () => {
  it("rejects malformed aggregate arrays, rule placement and shared target identity with precise paths", () => {
    const definition = { ...entry(), kind: "node-definition" as const, ref: "node:Thing" };
    const malformed =
      'name: "Thing"\nproperties: [null, {name: 7, type: false, title: null, constraints: null, indexes: null}]\nconstraints: [null, {name: "", type: false, properties: [7]}]\nindexes: [null, {name: "empty", type: 3, properties: [], targets: []}, {name: "many", type: "vector", properties: ["a", "b"], targets: ["relationship:LINK"]}]\n';
    const paths = validateEntry({ ...definition, body: malformed }).map((issue) => issue.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/properties/0",
        "/properties/1/name",
        "/properties/1/type",
        "/properties/1/title",
        "/properties/1/constraints",
        "/properties/1/indexes",
        "/constraints/0",
        "/constraints/1/name",
        "/constraints/1/type",
        "/constraints/1/properties",
        "/indexes/0",
        "/indexes/1/type",
        "/indexes/1/properties",
        "/indexes/1/targets",
        "/indexes/2/properties",
        "/indexes/2/targets"
      ])
    );
    const nonLists =
      'name: "Thing"\nproperties: [{name: "a", type: "STRING"}]\nconstraints: {}\nindexes: {}\n';
    expect(validateEntry({ ...definition, body: nonLists }).map((issue) => issue.path)).toEqual([
      "/constraints",
      "/indexes"
    ]);
    const rename = {
      ...definition,
      base: nonLists,
      body: nonLists.replace('name: "Thing"', 'name: "New"')
    };
    expect(impactNotes(rename).join(" ")).toContain("identifying rename：node:Thing → node:New");
    const deleted = {
      ...definition,
      deleted: true,
      base: nonLists.replace(
        "indexes: {}",
        "indexes: [null, {name: shared, type: fulltext, targets: [node:Thing, node:Other], properties: [a]}]"
      )
    };
    expect(impactNotes(deleted).join(" ")).toContain("node:Other");
    expect(impactNotes(deleted).join(" ")).toContain(
      "若其他 target 存活，需在同一 Patch 显式调整或删除共享规则"
    );
    expect(impactNotes(deleted).join(" ")).not.toContain("删除全局共享索引 shared");
  });

  it("validates canonical aliases and nullable endpoints without coercing non-string values", () => {
    const relationship = { ...entry(), kind: "knowledge-relationship" as const };
    const valid = 'type: "LINK"\nstart: "new:knowledge-node:a%20b"\nend: "n:2"\nproperties: {}\n';
    expect(validateEntry({ ...relationship, body: valid })).toEqual([]);
    const invalid = 'type: "LINK"\nstart: 7\nend: "new:knowledge-node:%zz"\nproperties: {}\n';
    expect(validateEntry({ ...relationship, body: invalid }).map((issue) => issue.path)).toEqual([
      "/start",
      "/end"
    ]);
    expect(
      validateEntry({ ...relationship, body: valid.replace("a%20b", "%61") }).map(
        (issue) => issue.path
      )
    ).toEqual(["/start"]);
    const domain = {
      ...entry(),
      kind: "domain" as const,
      body: 'name: "Research"\nincludes: ["new:domain:x", "new:node-definition:n", "new:relationship-definition:r"]\n'
    };
    expect(validateEntry(domain)).toEqual([]);
    expect(
      validateEntry({
        ...domain,
        body: domain.body.replace("new:domain:x", "new:knowledge-node:x")
      }).map((issue) => issue.path)
    ).toEqual(["/includes"]);
  });

  it("protects the last field, nullable endpoints and local/shared/index separation", () => {
    const definition: DraftEntry = {
      ...entry(),
      kind: "relationship-definition",
      ref: "relationship:LINK",
      body: 'name: "LINK"\nfrom: null\nto: "node:Person"\nproperties: [{name: "source", type: "STRING", required: true, unique: true}]\nconstraints: []\n'
    };
    expect(validateEntry(definition)).toEqual([]);
    expect(
      validateEntry({ ...definition, body: blankBody("relationship-definition") }).map(
        (issue) => issue.path
      )
    ).toContain("/properties");
    const bad = `${definition.body}indexes: [{name: "bad", type: "range", targets: ["node:Person"], properties: ["source"]}]\n`;
    expect(validateEntry({ ...definition, body: bad }).map((issue) => issue.message)).toContain(
      "Range / Text / Point 保持 Definition-local，不支持 targets"
    );
    const shared = `${definition.body}indexes: [{name: "shared", type: "fulltext", targets: ["relationship:LINK", "relationship:OTHER"], properties: ["source"]}]\n`;
    expect(validateEntry({ ...definition, body: shared })).toEqual([]);
    expect(impactNotes({ ...definition, base: shared }).join(" ")).toContain("relationship:OTHER");
    expect(impactNotes({ ...definition, base: shared }).join(" ")).toContain("全局共享索引 shared");
    expect(impactNotes({ ...entry(), deleted: true }).join(" ")).toContain("incident");
    expect(impactNotes({ ...entry(), kind: "domain", deleted: true }).join(" ")).toContain(
      "不删除成员"
    );
    expect(impactNotes({ ...entry(), kind: "knowledge-relationship" }).join(" ")).toContain(
      "replacement"
    );
  });

  it("locates duplicate, malformed, unsupported and reserved input without discarding text", () => {
    expect(validateDraft([])).toHaveLength(1);
    expect(
      validateDraft([entry(), entry()]).some((issue) => issue.message.includes("一个 entry"))
    ).toBe(true);
    expect(validateEntry(entry("[unfinished"))).toHaveLength(1);
    expect(validateEntry(entry("[]"))).toHaveLength(1);
    const invalid = entry(
      'labels: ["Person", "Person", "__kgos_internal"]\nproperties: {"": null, "v": {$type: "Vector"}}\nunknown: 1\n'
    );
    expect(validateEntry(invalid).map((issue) => issue.path)).toEqual(
      expect.arrayContaining(["/labels", "/properties/", "/properties/v", "/unknown"])
    );
    expect(
      validateEntry({
        ...entry(),
        kind: "knowledge-relationship",
        body: 'type: ""\nstart: "node:Person"\nend: "n:01"\nproperties: []\n'
      })
    ).toHaveLength(4);
    const properties =
      'name: "Person"\nlabels: ["Person"]\nproperties: [{name: "x", type: "VECTOR<3>", required: "yes", unique: null, renameFrom: "", constraints: [{type: "type"}], indexes: [{name: "", type: "weird"}]}, {name: "x", type: ""}]\nconstraints: [{type: "key", properties: ["x"]}]\nindexes: []\n';
    expect(
      validateEntry({ ...entry(), kind: "node-definition", body: properties }).map(
        (issue) => issue.path
      )
    ).toEqual(
      expect.arrayContaining([
        "/labels",
        "/properties/0/type",
        "/properties/0/required",
        "/properties/0/unique",
        "/properties/1/name",
        "/constraints/0/properties"
      ])
    );
    expect(
      validateEntry({
        ...entry(),
        kind: "domain",
        body: 'name: "Content"\ntitle: null\nincludes: ["node:%54hing", "domain:%zz"]\n'
      })
    ).toHaveLength(3);
    expect(validateEntry({ ...entry(), kind: "domain", deleted: true, body: "{ broken" })).toEqual(
      []
    );
  });

  it("round-trips unfinished input and real receipts without turning pending markers into retries", () => {
    const data = {
      baseState: stateA,
      branch: "main",
      entries: [entry("{ incomplete")],
      inputs: { "n:1|/properties/x": "[unfinished" },
      status: "pending" as const,
      patch: "frozen bytes",
      receipt: undefined
    };
    expect(readDraft(draftData(data))).toMatchObject({
      entries: [{ body: "{ incomplete" }],
      inputs: data.inputs,
      status: "unknown",
      patch: "frozen bytes"
    });
    const receipt = {
      state: stateA,
      created: [{ kind: "knowledge-node" as const, alias: "a", ref: "n:7" }],
      transitions: [{ from: "r:1", to: "r:9" }]
    };
    expect(readDraft(draftData({ ...data, status: "committed", receipt })).receipt).toEqual(
      receipt
    );
    expect(() => readDraft({ version: 1, subtype: "merge" })).toThrow();
    expect(() => readDraft({ ...draftData(data), baseState: "branch/main" })).toThrow();
    expect(() => readDraft({ ...draftData(data), entries: [null] })).toThrow();
    expect(() => readDraft({ ...draftData(data), inputs: { x: 1 } })).toThrow();
    expect(() =>
      readDraft({
        ...draftData(data),
        receipt: { state: stateA, created: [], transitions: [null] }
      })
    ).toThrow();
    expect(() =>
      readDraft({
        ...draftData(data),
        receipt: {
          state: stateA,
          created: [{ kind: "unknown", alias: "a", ref: "n:7" }],
          transitions: []
        }
      })
    ).toThrow();
    expect(() => readDraft({ ...draftData(data), receipt: {} })).toThrow();
  });
});
