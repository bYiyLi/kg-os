# EvolutionHistoryRequest

Find changes reachable from a State, optionally scoped to an Object.

```ts
export interface EvolutionHistoryRequest {
  /** StateRef whose reachable history/ancestors are traversed. */
  root: StateRef;
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
| `root`    | `StateRef`              | StateRef whose reachable history/ancestors are traversed.                              |
| `scope`   | `string`                | Public history/diff scope: all, ontology, knowledge or object.                         |
| `object?` | `EvolutionObjectFilter` | When scope=object, provide an anchor State and canonical public Object ref.            |
| `limit?`  | `number`                | Maximum number of items on this page. Must satisfy the server's method-specific range. |
| `cursor?` | `string`                | Opaque continuation token returned by a preceding page; reuse the same query context.  |

## Related types

- `docs.read('sdk/types/EvolutionObjectFilter.md')`
- `docs.read('sdk/types/StateRef.md')`
