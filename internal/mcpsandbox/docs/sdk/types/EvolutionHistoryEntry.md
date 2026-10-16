# EvolutionHistoryEntry

One State/change pair; a State may contribute several entries.

```ts
export interface EvolutionHistoryEntry {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
  /** Immutable parent Commit references in ancestry order. */
  parents: ResolvedState[];
  /** One public change at this Commit; null preserves an explicit no-delta Commit in all-scope history. */
  change: EvolutionChange | null;
}
```

## Fields

| Name      | Type                | Notes                                                                               |
| --------- | ------------------- | ----------------------------------------------------------------------------------- |
| `state`   | `ResolvedState`     | Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. |
| `parents` | `ResolvedState[]`   | Immutable parent Commit references in ancestry order.                               |
| `change`  | `EvolutionChange \\ | null`                                                                               | One public change at this Commit; null preserves an explicit no-delta Commit in all-scope history. |

## Related types

- `docs.read('sdk/types/EvolutionChange.md')`
- `docs.read('sdk/types/ResolvedState.md')`
