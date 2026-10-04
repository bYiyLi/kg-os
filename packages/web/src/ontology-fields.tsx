import { isScalar, isSeq } from "yaml";

import {
  type EntryFieldsProps,
  BooleanField,
  NullableRefField,
  StringField,
  StringsField,
  fieldId
} from "./edit-field-support.js";
import {
  appendYaml,
  removeYaml,
  setYamlValue,
  yamlNode,
  yamlString,
  yamlStrings,
  type YAMLPath
} from "./edit-yaml.js";

function countItems(body: string, path: YAMLPath): number {
  const node = yamlNode(body, path);
  return isSeq(node) ? node.items.length : 0;
}

function propertyRename({ draft, entry }: EntryFieldsProps, index: number, name: string) {
  const path: YAMLPath = ["properties", index];
  const current = yamlString(entry.body, [...path, "name"]);
  let original = yamlString(entry.body, [...path, "renameFrom"]);
  const base = entry.base === "" ? undefined : yamlNode(entry.base, ["properties"]);
  if (
    original === "" &&
    isSeq(base) &&
    base.items.some((_, item) => yamlString(entry.base, ["properties", item, "name"]) === current)
  )
    original = current;
  draft.mutate(entry.ref, (body) => {
    let next = setYamlValue(body, [...path, "name"], name);
    if (original !== "") {
      next =
        original === name
          ? removeYaml(next, [...path, "renameFrom"])
          : setYamlValue(next, [...path, "renameFrom"], original);
    }
    return next;
  });
}

function DefinitionProperty(props: EntryFieldsProps & { index: number; count: number }) {
  const { draft, entry, index, count } = props;
  const path: YAMLPath = ["properties", index];
  const name = yamlString(entry.body, [...path, "name"]);
  const rename = yamlString(entry.body, [...path, "renameFrom"]);
  return (
    <section className="definition-property" aria-label={`字段 ${String(index + 1)}`}>
      <div className="field-row">
        <label htmlFor={fieldId(entry.ref, [...path, "name"])}>字段名称</label>
        <input
          id={fieldId(entry.ref, [...path, "name"])}
          value={name}
          disabled={!draft.editable}
          onChange={(event) => {
            propertyRename(props, index, event.target.value);
          }}
        />
        <button
          disabled={!draft.editable || count <= 1}
          onClick={() => {
            draft.remove(entry.ref, path);
          }}
        >
          删除字段 {name}
        </button>
      </div>
      <StringField {...props} path={[...path, "type"]} label="字段类型" />
      <div className="actions">
        <BooleanField {...props} path={[...path, "required"]} label="required · 必填" />
        <BooleanField {...props} path={[...path, "unique"]} label="unique · 唯一" />
      </div>
      {rename !== "" && <small>显式字段连续性 renameFrom：{rename}</small>}
      <details>
        <summary>字段说明与内部规则</summary>
        <StringField {...props} path={[...path, "title"]} label="字段标题" optional />
        <StringField {...props} path={[...path, "description"]} label="字段说明" optional />
        <RuleList {...props} path={[...path, "constraints"]} type="constraint" local />
        <RuleList {...props} path={[...path, "indexes"]} type="index" local />
      </details>
    </section>
  );
}

interface RuleProps extends EntryFieldsProps {
  path: YAMLPath;
  type: "constraint" | "index";
  local?: boolean;
}

function addRule({ draft, entry, path, type, local = false }: RuleProps) {
  const raw = type === "constraint" ? '{"type": "unique"}' : '{"name": "", "type": "range"}';
  const withProperties = local ? raw : `${raw.slice(0, -1)}, "properties": []}`;
  draft.mutate(entry.ref, (body) => {
    if (isSeq(yamlNode(body, path))) return appendYaml(body, path, withProperties);
    return setYamlValue(body, path, []);
  });
  if (countItems(entry.body, path) === 0) draft.append(entry.ref, path, withProperties);
}

function RuleFields({ draft, entry, path, type, local = false }: RuleProps) {
  const current = yamlString(entry.body, [...path, "type"]);
  const shared = type === "index" && yamlNode(entry.body, [...path, "targets"]) !== undefined;
  const indexTypes = [
    ["range", "Range"],
    ["text", "Text"],
    ["point", "Point"],
    ["fulltext", "全文"],
    ["vector", "托管语义"]
  ];
  const choices =
    type === "constraint"
      ? [
          ["unique", "unique"],
          ["key", "key"]
        ]
      : indexTypes;
  let deleteLabel = `删除${type === "index" ? "索引" : "约束"}`;
  if (shared) deleteLabel = "删除全局共享索引";
  return (
    <div className="aggregate-rule">
      <StringField
        draft={draft}
        entry={entry}
        path={[...path, "name"]}
        label={type === "index" ? "索引名称" : "约束名称"}
        optional={type === "constraint"}
      />
      <label htmlFor={fieldId(entry.ref, [...path, "type"])}>
        {type === "index" ? "索引类型" : "约束类型"}
      </label>
      <select
        id={fieldId(entry.ref, [...path, "type"])}
        value={current}
        disabled={!draft.editable}
        onChange={(event) => {
          draft.set(entry.ref, [...path, "type"], event.target.value);
        }}
      >
        {choices.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {!local && (
        <StringsField draft={draft} entry={entry} path={[...path, "properties"]} label="有序字段" />
      )}
      {shared && (
        <StringsField
          draft={draft}
          entry={entry}
          path={[...path, "targets"]}
          label="全部 targets"
        />
      )}
      {!local &&
        !shared &&
        type === "index" &&
        (current === "fulltext" || current === "vector") && (
          <button
            disabled={!draft.editable}
            onClick={() => {
              draft.set(entry.ref, [...path, "targets"], [entry.ref]);
            }}
          >
            设置共享 targets
          </button>
        )}
      {shared && (
        <p className="warning">
          此索引为全局资源；删除会影响全部 targets。修改覆盖范围请编辑 targets。
        </p>
      )}
      <button
        className="danger"
        disabled={!draft.editable}
        onClick={() => {
          draft.remove(entry.ref, path);
        }}
      >
        {deleteLabel}
      </button>
    </div>
  );
}

function RuleList(props: RuleProps) {
  const { draft, entry, path, type } = props;
  const count = countItems(entry.body, path);
  return (
    <section className="aggregate-rules">
      <header className="section-header">
        <h4>
          {type === "index" ? "索引" : "约束"} · {count}
        </h4>
        <button
          disabled={!draft.editable}
          onClick={() => {
            addRule(props);
          }}
        >
          添加{type === "index" ? "索引" : "约束"}
        </button>
      </header>
      {Array.from({ length: count }, (_, index) => (
        <RuleFields key={index} {...props} path={[...path, index]} />
      ))}
    </section>
  );
}

function ModelProperties(props: EntryFieldsProps) {
  const { draft, entry } = props;
  const count = countItems(entry.body, ["properties"]);
  return (
    <section>
      <header className="section-header">
        <h3>字段 · {count}</h3>
        <button
          disabled={!draft.editable}
          onClick={() => {
            draft.append(entry.ref, ["properties"], '{"name": "", "type": "STRING"}');
          }}
        >
          添加字段
        </button>
      </header>
      {Array.from({ length: count }, (_, index) => (
        <DefinitionProperty key={index} {...props} index={index} count={count} />
      ))}
      <small>
        两种 Definition 均至少一个字段。字段声明不会默认让 Knowledge 实例必填；required、unique、key
        与索引各自表达。
      </small>
    </section>
  );
}

export function DefinitionFields(props: EntryFieldsProps) {
  const { draft, entry } = props;
  const definition = entry.kind !== "domain";
  const from = yamlNode(entry.body, ["from"]);
  return (
    <section className="object-fields">
      <StringField {...props} path={["name"]} label="名称 · identifying name" />
      <StringField {...props} path={["title"]} label="标题 · 显示" optional />
      <StringField {...props} path={["description"]} label="说明" optional />
      {!definition && <StringsField {...props} path={["includes"]} label="直接成员 Ref" />}
      {entry.kind === "node-definition" && (
        <StringsField {...props} path={["labels"]} label="附加必需 Label" />
      )}
      {entry.kind === "relationship-definition" && (
        <>
          <NullableRefField {...props} path={["from"]} label="源端 Definition" />
          <NullableRefField {...props} path={["to"]} label="目标端 Definition" />
          <small>
            {isScalar(from) && from.value === null
              ? "源端不限制类型。"
              : "源端按指定 Definition 约束。"}
            端点是类型约束，不是关系数量或实例节点。
          </small>
        </>
      )}
      {definition && (
        <>
          <ModelProperties {...props} />
          <RuleList {...props} path={["constraints"]} type="constraint" />
          <RuleList {...props} path={["indexes"]} type="index" />
          <small>
            复合字段顺序保留。Range / Text / Point 为 Definition-local；仅全文 / 托管语义支持同 kind
            共享 targets。
          </small>
        </>
      )}
      {!definition && (
        <small>领域只是组织；允许多父和循环，不产生权限或 namespace，删除领域不删除成员。</small>
      )}
      {yamlStrings(entry.body, ["includes"]).length > 0 && (
        <span className="sr-only">领域直接成员已加载</span>
      )}
      <button
        className="danger"
        disabled={!draft.editable}
        onClick={() => {
          draft.markDelete(entry.ref);
        }}
      >
        删除{definition ? "定义" : "领域"}
      </button>
    </section>
  );
}
