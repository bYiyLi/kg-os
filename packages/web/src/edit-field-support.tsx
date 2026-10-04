import { isScalar } from "yaml";

import { type ObjectDraft } from "./edit-controller.js";
import { type DraftEntry } from "./edit-patch.js";
import { yamlNode, yamlString, yamlStrings, type YAMLPath } from "./edit-yaml.js";

export interface EntryFieldsProps {
  draft: ObjectDraft;
  entry: DraftEntry;
}
export interface FieldProps extends EntryFieldsProps {
  path: YAMLPath;
  label: string;
  optional?: boolean;
}

export function fieldId(ref: string, path: YAMLPath): string {
  return `field-${encodeURIComponent(ref)}-${encodeURIComponent(path.join("/"))}`;
}

export function StringField({ draft, entry, path, label, optional = false }: FieldProps) {
  const id = fieldId(entry.ref, path);
  const value = yamlString(entry.body, path);
  return (
    <div className="field-row">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        disabled={!draft.editable}
        onChange={(event) => {
          draft.set(entry.ref, path, event.target.value);
        }}
      />
      {optional && yamlNode(entry.body, path) !== undefined && (
        <button
          disabled={!draft.editable}
          onClick={() => {
            draft.remove(entry.ref, path);
          }}
        >
          省略{label}
        </button>
      )}
    </div>
  );
}

export function StringsField({ draft, entry, path, label }: FieldProps) {
  const values = yamlStrings(entry.body, path);
  return (
    <fieldset className="field-list" disabled={!draft.editable}>
      <legend>
        {label} · {values.length}
      </legend>
      {values.map((value, index) => (
        <div className="field-row" key={index}>
          <label className="sr-only" htmlFor={fieldId(entry.ref, [...path, index])}>
            {label} {index + 1}
          </label>
          <input
            id={fieldId(entry.ref, [...path, index])}
            value={value}
            onChange={(event) => {
              const next = [...values];
              next[index] = event.target.value;
              draft.set(entry.ref, path, next);
            }}
          />
          <button
            aria-label={`移除${label} ${String(index + 1)}`}
            onClick={() => {
              draft.set(
                entry.ref,
                path,
                values.filter((_, item) => item !== index)
              );
            }}
          >
            移除
          </button>
        </div>
      ))}
      <button
        onClick={() => {
          draft.set(entry.ref, path, [...values, ""]);
        }}
      >
        添加{label}
      </button>
    </fieldset>
  );
}

export function BooleanField({ draft, entry, path, label }: FieldProps) {
  const node = yamlNode(entry.body, path);
  const checked = isScalar(node) && node.value === true;
  return (
    <label className="checkbox-field">
      <input
        type="checkbox"
        checked={checked}
        disabled={!draft.editable}
        onChange={(event) => {
          if (event.target.checked) draft.set(entry.ref, path, true);
          else draft.remove(entry.ref, path);
        }}
      />
      {label}
    </label>
  );
}

export function NullableRefField(props: FieldProps) {
  const { draft, entry, path, label } = props;
  const node = yamlNode(entry.body, path);
  const unlimited = isScalar(node) && node.value === null;
  return (
    <div className="field-row">
      <label htmlFor={fieldId(entry.ref, path)}>{label}</label>
      <input
        id={fieldId(entry.ref, path)}
        value={unlimited ? "" : yamlString(entry.body, path)}
        disabled={!draft.editable || unlimited}
        placeholder="node:Definition 或 new:node-definition:alias"
        onChange={(event) => {
          draft.set(entry.ref, path, event.target.value);
        }}
      />
      <label>
        <input
          type="checkbox"
          checked={unlimited}
          disabled={!draft.editable}
          onChange={(event) => {
            draft.set(entry.ref, path, event.target.checked ? null : "");
          }}
        />
        此端不限制类型（null）
      </label>
    </div>
  );
}
