# MergeConflictsRequest

Paginate conflicts of one Merge Session.

```ts
export interface MergeConflictsRequest {
  /** Identifier of a Merge Session; retrieve it before resolving or finalizing. */
  session: string;
  /** Maximum number of items on this page. Must satisfy the server's method-specific range. */
  limit?: number;
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}
```

## Fields

| Name      | Type     | Notes                                                                                  |
| --------- | -------- | -------------------------------------------------------------------------------------- |
| `session` | `string` | Identifier of a Merge Session; retrieve it before resolving or finalizing.             |
| `limit?`  | `number` | Maximum number of items on this page. Must satisfy the server's method-specific range. |
| `cursor?` | `string` | Opaque continuation token returned by a preceding page; reuse the same query context.  |
