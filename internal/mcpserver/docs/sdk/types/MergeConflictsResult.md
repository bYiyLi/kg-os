# MergeConflictsResult

Conflict items paired with the current Session revision.

```ts
export interface MergeConflictsResult {
  /** Identifier of a Merge Session; retrieve it before resolving or finalizing. */
  session: string;
  /** Current optimistic Merge Session revision. */
  revision: number;
  /** Items returned for this result or page. */
  items: MergeConflict[];
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}
```

## Fields

| Name       | Type              | Notes                                                                                 |
| ---------- | ----------------- | ------------------------------------------------------------------------------------- |
| `session`  | `string`          | Identifier of a Merge Session; retrieve it before resolving or finalizing.            |
| `revision` | `number`          | Current optimistic Merge Session revision.                                            |
| `items`    | `MergeConflict[]` | Items returned for this result or page.                                               |
| `cursor?`  | `string`          | Opaque continuation token returned by a preceding page; reuse the same query context. |

## Related types

- `sdk/types/MergeConflict.md`
