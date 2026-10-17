# EvolutionChange

One public Object change at a logical JSON Pointer.

```ts
export interface EvolutionChange {
  /** Logical change kind, such as add, update, delete, rename or restructure. */
  change: string;
  /** Public KG OS Object kind; distinguishes schema aggregates and Knowledge elements. */
  kind: ObjectKind;
  /** RFC 6901 JSON Pointer into the public logical Object representation. */
  path: string;
  /** Public Object Ref in the before State if present. */
  beforeRef?: string;
  /** Public Object Ref in the after State if present. */
  afterRef?: string;
  /** Other public Objects affected by the same shared resource change. */
  relatedRefs?: string[];
  /** Public JSON value before this logical Object change, if present. */
  before?: JsonValue;
  /** Public JSON value after this logical Object change, if present. */
  after?: JsonValue;
}
```

## Fields

| Name           | Type         | Notes                                                                             |
| -------------- | ------------ | --------------------------------------------------------------------------------- |
| `change`       | `string`     | Logical change kind, such as add, update, delete, rename or restructure.          |
| `kind`         | `ObjectKind` | Public KG OS Object kind; distinguishes schema aggregates and Knowledge elements. |
| `path`         | `string`     | RFC 6901 JSON Pointer into the public logical Object representation.              |
| `beforeRef?`   | `string`     | Public Object Ref in the before State if present.                                 |
| `afterRef?`    | `string`     | Public Object Ref in the after State if present.                                  |
| `relatedRefs?` | `string[]`   | Other public Objects affected by the same shared resource change.                 |
| `before?`      | `JsonValue`  | Public JSON value before this logical Object change, if present.                  |
| `after?`       | `JsonValue`  | Public JSON value after this logical Object change, if present.                   |

## Related types

- `sdk/types/JsonValue.md`
- `sdk/types/ObjectKind.md`
