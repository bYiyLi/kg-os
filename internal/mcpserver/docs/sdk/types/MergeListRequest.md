# MergeListRequest

Paginate open Merge Sessions.

```ts
export interface MergeListRequest {
  /** Maximum number of items on this page. Must satisfy the server's method-specific range. */
  limit?: number;
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}
```

## Fields

| Name      | Type     | Notes                                                                                  |
| --------- | -------- | -------------------------------------------------------------------------------------- |
| `limit?`  | `number` | Maximum number of items on this page. Must satisfy the server's method-specific range. |
| `cursor?` | `string` | Opaque continuation token returned by a preceding page; reuse the same query context.  |
