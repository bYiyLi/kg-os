import { type ObjectKind } from "@kgos/sdk";

import { type DraftEntry, refComponent, targetRef } from "./edit-patch.js";
import { yamlDocument } from "./edit-yaml.js";

export interface InputIssue {
  ref: string;
  path: string;
  message: string;
}
type Fields = Record<string, unknown>;
type Issue = (path: string, message: string) => void;
const fieldPath = (name: string) => name.replace(/~/g, "~0").replace(/\//g, "~1");

function fields(value: unknown): Fields | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Fields)
    : undefined;
}

function names(value: unknown, path: string, issue: Issue, optional = false): string[] {
  if (value === undefined && optional) return [];
  if (
    !Array.isArray(value) ||
    value.some((name: unknown) => typeof name !== "string" || name === "")
  ) {
    issue(path, "需要非空 String 列表");
    return [];
  }
  const result = value as string[];
  if (new Set(result).size !== result.length) issue(path, "列表不能有重复项");
  return result;
}

function knownKeys(value: Fields, allowed: string[], path: string, issue: Issue) {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) issue(`${path}/${fieldPath(key)}`, "未知字段");
}

function identifier(value: unknown, path: string, issue: Issue) {
  if (typeof value !== "string" || value === "") issue(path, "名称不能为空");
  else if (value.startsWith("__kgos_")) issue(path, "该前缀由 KG OS 内部保留");
}

function optionalStrings(value: Fields, path: string, issue: Issue) {
  for (const key of ["title", "description"]) {
    if (value[key] !== undefined && typeof value[key] !== "string")
      issue(`${path}/${key}`, "需要 String；省略与空字符串不同");
  }
}

function validRef(value: unknown, kinds: string[]): boolean {
  if (typeof value !== "string") return false;
  if (value.startsWith("n:")) return kinds.includes("n") && /^n:[1-9]\d*$/.test(value);
  const prefix = kinds.find(
    (kind) => ["node", "relationship", "domain"].includes(kind) && value.startsWith(`${kind}:`)
  );
  if (prefix !== undefined) {
    const name = value.slice(prefix.length + 1);
    try {
      return name !== "" && refComponent(decodeURIComponent(name)) === name;
    } catch {
      return false;
    }
  }
  const alias = /^new:([^:]+):(.+)$/.exec(value);
  if (alias === null || !kinds.includes(alias[1] ?? "")) return false;
  try {
    return refComponent(decodeURIComponent(alias[2] ?? "")) === alias[2];
  } catch {
    return false;
  }
}

function refField(value: unknown, kinds: string[], path: string, issue: Issue) {
  if (!validRef(value, kinds)) issue(path, "需要准确的 canonical Ref 或本次新对象 alias");
}

function rules(value: unknown, path: string, issue: Issue, local: boolean) {
  if (value === undefined && local) return;
  if (!Array.isArray(value)) {
    issue(path, "需要 Constraint 列表");
    return;
  }
  value.forEach((raw: unknown, index) => {
    const rule = fields(raw);
    const location = `${path}/${String(index)}`;
    if (rule === undefined) {
      issue(location, "需要 Constraint 对象");
      return;
    }
    knownKeys(rule, ["name", "type", ...(local ? [] : ["properties"])], location, issue);
    if (rule["name"] !== undefined) identifier(rule["name"], `${location}/name`, issue);
    if (rule["type"] !== "unique" && rule["type"] !== "key")
      issue(`${location}/type`, "Constraint type 只支持 unique / key");
    if (!local && names(rule["properties"], `${location}/properties`, issue).length < 2) {
      issue(`${location}/properties`, "顶层组合 Constraint 至少两个字段；单字段规则放在字段下");
    }
  });
}

function indexes(
  value: unknown,
  path: string,
  issue: Issue,
  options: { local: boolean; kind: ObjectKind }
) {
  const { local, kind } = options;
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issue(path, "需要 Index 列表");
    return;
  }
  value.forEach((raw: unknown, index) => {
    const entry = fields(raw);
    const location = `${path}/${String(index)}`;
    if (entry === undefined) {
      issue(location, "需要 Index 对象");
      return;
    }
    knownKeys(
      entry,
      ["name", "type", "targets", ...(local ? [] : ["properties"])],
      location,
      issue
    );
    identifier(entry["name"], `${location}/name`, issue);
    const type = entry["type"];
    if (
      !["range", "text", "point", "fulltext", "vector"].includes(
        typeof type === "string" ? type : ""
      )
    ) {
      issue(`${location}/type`, "Index type 不合法");
    }
    const properties = local
      ? ["field"]
      : names(entry["properties"], `${location}/properties`, issue);
    if (properties.length === 0) issue(`${location}/properties`, "索引至少需要一个字段");
    if (
      ["text", "point", "vector"].includes(typeof type === "string" ? type : "") &&
      properties.length !== 1
    ) {
      issue(`${location}/properties`, "该索引恰好使用一个字段");
    }
    indexTargets(entry, location, issue, kind);
  });
}

function indexTargets(entry: Fields, path: string, issue: Issue, kind: ObjectKind) {
  if (entry["targets"] === undefined) return;
  if (entry["type"] !== "fulltext" && entry["type"] !== "vector") {
    issue(`${path}/targets`, "Range / Text / Point 保持 Definition-local，不支持 targets");
  }
  const targets = names(entry["targets"], `${path}/targets`, issue);
  if (targets.length === 0) issue(`${path}/targets`, "显式 targets 不能为空");
  const prefix = kind === "node-definition" ? "node" : "relationship";
  for (const target of targets) refField(target, [prefix, kind], `${path}/targets`, issue);
}

function properties(value: unknown, issue: Issue, kind: ObjectKind) {
  if (!Array.isArray(value) || value.length === 0) {
    issue("/properties", "Definition 必须至少声明一个字段");
    return;
  }
  const seen = new Set<string>();
  value.forEach((raw: unknown, index) => {
    const entry = fields(raw);
    const path = `/properties/${String(index)}`;
    if (entry === undefined) {
      issue(path, "需要 Property 对象");
      return;
    }
    knownKeys(
      entry,
      [
        "name",
        "title",
        "description",
        "type",
        "required",
        "unique",
        "renameFrom",
        "constraints",
        "indexes"
      ],
      path,
      issue
    );
    identifier(entry["name"], `${path}/name`, issue);
    const name = typeof entry["name"] === "string" ? entry["name"] : "";
    if (seen.has(name)) issue(`${path}/name`, "字段名重复");
    seen.add(name);
    const type = entry["type"];
    if (typeof type !== "string" || type === "") issue(`${path}/type`, "字段 type 不能为空");
    else if (/\bVECTOR\b/i.test(type))
      issue(`${path}/type`, "Object profile 不支持 caller-owned Vector 字段");
    for (const key of ["required", "unique"]) {
      if (entry[key] !== undefined && typeof entry[key] !== "boolean")
        issue(`${path}/${key}`, "需要 Boolean");
    }
    if (entry["renameFrom"] !== undefined)
      identifier(entry["renameFrom"], `${path}/renameFrom`, issue);
    optionalStrings(entry, path, issue);
    rules(entry["constraints"], `${path}/constraints`, issue, true);
    indexes(entry["indexes"], `${path}/indexes`, issue, { local: true, kind });
  });
}

function knowledge(value: Fields, kind: ObjectKind, issue: Issue) {
  const node = kind === "knowledge-node";
  knownKeys(
    value,
    node ? ["labels", "properties"] : ["type", "start", "end", "properties"],
    "",
    issue
  );
  if (node)
    for (const label of names(value["labels"], "/labels", issue))
      identifier(label, "/labels", issue);
  else {
    identifier(value["type"], "/type", issue);
    for (const key of ["start", "end"])
      refField(value[key], ["n", "knowledge-node"], `/${key}`, issue);
  }
  const map = fields(value["properties"]);
  if (map === undefined) {
    issue("/properties", "需要 Property mapping");
    return;
  }
  for (const [name, property] of Object.entries(map)) {
    identifier(name, `/properties/${fieldPath(name)}`, issue);
    if (property === null)
      issue(
        `/properties/${fieldPath(name)}`,
        "null 不能持久化为 Knowledge Property；移除字段请显式选择删除"
      );
    if (fields(property)?.["$type"] === "Vector")
      issue(`/properties/${fieldPath(name)}`, "该 typed value 不在 Object profile 内");
  }
}

function ontology(value: Fields, kind: ObjectKind, issue: Issue) {
  identifier(value["name"], "/name", issue);
  optionalStrings(value, "", issue);
  if (kind === "domain") {
    knownKeys(value, ["name", "title", "description", "includes"], "", issue);
    for (const ref of names(value["includes"], "/includes", issue)) {
      refField(
        ref,
        ["domain", "node", "relationship", "node-definition", "relationship-definition"],
        "/includes",
        issue
      );
    }
    return;
  }
  const node = kind === "node-definition";
  knownKeys(
    value,
    [
      "name",
      "title",
      "description",
      "properties",
      "constraints",
      "indexes",
      ...(node ? ["labels"] : ["from", "to"])
    ],
    "",
    issue
  );
  if (node) {
    const labels = names(value["labels"], "/labels", issue, true);
    if (labels.includes(String(value["name"])))
      issue("/labels", "附加 Labels 不重复 identifying name");
  } else
    for (const key of ["from", "to"]) {
      if (value[key] !== null) refField(value[key], ["node", "node-definition"], `/${key}`, issue);
    }
  properties(value["properties"], issue, kind);
  rules(value["constraints"], "/constraints", issue, false);
  indexes(value["indexes"], "/indexes", issue, { local: false, kind });
}

export function validateEntry(entry: DraftEntry): InputIssue[] {
  if (entry.deleted) return [];
  const issues: InputIssue[] = [];
  const issue: Issue = (path, message) => {
    issues.push({ ref: entry.ref, path, message });
  };
  try {
    const value: unknown = yamlDocument(entry.body).toJS({ maxAliasCount: 50 });
    const body = fields(value);
    if (body === undefined) issue("", "Object body 必须是 YAML mapping");
    else if (entry.kind.startsWith("knowledge-")) knowledge(body, entry.kind, issue);
    else ontology(body, entry.kind, issue);
  } catch (error) {
    issue("", error instanceof Error ? error.message : "YAML 无法解析");
  }
  return issues;
}

export function validateDraft(entries: DraftEntry[]): InputIssue[] {
  const issues = entries.flatMap(validateEntry);
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.ref))
      issues.push({ ref: entry.ref, path: "", message: "同一 target 只能有一个 entry" });
    seen.add(entry.ref);
  }
  if (entries.length === 0) issues.push({ ref: "", path: "", message: "请明确新增或编辑一个对象" });
  return issues;
}

function sharedIndexes(body: string): Fields[] {
  const value: unknown = yamlDocument(body).toJS({ maxAliasCount: 50 });
  const indexes = fields(value)?.["indexes"];
  return Array.isArray(indexes)
    ? indexes.flatMap((raw: unknown): Fields[] => {
        const value = fields(raw);
        return value === undefined ? [] : [value];
      })
    : [];
}

function indexRemovalNotes(entry: DraftEntry): string[] {
  const after = entry.deleted ? [] : sharedIndexes(entry.body);
  return sharedIndexes(entry.base).flatMap((index) => {
    if (
      after.some((candidate) => candidate["name"] === index["name"]) ||
      !Array.isArray(index["targets"])
    )
      return [];
    const targets = index["targets"].map(String).join("、");
    return [
      entry.deleted
        ? `删除 Definition 不单独删除共享索引 ${String(index["name"])}；全部 targets：${targets}。若其他 target 存活，需在同一 Patch 显式调整或删除共享规则，否则提交拒绝。`
        : `删除全局共享索引 ${String(index["name"])}；全部 targets：${targets}`
    ];
  });
}

export function impactNotes(entry: DraftEntry): string[] {
  const notes: string[] = [];
  if (entry.deleted && entry.kind === "knowledge-node")
    notes.push(
      "节点有 incident 关系时会拒绝；需在本 Patch 明确处理关系。当前局部图不能证明全库依赖范围。"
    );
  if (entry.deleted && entry.kind === "domain")
    notes.push("删除领域仅移除组织与自身，不删除成员 Definition 或 Knowledge。");
  if (entry.kind === "knowledge-relationship")
    notes.push("改变 Type / 端点可能 replacement；仅依据回执中的直接 Ref transition 导航。");
  if (!entry.kind.endsWith("definition")) return notes;
  notes.push(
    "模型收紧或删除可能与现有 Knowledge / Schema 依赖冲突；最终提交验证，不自动修复数据。"
  );
  if (entry.base === "") return notes;
  notes.push(...indexRemovalNotes(entry));
  if (targetRef(entry) !== entry.ref)
    notes.push(
      `identifying rename：${entry.ref} → ${targetRef(entry)}。title / description 只改变说明。`
    );
  return notes;
}
