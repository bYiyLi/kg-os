# EvolutionAncestryResult

Ordered Commit ancestors with continuation cursor.

```ts
export interface EvolutionAncestryResult {
  /** Resolved immutable Commit from which the ancestry walk began. */
  root: ResolvedState;
  /** Items returned for this result or page. */
  items: StateSummary[];
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}
```

## Fields

| Name      | Type             | Notes                                                                                 |
| --------- | ---------------- | ------------------------------------------------------------------------------------- |
| `root`    | `ResolvedState`  | Resolved immutable Commit from which the ancestry walk began.                         |
| `items`   | `StateSummary[]` | Items returned for this result or page.                                               |
| `cursor?` | `string`         | Opaque continuation token returned by a preceding page; reuse the same query context. |

## Related types

- `sdk/types/ResolvedState.md`
- `sdk/types/StateSummary.md`
