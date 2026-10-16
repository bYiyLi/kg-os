# EvolutionDiffResult

Paginated public change set between two resolved States.

```ts
export interface EvolutionDiffResult {
  /** Resolved immutable Commit for the before-Snapshot. */
  before: ResolvedState;
  /** Resolved immutable Commit for the after-Snapshot. */
  after: ResolvedState;
  /** Items returned for this result or page. */
  items: EvolutionChange[];
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}
```

## Fields

| Name      | Type                | Notes                                                                                 |
| --------- | ------------------- | ------------------------------------------------------------------------------------- |
| `before`  | `ResolvedState`     | Resolved immutable Commit for the before-Snapshot.                                    |
| `after`   | `ResolvedState`     | Resolved immutable Commit for the after-Snapshot.                                     |
| `items`   | `EvolutionChange[]` | Items returned for this result or page.                                               |
| `cursor?` | `string`            | Opaque continuation token returned by a preceding page; reuse the same query context. |

## Related types

- `docs.read('sdk/types/EvolutionChange.md')`
- `docs.read('sdk/types/ResolvedState.md')`
