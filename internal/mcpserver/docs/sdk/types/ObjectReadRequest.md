# ObjectReadRequest

Batch-read public Object refs from a single State snapshot.

```ts
export interface ObjectReadRequest {
  /** StateRef to resolve and pin for the entire read. Accepts commit/<id>, branch/<name>, or tag/<name>. */
  at: StateRef;
  /** Public Object or Ontology refs to fetch in a single pinned read; each ref must exist in that State. */
  refs: string[];
}
```

## Fields

| Name   | Type       | Notes                                                                                               |
| ------ | ---------- | --------------------------------------------------------------------------------------------------- |
| `at`   | `StateRef` | StateRef to resolve and pin for the entire read. Accepts commit/<id>, branch/<name>, or tag/<name>. |
| `refs` | `string[]` | Public Object or Ontology refs to fetch in a single pinned read; each ref must exist in that State. |

## Related types

- `sdk/types/StateRef.md`
