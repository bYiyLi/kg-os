# EvolutionDiffRequest

Compare two States in a requested public change scope.

```ts
export interface EvolutionDiffRequest {
  /** StateRef resolved to the immutable before-Snapshot. */
  before: StateRef;
  /** StateRef resolved to the immutable after-Snapshot. */
  after: StateRef;
  /** Public history/diff scope: all, ontology, knowledge or object. */
  scope: string;
  /** When scope=object, provide an anchor State and canonical public Object ref. */
  object?: EvolutionObjectFilter;
  /** Maximum number of items on this page. Must satisfy the server's method-specific range. */
  limit?: number;
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}
```

## Fields

| Name      | Type                    | Notes                                                                                  |
| --------- | ----------------------- | -------------------------------------------------------------------------------------- |
| `before`  | `StateRef`              | StateRef resolved to the immutable before-Snapshot.                                    |
| `after`   | `StateRef`              | StateRef resolved to the immutable after-Snapshot.                                     |
| `scope`   | `string`                | Public history/diff scope: all, ontology, knowledge or object.                         |
| `object?` | `EvolutionObjectFilter` | When scope=object, provide an anchor State and canonical public Object ref.            |
| `limit?`  | `number`                | Maximum number of items on this page. Must satisfy the server's method-specific range. |
| `cursor?` | `string`                | Opaque continuation token returned by a preceding page; reuse the same query context.  |

## Related types

- `docs.read('sdk/types/EvolutionObjectFilter.md')`
- `docs.read('sdk/types/StateRef.md')`
