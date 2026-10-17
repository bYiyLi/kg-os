# StateClearDataResult

Commit whose mutable State Data was removed.

```ts
export interface StateClearDataResult {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
}
```

## Fields

| Name    | Type            | Notes                                                                               |
| ------- | --------------- | ----------------------------------------------------------------------------------- |
| `state` | `ResolvedState` | Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. |

## Related types

- `sdk/types/ResolvedState.md`
