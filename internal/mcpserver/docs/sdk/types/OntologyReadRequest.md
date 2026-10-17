# OntologyReadRequest

Read Ontology overview or selected definitions at one pinned State.

```ts
export interface OntologyReadRequest {
  /** StateRef to resolve and pin for the entire read. Accepts commit/<id>, branch/<name>, or tag/<name>. */
  at: StateRef;
  /** Public Object or Ontology refs to fetch in a single pinned read; each ref must exist in that State. */
  refs?: string[];
  /** Maximum number of items on this page. Must satisfy the server's method-specific range. */
  limit?: number;
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}
```

## Fields

| Name      | Type       | Notes                                                                                               |
| --------- | ---------- | --------------------------------------------------------------------------------------------------- |
| `at`      | `StateRef` | StateRef to resolve and pin for the entire read. Accepts commit/<id>, branch/<name>, or tag/<name>. |
| `refs?`   | `string[]` | Public Object or Ontology refs to fetch in a single pinned read; each ref must exist in that State. |
| `limit?`  | `number`   | Maximum number of items on this page. Must satisfy the server's method-specific range.              |
| `cursor?` | `string`   | Opaque continuation token returned by a preceding page; reuse the same query context.               |

## Related types

- `sdk/types/StateRef.md`
