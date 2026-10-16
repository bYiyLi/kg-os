# EvolutionAncestryRequest

Page through ancestors of a Branch/Tag/Commit.

```ts
export interface EvolutionAncestryRequest {
  /** StateRef whose reachable history/ancestors are traversed. */
  root: StateRef;
  /** Maximum number of items on this page. Must satisfy the server's method-specific range. */
  limit?: number;
  /** Opaque continuation token returned by a preceding page; reuse the same query context. */
  cursor?: string;
}
```

## Fields

| Name      | Type       | Notes                                                                                  |
| --------- | ---------- | -------------------------------------------------------------------------------------- |
| `root`    | `StateRef` | StateRef whose reachable history/ancestors are traversed.                              |
| `limit?`  | `number`   | Maximum number of items on this page. Must satisfy the server's method-specific range. |
| `cursor?` | `string`   | Opaque continuation token returned by a preceding page; reuse the same query context.  |

## Related types

- `docs.read('sdk/types/StateRef.md')`
