# MergeListResult

Paginated Merge Session headers.

```ts
export interface MergeListResult {
  /** Items returned for this result or page. */
  items: MergeSessionSummary[];
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}
```

## Fields

| Name      | Type                    | Notes                                                                                 |
| --------- | ----------------------- | ------------------------------------------------------------------------------------- |
| `items`   | `MergeSessionSummary[]` | Items returned for this result or page.                                               |
| `cursor?` | `string`                | Opaque continuation token returned by a preceding page; reuse the same query context. |

## Related types

- `docs.read('sdk/types/MergeSessionSummary.md')`
