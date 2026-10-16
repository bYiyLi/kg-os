# EvolutionOverviewResult

Default Branch and its currently resolved State.

```ts
export interface EvolutionOverviewResult {
  /** Current default Branch name (not a StateRef). */
  defaultBranch: string;
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
}
```

## Fields

| Name            | Type            | Notes                                                                               |
| --------------- | --------------- | ----------------------------------------------------------------------------------- |
| `defaultBranch` | `string`        | Current default Branch name (not a StateRef).                                       |
| `state`         | `ResolvedState` | Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. |

## Related types

- `docs.read('sdk/types/ResolvedState.md')`
