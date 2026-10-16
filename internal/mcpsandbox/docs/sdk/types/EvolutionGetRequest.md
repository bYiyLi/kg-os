# EvolutionGetRequest

Resolve and inspect a specific StateRef.

```ts
export interface EvolutionGetRequest {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: StateRef;
}
```

## Fields

| Name    | Type       | Notes                                                                               |
| ------- | ---------- | ----------------------------------------------------------------------------------- |
| `state` | `StateRef` | Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. |

## Related types

- `docs.read('sdk/types/StateRef.md')`
