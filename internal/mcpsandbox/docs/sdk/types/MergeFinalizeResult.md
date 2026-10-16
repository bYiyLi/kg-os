# MergeFinalizeResult

Result of merged, fast-forwarded or already up-to-date finalization.

```ts
export interface MergeFinalizeResult {
  /** Finalization outcome: up_to_date, fast_forward, or merged. */
  status: MergeFinalizeStatus;
  /** Target Branch's pinned resolved Commit for this Merge Session. */
  targetState: ResolvedState;
  /** Resolved source Commit for this Merge Session. */
  sourceState: ResolvedState;
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
}
```

## Fields

| Name          | Type                  | Notes                                                                               |
| ------------- | --------------------- | ----------------------------------------------------------------------------------- |
| `status`      | `MergeFinalizeStatus` | Finalization outcome: up_to_date, fast_forward, or merged.                          |
| `targetState` | `ResolvedState`       | Target Branch's pinned resolved Commit for this Merge Session.                      |
| `sourceState` | `ResolvedState`       | Resolved source Commit for this Merge Session.                                      |
| `state`       | `ResolvedState`       | Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. |

## Related types

- `docs.read('sdk/types/MergeFinalizeStatus.md')`
- `docs.read('sdk/types/ResolvedState.md')`
