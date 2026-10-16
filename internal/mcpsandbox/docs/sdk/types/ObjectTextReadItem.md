# ObjectTextReadItem

One canonical editable YAML body for an Object.

```ts
export interface ObjectTextReadItem {
  /** Public KG OS Object kind; distinguishes schema aggregates and Knowledge elements. */
  kind: ObjectKind;
  /** Canonical public Object identity. Do not treat a mutable title or business key as identity. */
  ref: string;
  /** Canonical YAML text for editing; construct a Git Extended Diff from this body. */
  body: string;
}
```

## Fields

| Name   | Type         | Notes                                                                                       |
| ------ | ------------ | ------------------------------------------------------------------------------------------- |
| `kind` | `ObjectKind` | Public KG OS Object kind; distinguishes schema aggregates and Knowledge elements.           |
| `ref`  | `string`     | Canonical public Object identity. Do not treat a mutable title or business key as identity. |
| `body` | `string`     | Canonical YAML text for editing; construct a Git Extended Diff from this body.              |

## Related types

- `docs.read('sdk/types/ObjectKind.md')`
