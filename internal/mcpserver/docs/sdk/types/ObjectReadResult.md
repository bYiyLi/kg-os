# ObjectReadResult

Batch Object read result with the immutable resolved State.

```ts
export interface ObjectReadResult {
  /** Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. */
  state: ResolvedState;
  /** Requested public Object values in the same pinned Snapshot. */
  results: ObjectReadItem[];
}
```

## Fields

| Name      | Type               | Notes                                                                               |
| --------- | ------------------ | ----------------------------------------------------------------------------------- |
| `state`   | `ResolvedState`    | Resolved immutable Commit reference. Returned values use commit/<64-lowercase-hex>. |
| `results` | `ObjectReadItem[]` | Requested public Object values in the same pinned Snapshot.                         |

## Related types

- `sdk/types/ObjectReadItem.md`
- `sdk/types/ResolvedState.md`
