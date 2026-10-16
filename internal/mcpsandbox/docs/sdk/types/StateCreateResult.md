# StateCreateResult

Created immutable Commit reference.

```ts
export interface StateCreateResult {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
}
```

## Fields

| Name    | Type            | Notes                                                                               |
| ------- | --------------- | ----------------------------------------------------------------------------------- |
| `state` | `ResolvedState` | Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. |

## Related types

- `docs.read('sdk/types/ResolvedState.md')`
