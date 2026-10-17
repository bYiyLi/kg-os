# CreatedObject

Alias-to-ref mapping for newly created Objects in a Patch.

```ts
export interface CreatedObject {
  /** Request-local alias assigned to a newly created Object. */
  alias: string;
  /** Public KG OS Object kind; distinguishes schema aggregates and Knowledge elements. */
  kind: ObjectKind;
  /** Canonical public Object identity. Do not treat a mutable title or business key as identity. */
  ref: string;
}
```

## Fields

| Name    | Type         | Notes                                                                                       |
| ------- | ------------ | ------------------------------------------------------------------------------------------- |
| `alias` | `string`     | Request-local alias assigned to a newly created Object.                                     |
| `kind`  | `ObjectKind` | Public KG OS Object kind; distinguishes schema aggregates and Knowledge elements.           |
| `ref`   | `string`     | Canonical public Object identity. Do not treat a mutable title or business key as identity. |

## Related types

- `sdk/types/ObjectKind.md`
