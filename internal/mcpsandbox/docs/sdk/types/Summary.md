# Summary

Brief Ontology entry returned inside overview or Domain listings.

```ts
export interface Summary {
  /** Public KG OS Object kind; distinguishes schema aggregates and Knowledge elements. */
  kind: ObjectKind;
  /** Canonical public Object identity. Do not treat a mutable title or business key as identity. */
  ref: string;
  /** Declared name of this Ontology resource; the ref is its public identity. */
  name: string;
  /** Optional human-facing title; not an identifying Ref. */
  title?: string;
  /** Optional explanatory text; not a constraint or an ID. */
  description?: string;
  /** Source Node Definition ref for a Relationship Definition. */
  from?: string;
  /** Target Node Definition ref for a Relationship Definition. */
  to?: string;
}
```

## Fields

| Name           | Type         | Notes                                                                                       |
| -------------- | ------------ | ------------------------------------------------------------------------------------------- |
| `kind`         | `ObjectKind` | Public KG OS Object kind; distinguishes schema aggregates and Knowledge elements.           |
| `ref`          | `string`     | Canonical public Object identity. Do not treat a mutable title or business key as identity. |
| `name`         | `string`     | Declared name of this Ontology resource; the ref is its public identity.                    |
| `title?`       | `string`     | Optional human-facing title; not an identifying Ref.                                        |
| `description?` | `string`     | Optional explanatory text; not a constraint or an ID.                                       |
| `from?`        | `string`     | Source Node Definition ref for a Relationship Definition.                                   |
| `to?`          | `string`     | Target Node Definition ref for a Relationship Definition.                                   |

## Related types

- `docs.read('sdk/types/ObjectKind.md')`
