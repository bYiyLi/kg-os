# ObjectReadItem

One requested Object with its public logical JSON value.

```ts
export interface ObjectReadItem {
  /** Public KG OS Object kind; distinguishes schema aggregates and Knowledge elements. */
  kind: ObjectKind;
  /** Canonical public Object identity. Do not treat a mutable title or business key as identity. */
  ref: string;
  /** Public JSON representation of the requested Ontology or Knowledge Object. */
  value: JsonValue;
}
```

## Fields

| Name    | Type         | Notes                                                                                       |
| ------- | ------------ | ------------------------------------------------------------------------------------------- |
| `kind`  | `ObjectKind` | Public KG OS Object kind; distinguishes schema aggregates and Knowledge elements.           |
| `ref`   | `string`     | Canonical public Object identity. Do not treat a mutable title or business key as identity. |
| `value` | `JsonValue`  | Public JSON representation of the requested Ontology or Knowledge Object.                   |

## Related types

- `docs.read('sdk/types/JsonValue.md')`
- `docs.read('sdk/types/ObjectKind.md')`
