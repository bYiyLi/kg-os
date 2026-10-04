import { isMap, isScalar, isSeq } from "yaml";

import { type EntryFieldsProps, StringField, StringsField, fieldId } from "./edit-field-support.js";
import {
  yamlDocument,
  yamlFormSafe,
  yamlKeys,
  yamlNode,
  yamlRaw,
  type YAMLPath
} from "./edit-yaml.js";
import { DefinitionFields } from "./ontology-fields.js";

export { fieldId, type EntryFieldsProps } from "./edit-field-support.js";

function KnowledgeProperty({ draft, entry, name }: EntryFieldsProps & { name: string }) {
  const path: YAMLPath = ["properties", name];
  const node = yamlNode(entry.body, path);
  const editable = isScalar(node) && node.range !== undefined;
  const id = fieldId(entry.ref, path);
  return (
    <div className="knowledge-property">
      <label htmlFor={`${id}-name`}>Property 名称</label>
      <input
        id={`${id}-name`}
        value={name}
        disabled={!draft.editable}
        onChange={(event) => {
          draft.renameKey(entry.ref, path, event.target.value);
        }}
      />
      <label htmlFor={id}>{name} · YAML 值</label>
      <textarea
        id={id}
        value={draft.input(entry.ref, path) ?? yamlRaw(entry.body, path)}
        readOnly={!editable}
        disabled={!draft.editable}
        onChange={(event) => {
          draft.setInput(entry.ref, path, event.target.value);
        }}
        spellCheck={false}
        rows={2}
      />
      {!editable && <small>该 typed / 复合值保留原值；完整 YAML 中可显式修改。</small>}
      <button
        disabled={!draft.editable}
        onClick={() => {
          draft.remove(entry.ref, path);
        }}
      >
        删除 Property {name}
      </button>
    </div>
  );
}

function KnowledgeFields({ draft, entry }: EntryFieldsProps) {
  const names = yamlKeys(entry.body, ["properties"]);
  return (
    <section className="object-fields">
      {entry.kind === "knowledge-node" ? (
        <StringsField draft={draft} entry={entry} path={["labels"]} label="Label" />
      ) : (
        <>
          <StringField draft={draft} entry={entry} path={["type"]} label="Relationship Type" />
          <StringField draft={draft} entry={entry} path={["start"]} label="源节点 Ref" />
          <StringField draft={draft} entry={entry} path={["end"]} label="目标节点 Ref" />
          <small>
            实例端点为 n: Ref 或本 Patch 新节点 alias；Definition 的 from/to 是独立的类型约束。
          </small>
        </>
      )}
      <h3>Properties · {names.length}</h3>
      {names.map((name, index) => (
        <KnowledgeProperty key={index} draft={draft} entry={entry} name={name} />
      ))}
      <button
        disabled={!draft.editable}
        onClick={() => {
          let index = names.length + 1;
          while (names.includes(`property-${String(index)}`)) index += 1;
          draft.set(entry.ref, ["properties", `property-${String(index)}`], "");
        }}
      >
        添加 Property
      </button>
      <small>
        String 使用引号；Integer / Float 保留 YAML 类型。删除与 null 分别表达，null 不能持久化为
        Knowledge Property。
      </small>
    </section>
  );
}

export function EntryFields({ draft, entry }: EntryFieldsProps) {
  try {
    const document = yamlDocument(entry.body);
    if (!isMap(document.contents)) throw new Error("需要完整 YAML mapping");
    if (!yamlFormSafe(entry.body))
      throw new Error("YAML 使用 anchor / alias；继续编辑完整 YAML，表单保持原值");
    if (entry.kind === "knowledge-node" && !isSeq(yamlNode(entry.body, ["labels"])))
      throw new Error("labels 需要列表");
    if (entry.kind.startsWith("knowledge-") && !isMap(yamlNode(entry.body, ["properties"])))
      throw new Error("properties 需要 mapping");
    if (entry.kind.startsWith("knowledge-")) return <KnowledgeFields draft={draft} entry={entry} />;
    return <DefinitionFields draft={draft} entry={entry} />;
  } catch (error) {
    return (
      <p role="status">
        表单暂不可用：{error instanceof Error ? error.message : "无法解析"}。原文保留，可继续在完整
        YAML 中修改。
      </p>
    );
  }
}
