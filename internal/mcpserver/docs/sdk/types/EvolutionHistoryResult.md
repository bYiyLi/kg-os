# EvolutionHistoryResult

Paginated history entries for a pinned root.

```ts
export interface EvolutionHistoryResult {
  /** Resolved immutable Commit from which history was read. */
  root: ResolvedState;
  /** Items returned for this result or page. */
  items: EvolutionHistoryEntry[];
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}
```

## Fields

| Name      | Type                      | Notes                                                                                 |
| --------- | ------------------------- | ------------------------------------------------------------------------------------- |
| `root`    | `ResolvedState`           | Resolved immutable Commit from which history was read.                                |
| `items`   | `EvolutionHistoryEntry[]` | Items returned for this result or page.                                               |
| `cursor?` | `string`                  | Opaque continuation token returned by a preceding page; reuse the same query context. |

## Related types

- `sdk/types/EvolutionHistoryEntry.md`
- `sdk/types/ResolvedState.md`
